import assert from "node:assert/strict";
import test from "node:test";
import type { BrowserContext, Frame, Page } from "playwright";
import { RuntimeContexts, validateDefinitions } from "../src/contexts.js";
import { DriverFailure } from "../src/protocol.js";

test("portable context graphs reject cycles, excessive depth, and origin mismatch", () => {
  const allowed = new Set(["https://members.example", "https://login.example"]);
  assert.throws(() => validateDefinitions({
    one: { kind: "frame", parent: "two", origin: "https://login.example", name: "One" },
    two: { kind: "frame", parent: "one", origin: "https://login.example", name: "Two" },
  }, allowed), DriverFailure);
  assert.throws(() => validateDefinitions({
    one: { kind: "frame", parent: "main", origin: "https://login.example", name: "One" },
    two: { kind: "frame", parent: "one", origin: "https://login.example", name: "Two" },
    three: { kind: "frame", parent: "two", origin: "https://login.example", name: "Three" },
    four: { kind: "frame", parent: "three", origin: "https://login.example", name: "Four" },
    five: { kind: "frame", parent: "four", origin: "https://login.example", name: "Five" },
  }, allowed), DriverFailure);
  assert.throws(() => validateDefinitions({
    external: { kind: "popup", parent: "main", origin: "https://evil.invalid" },
  }, allowed), (error: unknown) => error instanceof DriverFailure && error.code === "origin_rejected");
});

test("only a reviewed main navigation may start from about:blank", async () => {
  let url = "about:blank";
  const main = {
    url: () => url,
    mainFrame: () => ({ childFrames: () => [] }),
    isClosed: () => false,
  } as unknown as Page;
  const runtime = new RuntimeContexts(fakeContext([main]), main, undefined, new Set(["https://members.example"]));

  assert.equal(await runtime.navigationTarget("main"), main);
  await assert.rejects(() => runtime.target("main"), (error: unknown) =>
    error instanceof DriverFailure && error.code === "origin_rejected");

  url = "https://members.example/login";
  assert.equal(await runtime.navigationTarget("main"), main);
  url = "https://evil.invalid/login";
  await assert.rejects(() => runtime.navigationTarget("main"), (error: unknown) =>
    error instanceof DriverFailure && error.code === "origin_rejected");
});

test("frames resolve uniquely by direct parent, exact origin, path, and name", async () => {
  const login = fakeFrame("https://login.example/embedded/login", "Login");
  const main = fakePage("https://members.example/dashboard", [login]);
  const context = fakeContext([main]);
  const runtime = new RuntimeContexts(context, main, {
    login_frame: { kind: "frame", parent: "main", origin: "https://login.example", path: "/embedded/login", name: "Login" },
  }, new Set(["https://members.example", "https://login.example"]));
  assert.equal(await runtime.target("login_frame"), login);
  await runtime.resolveAll();

  const duplicate = fakeFrame("https://login.example/embedded/login", "Login");
  const ambiguousMain = fakePage("https://members.example/dashboard", [login, duplicate]);
  const ambiguous = new RuntimeContexts(fakeContext([ambiguousMain]), ambiguousMain, {
    login_frame: { kind: "frame", parent: "main", origin: "https://login.example", path: "/embedded/login", name: "Login" },
  }, new Set(["https://members.example", "https://login.example"]));
  await assert.rejects(() => ambiguous.target("login_frame"), (error: unknown) =>
    error instanceof DriverFailure && error.code === "ambiguous_locator");
});

test("popups must be declared, explicitly registered, and exactly inventoried", async () => {
  const main = fakePage("https://members.example/dashboard", []);
  const pages = [main];
  const context = fakeContext(pages);
  const runtime = new RuntimeContexts(context, main, {
    idp_popup: { kind: "popup", parent: "main", origin: "https://login.example" },
  }, new Set(["https://members.example", "https://login.example"]));
  await assert.rejects(() => runtime.resolveAll(), DriverFailure);
  const popup = fakePage("https://login.example/", []);
  pages.push(popup);
  runtime.registerPopup("idp_popup", "main", popup);
  await runtime.resolveAll();
  pages.push(fakePage("https://login.example/extra", []));
  assert.throws(() => runtime.assertNoExtraPages(), DriverFailure);
});

test("cached frames and popups are revalidated for identity, ambiguity, origin, and detachment", async () => {
  let frameURL = "https://login.example/embedded/login";
  let detached = false;
  const frame = {
    url: () => frameURL,
    name: () => "Login",
    childFrames: () => [],
    isDetached: () => detached,
  } as unknown as Frame;
  const children: Frame[] = [frame];
  const main = fakePage("https://members.example/dashboard", children);
  const pages = [main];
  const runtime = new RuntimeContexts(fakeContext(pages), main, {
    login_frame: { kind: "frame", parent: "main", origin: "https://login.example", path: "/embedded/login", name: "Login" },
  }, new Set(["https://members.example", "https://login.example"]));
  assert.equal(await runtime.target("login_frame"), frame);

  frameURL = "https://login.example/changed";
  await assert.rejects(() => runtime.target("login_frame"), (error: unknown) =>
    error instanceof DriverFailure && error.code === "invalid_response");
  frameURL = "https://login.example/embedded/login";
  children.push(fakeFrame(frameURL, "Login"));
  await assert.rejects(() => runtime.target("login_frame"), (error: unknown) =>
    error instanceof DriverFailure && error.code === "ambiguous_locator");
  children.pop();
  detached = true;
  await assert.rejects(() => runtime.target("login_frame"), (error: unknown) =>
    error instanceof DriverFailure && error.code === "invalid_response");

  let popupURL = "https://login.example/";
  let popupClosed = false;
  const popup = {
    url: () => popupURL,
    mainFrame: () => ({ childFrames: () => [] }),
    isClosed: () => popupClosed,
  } as unknown as Page;
  pages.push(popup);
  const popupRuntime = new RuntimeContexts(fakeContext(pages), main, {
    idp_popup: { kind: "popup", parent: "main", origin: "https://login.example" },
  }, new Set(["https://members.example", "https://login.example"]));
  popupRuntime.registerPopup("idp_popup", "main", popup);
  await popupRuntime.target("idp_popup");
  popupURL = "https://members.example/escaped";
  await assert.rejects(() => popupRuntime.target("idp_popup"), (error: unknown) =>
    error instanceof DriverFailure && error.code === "origin_rejected");
  popupURL = "https://login.example/";
  popupClosed = true;
  await assert.rejects(() => popupRuntime.target("idp_popup"), (error: unknown) =>
    error instanceof DriverFailure && error.code === "invalid_response");
  popupClosed = false;
  pages.shift();
  await assert.rejects(() => popupRuntime.target("idp_popup"), (error: unknown) =>
    error instanceof DriverFailure && error.code === "invalid_response");
});

function fakeFrame(url: string, name: string, children: Frame[] = []): Frame {
  return { url: () => url, name: () => name, childFrames: () => children } as unknown as Frame;
}

function fakePage(url: string, children: Frame[]): Page {
  return {
    url: () => url,
    mainFrame: () => ({ childFrames: () => children }),
  } as unknown as Page;
}

function fakeContext(pages: Page[]): BrowserContext {
  return { pages: () => pages } as unknown as BrowserContext;
}
