import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { createInterface } from "node:readline";
import test from "node:test";
import type { BrowserContext, Page, Route } from "playwright";
import {
  PersistentBrowserDriver, readRegistrationCheckpointResponse,
} from "../src/driver.js";
import { ReadlineMessageSource } from "../src/line-source.js";
import { DriverFailure, type RegisterMessage } from "../src/protocol.js";
import { RegistrationGuard, assertRegistrationURL, validateRegistrationMessage } from "../src/registration.js";

const origin = "https://registration.example";

function request(): RegisterMessage {
  return {
    version: "udon.browser-driver.v4", type: "register", requestId: "registration", operationId: "register_test_user",
    sourceDigest: `sha256:${"a".repeat(64)}`, flow: "create_test_user", allowedOrigins: [origin],
    credentialBindings: { identifier: "registration_identifier", password: "registration_password" },
    credentialEnvironment: {
      registration_identifier: "BROWSERDRIVER_TEST_IDENTIFIER",
      registration_password: "BROWSERDRIVER_TEST_PASSWORD",
    },
    controls: {
      approval: "submit_registration", duplicatePrevention: "operator_attestation", onDuplicate: "fail",
      ambiguousOutcome: "stop_without_retry", cleanupDisposition: "delete_separately",
    },
    profile: {
      profile: "uws.browser-registration.1.0",
      info: { title: "Synthetic registration", applicationOrigins: [origin], registrationOrigins: [origin] },
      observationKind: "accessibility_snapshot", evidence: { learnedAt: "2026-08-25T00:00:00Z", source: "synthetic_fixture" },
      confidence: "high", expiresAfter: "P30D", verification: { lastVerifiedAt: "2026-08-25T00:00:00Z" },
      credentialSlots: { identifier: { kind: "identifier" }, password: { kind: "password" } },
      flows: {
        create_test_user: {
          sequence: [
            { navigate: `${origin}/register?action=startnew` },
            { type_credential: { locator: { role: "textbox", name: "Identifier" }, slot: "identifier" } },
            { type_credential: { locator: { role: "textbox", name: "Password" }, slot: "password" } },
            { submit: { locator: { role: "button", name: "Register" } } },
          ],
          effects: ["creates_account"], confirmationPolicy: { required: true },
          success: { origin, path: "/complete", locator: { role: "status", name: "Created" } },
        },
      },
    },
  };
}

test("registration validation accepts reviewed structural query and rejects secret-like query data", () => {
  assert.equal(validateRegistrationMessage(request()).sequence.length, 4);
  const allowed = new Set([origin]);
  assert.doesNotThrow(() => assertRegistrationURL(`${origin}/register?action=startnew`, allowed));
  for (const url of [
    `${origin}/register?token=opaque`, `${origin}/register?action=sk-forbiddenvalue`,
    `${origin}/register?action=one&action=two`, `${origin}/register#fragment`, "https://evil.example/register?action=startnew",
  ]) assert.throws(() => assertRegistrationURL(url, allowed), DriverFailure, url);
});

test("registration guard permits one approved POST and blocks mutations and redirect origins", async () => {
  let handler: ((route: Route) => Promise<void>) | undefined;
  const context = { route: async (_: string, callback: (route: Route) => Promise<void>) => { handler = callback; } } as unknown as Pick<BrowserContext, "route">;
  const guard = new RegistrationGuard(context, new Set([origin]));
  await guard.install();
  assert.ok(handler);
  const early = fakeRoute(`${origin}/register`, "POST");
  await handler(early.route);
  assert.equal(early.aborted(), true);
  assert.throws(() => guard.assertSafe(), (error: unknown) => error instanceof DriverFailure && error.code === "invalid_response");

  let approvedHandler: ((route: Route) => Promise<void>) | undefined;
  const approvedGuard = new RegistrationGuard({
    route: async (_: string, callback: (route: Route) => Promise<void>) => { approvedHandler = callback; },
  } as unknown as Pick<BrowserContext, "route">, new Set([origin]));
  await approvedGuard.install();
  approvedGuard.beginSubmit();
  const post = fakeRoute(`${origin}/register`, "POST");
  await approvedHandler!(post.route);
  approvedGuard.finishSubmit();
  assert.equal(post.continued(), true);
  assert.equal(approvedGuard.postCount(), 1);

  const redirect = fakeRoute("https://evil.example/complete", "GET");
  await approvedHandler!(redirect.route);
  assert.equal(redirect.aborted(), true);
  assert.throws(() => approvedGuard.assertSafe(), (error: unknown) => error instanceof DriverFailure && error.code === "origin_rejected");
});

test("registration executes in a closed unnamed context and emits only a fixed result", async () => {
  const previousIdentifier = process.env.BROWSERDRIVER_TEST_IDENTIFIER;
  const previousPassword = process.env.BROWSERDRIVER_TEST_PASSWORD;
  process.env.BROWSERDRIVER_TEST_IDENTIFIER = "dedicated-test@example.invalid";
  process.env.BROWSERDRIVER_TEST_PASSWORD = "not-output";
  try {
    let handler: ((route: Route) => Promise<void>) | undefined;
    let currentURL = "about:blank";
    let closed = false;
    const fills: string[] = [];
    const locator = {
      first: () => locator, waitFor: async () => undefined, count: async () => 1,
      fill: async (value: string) => { fills.push(value); },
      click: async () => {
        const post = fakeRoute(`${origin}/register`, "POST");
        await handler!(post.route);
        currentURL = `${origin}/complete`;
      },
    };
    const page = {
      url: () => currentURL,
      goto: async (url: string) => {
        const get = fakeRoute(url, "GET");
        await handler!(get.route);
        currentURL = url;
      },
      getByRole: () => locator,
    } as unknown as Page;
    const context = {
      route: async (_: string, callback: (route: Route) => Promise<void>) => { handler = callback; },
      newPage: async () => page, pages: () => [page], close: async () => { closed = true; },
    } as unknown as BrowserContext;
    const messages: Array<Record<string, unknown>> = [];
    const source = {
      next: async () => {
        const checkpoint = messages.findLast((message) => message.type === "registration_checkpoint")!;
        return { done: false as const, value: JSON.stringify({
          version: "udon.browser-driver.v4", type: "registration_checkpoint_response", requestId: "registration",
          checkpointId: checkpoint.checkpointId, decision: "continue",
        }) };
      },
    };
    const driver = new PersistentBrowserDriver(source, (message) => messages.push(message as Record<string, unknown>), { headed: true });
    (driver as unknown as { createContext: () => Promise<BrowserContext> }).createContext = async () => context;
    await driver.register(request());

    assert.equal(closed, true);
    assert.deepEqual(fills, ["dedicated-test@example.invalid", "not-output"]);
    assert.equal((driver as unknown as { sessions: Map<string, unknown> }).sessions.size, 0);
    assert.deepEqual(messages.at(-1), {
      version: "udon.browser-driver.v4", type: "result", requestId: "registration", result: "success", response: { status: "success" },
    });
    const wire = JSON.stringify(messages);
    assert.equal(wire.includes("dedicated-test@example.invalid"), false);
    assert.equal(wire.includes("not-output"), false);
    assert.equal(wire.includes("/complete"), false);
  } finally {
    restoreEnvironment("BROWSERDRIVER_TEST_IDENTIFIER", previousIdentifier);
    restoreEnvironment("BROWSERDRIVER_TEST_PASSWORD", previousPassword);
  }
});

test("submit denial is final before mutation and a post-submit failure is indeterminate", async () => {
  const input = new PassThrough();
  const readline = createInterface({ input, terminal: false });
  const source = new ReadlineMessageSource(readline);
  await assert.rejects(
    () => readRegistrationCheckpointResponse(source, "request", "checkpoint", 5),
    (error: unknown) => error instanceof DriverFailure && error.code === "registration_checkpoint_timeout",
  );
  input.end();

  const deniedLine = {
    next: async () => ({ done: false as const, value: JSON.stringify({
      version: "udon.browser-driver.v4", type: "registration_checkpoint_response", requestId: "request",
      checkpointId: "checkpoint", decision: "deny",
    }) }),
  };
  await assert.rejects(
    () => readRegistrationCheckpointResponse(deniedLine, "request", "checkpoint", 100),
    (error: unknown) => error instanceof DriverFailure && error.code === "registration_checkpoint_denied",
  );
  const invalidLine = {
    next: async () => ({ done: false as const, value: JSON.stringify({
      version: "udon.browser-driver.v4", type: "registration_checkpoint_response", requestId: "request",
      checkpointId: "checkpoint", decision: "provide",
    }) }),
  };
  await assert.rejects(
    () => readRegistrationCheckpointResponse(invalidLine, "request", "checkpoint", 100),
    (error: unknown) => error instanceof DriverFailure && error.code === "invalid_response",
  );
});

test("submit approval immediately precedes one POST and uncertainty forbids another attempt", async () => {
  const previousIdentifier = process.env.BROWSERDRIVER_TEST_IDENTIFIER;
  const previousPassword = process.env.BROWSERDRIVER_TEST_PASSWORD;
  process.env.BROWSERDRIVER_TEST_IDENTIFIER = "indeterminate@example.invalid";
  process.env.BROWSERDRIVER_TEST_PASSWORD = "never-on-wire";
  try {
    const messages: Array<Record<string, unknown>> = [];
    const events: string[] = [];
    let handler: ((route: Route) => Promise<void>) | undefined;
    let currentURL = "about:blank";
    let contextCount = 0;
    let closeCount = 0;
    let postCount = 0;
    const ordinaryLocator = {
      first: () => ordinaryLocator, waitFor: async () => undefined, count: async () => 1,
      fill: async () => undefined,
      click: async () => {
        events.push("submit_click");
        const post = fakeRoute(`${origin}/register`, "POST");
        await handler!(post.route);
        if (post.continued()) postCount += 1;
        currentURL = `${origin}/complete`;
      },
    };
    const missingSuccess = {
      first: () => missingSuccess,
      waitFor: async () => { throw new Error("synthetic missing success proof"); },
      count: async () => 0,
    };
    const page = {
      url: () => currentURL,
      goto: async (url: string) => {
        const get = fakeRoute(url, "GET");
        await handler!(get.route);
        currentURL = url;
      },
      getByRole: (role: string) => role === "status" ? missingSuccess : ordinaryLocator,
    } as unknown as Page;
    const context = {
      route: async (_: string, callback: (route: Route) => Promise<void>) => { handler = callback; },
      newPage: async () => page, pages: () => [page], close: async () => { closeCount += 1; },
    } as unknown as BrowserContext;
    const source = {
      next: async () => {
        const checkpoint = messages.findLast((message) => message.type === "registration_checkpoint")!;
        events.push(`decision:${String(checkpoint.kind)}`);
        return { done: false as const, value: JSON.stringify({
          version: "udon.browser-driver.v4", type: "registration_checkpoint_response", requestId: "registration",
          checkpointId: checkpoint.checkpointId, decision: "continue",
        }) };
      },
    };
    const driver = new PersistentBrowserDriver(source, (message) => {
      messages.push(message as Record<string, unknown>);
      const value = message as Record<string, unknown>;
      if (value.type === "registration_checkpoint") events.push(`checkpoint:${String(value.kind)}`);
    }, { headed: true });
    (driver as unknown as { createContext: () => Promise<BrowserContext> }).createContext = async () => {
      contextCount += 1;
      return context;
    };

    await driver.register(request());
    assert.equal(messages.at(-1)!.failureCode, "registration_indeterminate");
    assert.equal(postCount, 1);
    assert.deepEqual(events.slice(-3), ["checkpoint:submit_approval", "decision:submit_approval", "submit_click"]);
    assert.equal(closeCount, 1);

    await driver.register({ ...request(), requestId: "registration_retry" });
    assert.equal(messages.at(-1)!.failureCode, "registration_indeterminate");
    assert.equal(contextCount, 1);
    assert.equal(postCount, 1);
    assert.equal(JSON.stringify(messages).includes("never-on-wire"), false);
  } finally {
    restoreEnvironment("BROWSERDRIVER_TEST_IDENTIFIER", previousIdentifier);
    restoreEnvironment("BROWSERDRIVER_TEST_PASSWORD", previousPassword);
  }
});

test("a denied submit checkpoint prevents the POST and still closes the fresh context", async () => {
  const previousIdentifier = process.env.BROWSERDRIVER_TEST_IDENTIFIER;
  const previousPassword = process.env.BROWSERDRIVER_TEST_PASSWORD;
  process.env.BROWSERDRIVER_TEST_IDENTIFIER = "denied@example.invalid";
  process.env.BROWSERDRIVER_TEST_PASSWORD = "denied-secret";
  try {
    let handler: ((route: Route) => Promise<void>) | undefined;
    let currentURL = "about:blank";
    let posts = 0;
    let closed = false;
    const locator = {
      first: () => locator, waitFor: async () => undefined, count: async () => 1, fill: async () => undefined,
      click: async () => {
        posts += 1;
        await handler!(fakeRoute(`${origin}/register`, "POST").route);
      },
    };
    const page = {
      url: () => currentURL,
      goto: async (url: string) => { currentURL = url; },
      getByRole: () => locator,
    } as unknown as Page;
    const context = {
      route: async (_: string, callback: (route: Route) => Promise<void>) => { handler = callback; },
      newPage: async () => page, pages: () => [page], close: async () => { closed = true; },
    } as unknown as BrowserContext;
    const messages: Array<Record<string, unknown>> = [];
    const source = {
      next: async () => {
        const checkpoint = messages.findLast((message) => message.type === "registration_checkpoint")!;
        return { done: false as const, value: JSON.stringify({
          version: "udon.browser-driver.v4", type: "registration_checkpoint_response", requestId: "registration",
          checkpointId: checkpoint.checkpointId, decision: "deny",
        }) };
      },
    };
    const driver = new PersistentBrowserDriver(source, (message) => messages.push(message as Record<string, unknown>), { headed: true });
    (driver as unknown as { createContext: () => Promise<BrowserContext> }).createContext = async () => context;
    await driver.register(request());
    assert.equal(messages.at(-1)!.failureCode, "registration_checkpoint_denied");
    assert.equal(posts, 0);
    assert.equal(closed, true);
  } finally {
    restoreEnvironment("BROWSERDRIVER_TEST_IDENTIFIER", previousIdentifier);
    restoreEnvironment("BROWSERDRIVER_TEST_PASSWORD", previousPassword);
  }
});

function fakeRoute(url: string, method: string): {
  route: Route; continued: () => boolean; aborted: () => boolean;
} {
  let continued = false;
  let aborted = false;
  const route = {
    request: () => ({ url: () => url, method: () => method, isNavigationRequest: () => true }),
    continue: async () => { continued = true; },
    abort: async () => { aborted = true; },
  } as unknown as Route;
  return { route, continued: () => continued, aborted: () => aborted };
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
