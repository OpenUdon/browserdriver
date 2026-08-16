import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { createInterface } from "node:readline";
import test from "node:test";
import type { BrowserContext, Frame, Page, Route } from "playwright";
import {
  NavigationGuard, PersistentBrowserDriver, attestedVisitedURLs, exactLocator, extractOutputs, maxVisitedURLsPerWindow,
  readChallengeResponse, uniqueNumberMatch,
} from "../src/driver.js";
import { ReadlineMessageSource } from "../src/line-source.js";
import { DriverFailure } from "../src/protocol.js";
import type { ActionMessage } from "../src/protocol.js";
import { RuntimeContexts } from "../src/contexts.js";

test("navigation guard blocks a redirect origin before continuing its request", async () => {
  let handler: ((route: Route) => Promise<void>) | undefined;
  const context = {
    route: async (_pattern: string, callback: (route: Route) => Promise<void>) => { handler = callback; },
  } as unknown as Pick<BrowserContext, "route">;
  const visited: string[] = [];
  const guard = new NavigationGuard(context, visited, new Set(["https://allowed.example"]));
  await guard.install();
  assert.ok(handler);

  const allowed = fakeNavigationRoute("https://allowed.example/start");
  await handler(allowed.route);
  assert.equal(allowed.continued(), true);
  assert.equal(allowed.aborted(), false);

  const redirect = fakeNavigationRoute("https://identity.evil.invalid/redirect");
  await handler(redirect.route);
  assert.equal(redirect.aborted(), true);
  assert.equal(redirect.continued(), false);
  assert.throws(() => guard.assertSafe(), (error: unknown) =>
    error instanceof DriverFailure && error.code === "origin_rejected");
  assert.deepEqual(visited, ["https://allowed.example/start", "https://identity.evil.invalid/redirect"]);
});

test("v3 navigation guard also enforces child-frame origins while v2 remains top-level only", async () => {
  let v2Handler: ((route: Route) => Promise<void>) | undefined;
  let v3Handler: ((route: Route) => Promise<void>) | undefined;
  const contextFor = (save: (handler: (route: Route) => Promise<void>) => void) => ({
    route: async (_pattern: string, callback: (route: Route) => Promise<void>) => save(callback),
  }) as unknown as Pick<BrowserContext, "route">;
  const v2 = new NavigationGuard(contextFor((handler) => { v2Handler = handler; }), [], new Set(["https://allowed.example"]));
  const v3 = new NavigationGuard(contextFor((handler) => { v3Handler = handler; }), [], new Set(["https://allowed.example"]), true);
  await v2.install();
  await v3.install();
  const v2Route = fakeNavigationRoute("https://evil.invalid/frame", true);
  const v3Route = fakeNavigationRoute("https://evil.invalid/frame", true);
  await v2Handler!(v2Route.route);
  await v3Handler!(v3Route.route);
  assert.equal(v2Route.continued(), true);
  assert.equal(v3Route.aborted(), true);
  assert.throws(() => v3.assertSafe(), (error: unknown) => error instanceof DriverFailure && error.code === "origin_rejected");
});

test("action attestation includes the current page without a new navigation", () => {
  assert.deepEqual(
    attestedVisitedURLs("https://allowed.example/member", []),
    ["https://allowed.example/member"],
  );
});

test("a timed-out challenge read does not consume the next protocol line", async () => {
  const input = new PassThrough();
  const readline = createInterface({ input, terminal: false });
  const source = new ReadlineMessageSource(readline);
  await assert.rejects(
    () => readChallengeResponse(source, "request", "challenge", 5),
    (error: unknown) => error instanceof DriverFailure && error.code === "mfa_timeout",
  );
  input.write('{"next":"request"}\n');
  assert.deepEqual(await source.next(), { done: false, value: '{"next":"request"}' });
  input.end();
});

test("number matching prefers a unique two-digit code and supports trusted selector scoping", async () => {
  const selected: string[] = [];
  const page = {
    locator: (selector: string) => ({
      innerText: async () => {
        selected.push(selector);
        return selector === "[data-number-match]" ? "42" : "August 15, 2026; total 100; approve 42";
      },
    }),
  } as unknown as Page;

  await assert.rejects(() => uniqueNumberMatch(page), (error: unknown) =>
    error instanceof DriverFailure && error.code === "ambiguous_locator");
  assert.equal(await uniqueNumberMatch(page, "[data-number-match]"), "42");
  assert.deepEqual(selected, ["body", "[data-number-match]"]);
});

test("navigation windows are bounded and can be reset between actions", async () => {
  let handler: ((route: Route) => Promise<void>) | undefined;
  const context = {
    route: async (_pattern: string, callback: (route: Route) => Promise<void>) => { handler = callback; },
  } as unknown as Pick<BrowserContext, "route">;
  const visited: string[] = [];
  const guard = new NavigationGuard(context, visited, new Set(["https://allowed.example"]));
  await guard.install();
  assert.ok(handler);

  for (let index = 0; index < maxVisitedURLsPerWindow; index += 1) {
    await handler(fakeNavigationRoute(`https://allowed.example/${index}`).route);
  }
  const overflow = fakeNavigationRoute("https://allowed.example/overflow");
  await handler(overflow.route);
  assert.equal(overflow.aborted(), true);
  assert.equal(visited.length, maxVisitedURLsPerWindow);
  assert.throws(() => guard.assertSafe(), (error: unknown) =>
    error instanceof DriverFailure && error.code === "driver_error");

  visited.splice(0);
  guard.setAllowed(new Set(["https://allowed.example"]));
  const next = fakeNavigationRoute("https://allowed.example/next-action");
  await handler(next.route);
  guard.assertSafe();
  assert.deepEqual(
    attestedVisitedURLs("https://allowed.example/next-action", visited),
    ["https://allowed.example/next-action"],
  );
});

test("repeated actions discard their reported navigation window", async () => {
  const visited: string[] = [];
  const results: Array<Record<string, unknown>> = [];
  const page = {
    url: () => "https://allowed.example/current",
    locator: () => ({ count: async () => 0 }),
  } as unknown as Page;
  const driver = new PersistentBrowserDriver(
    { next: async () => ({ done: true, value: undefined }) },
    (message) => {
      const value = message as Record<string, unknown>;
      if (value.type === "status" && value.status === "executing") {
        visited.push("https://allowed.example/current");
      }
      if (value.type === "result") results.push(value);
    },
  );
  const sessions = (driver as unknown as { sessions: Map<string, unknown> }).sessions;
  sessions.set("member", {
    context: { close: async () => undefined },
    page,
    visited,
    navigation: { setAllowed: () => undefined, assertSafe: () => undefined },
  });
  const request: ActionMessage = {
    version: "udon.browser-driver.v2", type: "action", requestId: "one", operationId: "read", session: "member",
    action: {
      version: "udon.browser-driver.v1", operationId: "read", sourceDigest: "sha256:test", actionName: "read",
      allowedOrigins: ["https://allowed.example"], parameters: {}, action: { sequence: [], outputs: {} },
    },
  };

  await driver.action(request);
  await driver.action({ ...request, requestId: "two" });
  assert.equal(visited.length, 0);
  assert.equal(results.length, 2);
  for (const result of results) {
    assert.deepEqual((result.response as Record<string, unknown>).visitedUrls, ["https://allowed.example/current"]);
  }
});

test("v3 action resolves context-qualified waits and outputs while v2 stays accepted", async () => {
  const locator = { first: () => locator, waitFor: async () => undefined, count: async () => 1 };
  const frame = {
    url: () => "https://members.example/frame",
    name: () => "Member",
    childFrames: () => [],
    getByRole: () => locator,
    locator: () => ({ count: async () => 0 }),
  } as unknown as Frame;
  const page = {
    url: () => "https://members.example/dashboard",
    mainFrame: () => ({ childFrames: () => [frame] }),
    getByRole: () => locator,
    locator: () => ({ count: async () => 0 }),
  } as unknown as Page;
  const context = { pages: () => [page], close: async () => undefined } as unknown as BrowserContext;
  const runtime = new RuntimeContexts(context, page, {
    member_frame: { kind: "frame", parent: "main", origin: "https://members.example", path: "/frame", name: "Member" },
  }, new Set(["https://members.example"]));
  const messages: Array<Record<string, unknown>> = [];
  const driver = new PersistentBrowserDriver(
    { next: async () => ({ done: true, value: undefined }) },
    (message) => messages.push(message as Record<string, unknown>),
  );
  const sessions = (driver as unknown as { sessions: Map<string, unknown> }).sessions;
  sessions.set("member", {
    context, page, visited: [], runtime,
    navigation: { setAllowed: () => undefined, assertSafe: () => undefined },
  });
  const request: ActionMessage = {
    version: "udon.browser-driver.v3", type: "action", requestId: "v3", operationId: "read", session: "member",
    action: {
      version: "udon.browser-driver.v2", operationId: "read", sourceDigest: "sha256:test", actionName: "read",
      allowedOrigins: ["https://members.example"], parameters: {},
      contexts: { member_frame: { kind: "frame", parent: "main", origin: "https://members.example", path: "/frame", name: "Member" } },
      action: {
        sequence: [{ wait_for: { locator: { role: "heading", name: "Status" }, context: "member_frame" } }],
        outputs: { present: { type: "boolean", source: "a11y", locator: { role: "heading", name: "Status" }, context: "member_frame", presence: true } },
      },
    },
  };
  await driver.action(request);
  const result = messages.at(-1)!;
  assert.equal(result.version, "udon.browser-driver.v3");
  assert.deepEqual((result.response as Record<string, unknown>).outputs, { present: true });
});

test("exact accessibility locators honor explicit empty constraints", async () => {
  let roleOptions: unknown;
  let filterOptions: unknown;
  let inputValueRead = false;
  const locator = {
    filter: (options: unknown) => { filterOptions = options; return locator; },
    first: () => locator,
    waitFor: async () => undefined,
    count: async () => 1,
    inputValue: async () => { inputValueRead = true; return ""; },
  };
  const page = {
    getByRole: (_role: string, options: unknown) => { roleOptions = options; return locator; },
  } as unknown as Page;

  await exactLocator(page, { role: "textbox", name: "", text: "", value: "" });
  assert.deepEqual(roleOptions, { name: "", exact: true });
  assert.deepEqual(filterOptions, { hasText: "" });
  assert.equal(inputValueRead, true);
});

test("a11y presence returns false for no match and rejects ambiguity", async () => {
  const pageWithCount = (count: number): Page => ({
    getByRole: () => ({ count: async () => count }),
  }) as unknown as Page;
  const output = { available: { type: "boolean", source: "a11y" as const, locator: { role: "status" }, presence: true } };

  assert.deepEqual(await extractOutputs(pageWithCount(0), output), { available: false });
  await assert.rejects(() => extractOutputs(pageWithCount(2), output), (error: unknown) =>
    error instanceof DriverFailure && error.code === "ambiguous_locator");
});

test("structured-data outputs default an omitted property to the output name", async () => {
  let microdataInput: unknown;
  const page = {
    locator: (selector: string) => {
      if (selector === 'script[type="application/ld+json"]') {
        return { allTextContents: async () => ['{"schema_name":"schema value"}'] };
      }
      if (selector === "[itemprop]") {
        return {
          evaluateAll: async (_callback: unknown, input: unknown) => {
            microdataInput = input;
            return ["microdata value"];
          },
        };
      }
      throw new Error("unexpected selector");
    },
  } as unknown as Page;

  const result = await extractOutputs(page, {
    schema_name: { type: "string", source: "jsonld" },
    item_name: { type: "string", source: "microdata" },
  });
  assert.deepEqual(result, { schema_name: "schema value", item_name: "microdata value" });
  assert.deepEqual(microdataInput, { property: "item_name", attribute: undefined });
});

function fakeNavigationRoute(url: string, child = false): {
  route: Route;
  aborted(): boolean;
  continued(): boolean;
} {
  let aborted = false;
  let continued = false;
  const route = {
    request: () => ({
      isNavigationRequest: () => true,
      frame: () => ({ parentFrame: () => child ? ({}) : null }),
      url: () => url,
    }),
    abort: async () => { aborted = true; },
    continue: async () => { continued = true; },
  } as unknown as Route;
  return { route, aborted: () => aborted, continued: () => continued };
}
