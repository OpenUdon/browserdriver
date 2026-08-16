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
