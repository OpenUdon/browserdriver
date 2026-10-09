import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { BrowserContext, Page } from "playwright";
import { PersistentBrowserDriver } from "../src/driver.js";
import { DriverFailure, type AuthenticateMessage, type LegacyProtocolVersion, type RegisterMessage } from "../src/protocol.js";
import { authenticationRequestSHA256, parseSessionSavePlan, type SessionCandidateStore, type SessionSaveOptions } from "../src/session-save.js";

function request(version: LegacyProtocolVersion = "udon.browser-driver.v2"): AuthenticateMessage {
  return { version, type: "authenticate", requestId: "fixture-request", operationId: "fixture-operation", sourceDigest: `sha256:${"a".repeat(64)}`,
    session: "member", flow: "login", allowedOrigins: ["https://fixture.invalid"], credentialBindings: {}, credentialEnvironment: {},
    profile: { profile: version === "udon.browser-driver.v2" ? "uws.browser-authentication.1.0" : "uws.browser-authentication.1.1",
      info: { title: "fixture", applicationOrigins: ["https://fixture.invalid"], authenticationOrigins: [] }, credentialSlots: {},
      flows: { login: { sequence: [], effects: ["establishes_session"],
        success: { origin: "https://fixture.invalid", path: "/member", locator: { role: "heading", name: "Member" } } } } } };
}
function saveOptions(auth: AuthenticateMessage, candidates: SessionCandidateStore): SessionSaveOptions {
  const now = Date.now();
  const plan = parseSessionSavePlan(Buffer.from(JSON.stringify({ version: "browserdriver.session-save-plan.v1", launchNonce: "fixture-launch",
    admittedDeadline: new Date(now + 60_000).toISOString(), permissions: [{ permissionId: "fixture-save",
      authenticate: { version: auth.version, operationId: auth.operationId, sourceDigest: auth.sourceDigest,
        flow: auth.flow, session: auth.session, sessionBinding: auth.sessionBinding ?? null },
      authenticationRequestSHA256: authenticationRequestSHA256(auth), saveBinding: "private-binding-canary",
      bindingSHA256: "b".repeat(64), generation: 3, createdAt: new Date(now - 1_000).toISOString(),
      expiresAt: new Date(now - 1_000 + 604_800_000).toISOString() }] })));
  return { plan, planSHA256: "c".repeat(64), candidates };
}
function modeledDriver(sessionSave?: SessionSaveOptions, snapshot?: () => Promise<object>) {
  const messages: object[] = [], events: string[] = [];
  let failAuthentication = false, snapshots = 0;
  const contexts: BrowserContext[] = [];
  const driver = new PersistentBrowserDriver({ next: async () => ({ done: true, value: undefined }) }, message => {
    messages.push(message); if ((message as { result?: string }).result === "success") events.push("success");
  }, { ...(sessionSave ? { sessionSave } : {}) });
  (driver as unknown as { createContext(): Promise<BrowserContext> }).createContext = async () => {
    let closed = false;
    const locator = { first: () => locator, waitFor: async () => undefined, count: async () => failAuthentication ? 0 : 1 };
    const page = { url: () => "https://fixture.invalid/member", mainFrame: () => ({ childFrames: () => [] }), isClosed: () => closed,
      getByRole: () => locator, locator: () => ({ count: async () => 0 }) } as unknown as Page;
    const context = { route: async () => undefined, newPage: async () => page, pages: () => [page],
      storageState: async (options: object) => {
        assert.deepEqual(options, { indexedDB: true }); assert.equal(closed, false); snapshots += 1; events.push("snapshot");
        return snapshot ? snapshot() : { cookies: [{ name: "private", value: "state-canary" }], origins: [] };
      }, close: async () => { closed = true; events.push("context-close"); } } as unknown as BrowserContext;
    contexts.push(context); return context;
  };
  return { driver, messages, events, contexts, snapshots: () => snapshots, failAuthentication: (value: boolean) => { failAuthentication = value; } };
}

test("authentication emits unchanged success before a private snapshot and joined staging close", async () => {
  const writes: object[] = [], lifecycle: string[] = [], auth = request();
  const options = saveOptions(auth, { write: async (...args) => { lifecycle.push("write"); writes.push(args); }, close: async () => { lifecycle.push("store-close"); } });
  const modeled = modeledDriver(options);
  await modeled.driver.authenticate(auth);
  assert.deepEqual(modeled.events, ["success", "snapshot"]); assert.equal(writes.length, 1);
  assert.equal((writes[0] as unknown[])[0], options.plan.permissions[0]);
  assert.equal((writes[0] as unknown[])[1], options.planSHA256);
  await modeled.driver.close();
  assert.deepEqual(lifecycle, ["write", "store-close"]);
  assert.deepEqual(modeled.events, ["success", "snapshot", "context-close"]);
  assert.equal(JSON.stringify(modeled.messages).includes("canary"), false);
});

test("one-use permission is consumed before authentication even when authentication fails", async () => {
  let writes = 0;
  const auth = request(), options = saveOptions(auth, { write: async () => { writes += 1; }, close: async () => undefined });
  const modeled = modeledDriver(options); modeled.failAuthentication(true);
  await modeled.driver.authenticate(auth);
  modeled.failAuthentication(false); await modeled.driver.authenticate({ ...auth, requestId: "second" });
  assert.equal(writes, 0); assert.equal(modeled.snapshots(), 0);
  assert.deepEqual((modeled.messages.filter(message => (message as { type: string }).type === "result") as { result: string }[]).map(message => message.result), ["failure", "success"]);
  await modeled.driver.close();
});

test("mismatched full authentication identity never saves or consumes a later exact permission", async () => {
  let writes = 0;
  const auth = request(), options = saveOptions(auth, { write: async () => { writes += 1; }, close: async () => undefined });
  const modeled = modeledDriver(options);
  for (const change of [
    { operationId: "other" }, { sourceDigest: `sha256:${"d".repeat(64)}` }, { session: "other" }, { sessionBinding: "other" },
    { allowedOrigins: ["https://fixture.invalid", "https://other.invalid"] }, { credentialBindings: { identity: "other" } },
    { credentialEnvironment: { other: "OTHER_ENV_NAME" } },
    { profile: { ...auth.profile, info: { ...auth.profile.info, title: "other" } } },
  ]) await modeled.driver.authenticate({ ...auth, ...change });
  assert.equal(writes, 0);
  await modeled.driver.authenticate({ ...auth, requestId: "exact" });
  await modeled.driver.authenticate({ ...auth, requestId: "exhausted" });
  assert.equal(writes, 1); assert.equal(modeled.snapshots(), 1);
  await modeled.driver.close();
});

test("save failure leaves authentication success unchanged and emits only the fixed private diagnostic", async (t) => {
  for (const failure of ["snapshot", "write"]) {
    const auth = request(), diagnostic: string[] = [];
    t.mock.method(process.stderr, "write", (value: string | Uint8Array) => { diagnostic.push(String(value)); return true; });
    const options = saveOptions(auth, { write: async () => { throw new Error("private-file-path secret-binding canary"); }, close: async () => undefined });
    const modeled = modeledDriver(options, failure === "snapshot" ? async () => { throw new Error("private-cookie-canary"); } : undefined);
    await modeled.driver.authenticate(auth);
    assert.equal((modeled.messages.at(-1) as { result: string }).result, "success");
    assert.equal(modeled.messages.filter(message => (message as { type: string }).type === "result").length, 1);
    assert.deepEqual(diagnostic, ["browserdriver session save failed\n"]);
    await modeled.driver.close(); t.mock.restoreAll();
  }
});

test("deadline crossing during snapshot stops publication and retains the original successful authentication", async (t) => {
  let writes = 0;
  const auth = request(), options = saveOptions(auth, { write: async () => { writes += 1; }, close: async () => undefined });
  const diagnostic: string[] = []; t.mock.method(process.stderr, "write", (value: string | Uint8Array) => { diagnostic.push(String(value)); return true; });
  const modeled = modeledDriver(options, async () => {
    t.mock.method(Date, "now", () => Date.parse(options.plan.admittedDeadline)); return { cookies: [] };
  });
  await modeled.driver.authenticate(auth);
  assert.equal(writes, 0); assert.equal((modeled.messages.at(-1) as { result: string }).result, "success");
  assert.deepEqual(diagnostic, ["browserdriver session save failed\n"]);
  await modeled.driver.close();
});

test("close waits for a pending snapshot and candidate callback before closing the named context", async () => {
  let releaseSnapshot!: (value: object) => void, snapshotStarted!: () => void;
  const snapshot = new Promise<object>(resolve => { releaseSnapshot = resolve; });
  const started = new Promise<void>(resolve => { snapshotStarted = resolve; });
  const events: string[] = [], auth = request();
  const options = saveOptions(auth, { write: async () => { events.push("write"); }, close: async () => { events.push("store-close"); } });
  const modeled = modeledDriver(options, async () => { snapshotStarted(); return snapshot; });
  const authentication = modeled.driver.authenticate(auth); await started;
  let joined = false; const closing = modeled.driver.close().then(() => { joined = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(joined, false); assert.ok(!modeled.events.includes("context-close"));
  releaseSnapshot({ cookies: [] }); await Promise.all([authentication, closing]);
  assert.deepEqual(events, ["write", "store-close"]); assert.equal(joined, true);
  assert.ok(modeled.events.includes("context-close"));
});

test("absent save options and all retained authentication versions preserve exact wire bytes", async () => {
  for (const version of ["udon.browser-driver.v2", "udon.browser-driver.v3", "udon.browser-driver.v10", "udon.browser-driver.v11"] as const) {
    const auth = request(version), absent = modeledDriver();
    const options = saveOptions(auth, { write: async () => undefined, close: async () => undefined }), saved = modeledDriver(options);
    await absent.driver.authenticate(auth); await saved.driver.authenticate(auth);
    assert.equal(absent.snapshots(), 0); assert.equal(saved.snapshots(), 1);
    assert.deepEqual(saved.messages.map(message => JSON.stringify(message)), [
      JSON.stringify({ version, type: "status", requestId: auth.requestId, status: "resolving" }),
      JSON.stringify({ version, type: "status", requestId: auth.requestId, status: "logging_in" }),
      JSON.stringify({ version, type: "result", requestId: auth.requestId, result: "success" }),
    ]);
    assert.deepEqual(saved.messages, absent.messages);
    await absent.driver.close(); await saved.driver.close();
  }
});

test("actions and registrations cannot consume a save permission", async () => {
  let writes = 0;
  const auth = request(), options = saveOptions(auth, { write: async () => { writes += 1; }, close: async () => undefined }), modeled = modeledDriver(options);
  await modeled.driver.action({ version: auth.version, type: "action", requestId: "action", operationId: auth.operationId, session: auth.session,
    action: { version: "udon.browser-driver.v1", operationId: auth.operationId, sourceDigest: auth.sourceDigest, actionName: "noop",
      allowedOrigins: auth.allowedOrigins, parameters: {}, action: { sequence: [] } } });
  await modeled.driver.register({ version: "udon.browser-driver.v4", type: "register", requestId: "registration" } as RegisterMessage);
  assert.equal(writes, 0);
  await modeled.driver.authenticate(auth); assert.equal(writes, 1);
  await modeled.driver.close();
});

test("CLI partial save option rejects before protocol or browser execution without private prose", async () => {
  const root = await mkdtemp(join(tmpdir(), "browserdriver-m16-cli-"));
  try {
    for (const option of ["--session-save-plan", "--session-save-root"]) {
      const result = spawnSync(process.execPath, ["dist/src/index.js", option, join(root, "private-path-canary")], { input: "", encoding: "utf8" });
      assert.equal(result.status, 1); assert.equal(result.stdout, "");
      assert.equal(result.stderr, "browser driver configuration or protocol loop failed\n");
    }
    const result = spawnSync(process.execPath, ["dist/src/index.js"], { input: "", encoding: "utf8" });
    assert.equal(result.status, 0); assert.equal(result.stdout, ""); assert.equal(result.stderr, "");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("cleanup-gap close still tears down every context and returns a closed failure", async () => {
  const auth = request(), options = saveOptions(auth, {
    write: async () => undefined, close: async () => { throw new Error("invalid private session save configuration"); },
  }), modeled = modeledDriver(options);
  await modeled.driver.authenticate(auth);
  await assert.rejects(() => modeled.driver.close(), { message: "invalid private session save configuration" });
  assert.ok(modeled.events.includes("context-close"));
  assert.ok(!JSON.stringify(modeled.messages).includes("cleanup"));
});

test("authentication request digest excludes only requestId and sorts complete nested UTF8 keys", () => {
  const auth = request();
  assert.equal(authenticationRequestSHA256(auth), authenticationRequestSHA256({ ...auth, requestId: "different" }));
  const reordered = Object.fromEntries(Object.entries(auth).reverse()) as unknown as AuthenticateMessage;
  assert.equal(authenticationRequestSHA256(auth), authenticationRequestSHA256(reordered));
  assert.notEqual(authenticationRequestSHA256(auth), authenticationRequestSHA256({ ...auth, credentialEnvironment: { canary: "ENV_NAME" } }));
  assert.throws(() => authenticationRequestSHA256({ ...auth, session: "\ud800" }));
  assert.throws(() => authenticationRequestSHA256({ ...auth, profile: { ...auth.profile, invalid: NaN } } as AuthenticateMessage));
});

test("expiry after admission never snapshots or renews a successfully authenticated session", async (t) => {
  const auth = request(), diagnostic: string[] = [];
  const options = saveOptions(auth, { write: async () => assert.fail("expired save must not write"), close: async () => undefined });
  const modeled = modeledDriver(options);
  t.mock.method(Date, "now", () => Date.parse(options.plan.permissions[0]!.expiresAt));
  t.mock.method(process.stderr, "write", (value: string | Uint8Array) => { diagnostic.push(String(value)); return true; });
  await modeled.driver.authenticate(auth);
  assert.equal(modeled.snapshots(), 0);
  assert.equal((modeled.messages.at(-1) as { result: string }).result, "success");
  assert.deepEqual(diagnostic, ["browserdriver session save failed\n"]);
  await modeled.driver.close();
});

test("legacy session_expired load failure never opens a fresh fallback context", async () => {
  const messages: object[] = [];
  let contextCalls = 0, loadCalls = 0;
  const driver = new PersistentBrowserDriver({ next: async () => ({ done: true, value: undefined }) }, message => messages.push(message), {
    sessionStore: { load: async () => { loadCalls += 1; throw new DriverFailure("session_expired"); } },
  });
  (driver as unknown as { browser: object }).browser = {
    newContext: async () => { contextCalls += 1; throw new Error("unexpected fallback"); }, close: async () => undefined,
  };
  await driver.authenticate({ ...request(), sessionBinding: "expired-private-binding" });
  assert.equal(loadCalls, 1); assert.equal(contextCalls, 0);
  assert.deepEqual(messages.at(-1), { version: "udon.browser-driver.v2", type: "result", requestId: "fixture-request", result: "failure", failureCode: "session_expired" });
  await driver.close();
});
