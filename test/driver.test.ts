import assert from "node:assert/strict";
import test from "node:test";
import type { BrowserContext, Page, Route } from "playwright";
import { NavigationGuard, attestedVisitedURLs, exactLocator, extractOutputs } from "../src/driver.js";
import { DriverFailure } from "../src/protocol.js";

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

test("action attestation includes the current page without a new navigation", () => {
  assert.deepEqual(
    attestedVisitedURLs("https://allowed.example/member", []),
    ["https://allowed.example/member"],
  );
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

function fakeNavigationRoute(url: string): {
  route: Route;
  aborted(): boolean;
  continued(): boolean;
} {
  let aborted = false;
  let continued = false;
  const route = {
    request: () => ({
      isNavigationRequest: () => true,
      frame: () => ({ parentFrame: () => null }),
      url: () => url,
    }),
    abort: async () => { aborted = true; },
    continue: async () => { continued = true; },
  } as unknown as Route;
  return { route, aborted: () => aborted, continued: () => continued };
}
