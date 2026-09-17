import assert from "node:assert/strict";
import test, {type TestContext} from "node:test";
import type {BrowserContext, Page, Route} from "playwright";
import {DriverFailure} from "../src/protocol.js";
import {VerificationDiagnostics, reduceNetwork} from "../src/verification-diagnostics.js";
import {VerificationGuard} from "../src/verification.js";
import {verificationDescriptor} from "./verification-fixture.js";
import {fixtureNetworkMaxBytes, fixtureNetworkVersion, initializationFixtureNetwork, readInitializationFixtureNetwork} from "./initialization-fixture-diagnostic.js";

const canary = "synthetic-fixture-private-token-canary";
const origin = "https://registration.example";
const script = "https://challenges.cloudflare.com/turnstile/v0/api.js?test=" + canary;
type Options = {operationMs?: number; elapsedMs?: number; status?: number; error?: Error};

// Real guard, modeled Playwright boundary: no browser, socket or SDK. Fake time
// advances within fetch, so deadline boundary checks do not rely on scheduling.
async function harness(t: TestContext, options: Options = {}) {
  let now = 1000, handler!: (route: Route) => Promise<void>;
  t.mock.method(Date, "now", () => now);
  const main = {url: () => origin + "/register", parentFrame: () => null};
  let contextClosed = false, requestsDisposed = false, responseDisposed = 0, bodyReads = 0;
  const context = {addInitScript: async () => {}, route: async (_: string, fn: typeof handler) => {handler = fn;},
    routeWebSocket: async () => {}, on: () => {},
    request: {dispose: async () => {requestsDisposed = true;}}, close: async () => {contextClosed = true;},
    newCDPSession: async () => ({on: () => {}, send: async () => {}})};
  const descriptor = verificationDescriptor(); descriptor.dependencies.timeoutMs = 5000;
  const guard = new VerificationGuard(context as unknown as BrowserContext, descriptor,
    new Set([origin]), new Set([origin + "/register"]), now + (options.operationMs ?? 15000), true, true, true);
  await guard.install(); await guard.watchRedirects({mainFrame: () => main} as unknown as Page);
  const requests: Array<NonNullable<Parameters<Route["fetch"]>[0]>> = [];
  const request = async (url = script, method = "GET") => {
    let action = "";
    await handler({request: () => ({url: () => url, method: () => method, frame: () => main,
      isNavigationRequest: () => false, resourceType: () => "script"}),
      continue: async () => {action = "continued";}, abort: async () => {action = "blocked";},
      fulfill: async () => {action = "fulfilled";},
      fetch: async (input: typeof requests[number]) => {
        requests.push(input); now += options.elapsedMs ?? 0;
        if (options.error) throw options.error;
        return {status: () => options.status ?? 200, headers: () => ({"content-type": "text/javascript", "x-canary": canary}),
          headersArray: () => [], body: async () => {bodyReads++; return Buffer.from(canary);},
          dispose: async () => {responseDisposed++;}};
      }} as unknown as Route);
    return action;
  };
  const detail = () => initializationFixtureNetwork(guard.diagnostics() as ReturnType<VerificationDiagnostics["snapshotV5"]>);
  const close = async (code?: string) => {
    if (code) await assert.rejects(guard.close(), e => e instanceof DriverFailure && e.code === code);
    else await guard.close();
    assert.equal(contextClosed && requestsDisposed, true);
    assert.equal(guard.postCount(), 0);
    assert.equal((guard.counts() as {applicationPosts: number}).applicationPosts, 0);
    assert.deepEqual(guard.diagnostics().shutdown, {started: true, contextClosed: true, requestsDisposed: true, callbacksJoined: true});
    assert.equal(JSON.stringify(detail()).includes(canary), false);
  };
  t.after(async () => {await guard.close().catch(() => {});});
  return {guard, request, requests, detail, close, responseDisposed: () => responseDisposed, bodyReads: () => bodyReads};
}

test("fixture detail retains successful guard response without URL, headers or body", async t => {
  const h = await harness(t);
  assert.equal(await h.request(), "fulfilled"); h.guard.assertSafe();
  assert.equal(h.requests.length, 1); assert.equal(h.responseDisposed(), 1);
  assert.deepEqual(h.requests[0], {url: script, maxRedirects: 0, maxRetries: 0, timeout: 5000});
  const d = h.detail(); assert.equal(d.version, fixtureNetworkVersion); assert.equal(d.firstFailure, null);
  assert.deepEqual(d.network.map(e => [e.reason, e.transport, e.status]), [["response", "none", "2xx"]]);
  assert.deepEqual(readInitializationFixtureNetwork(JSON.stringify(d)), d);
  await h.close();
});

for (const [transport, message, name] of [
  ["timeout", canary, "TimeoutError"], ["dns", "ENOTFOUND " + canary, "Error"],
  ["tls", "CERT_HAS_EXPIRED " + canary, "Error"], ["connection", "ECONNRESET " + canary, "Error"],
  ["other", canary, "Error"],
]) test(`fixture fetch rejection retains closed ${transport} category`, async t => {
  const error = new Error(message); error.name = name!;
  const h = await harness(t, {error}); assert.equal(await h.request(), "blocked");
  assert.throws(() => h.guard.assertSafe(), e => e instanceof DriverFailure && e.code === "verification_policy");
  assert.equal(h.detail().firstFailure?.reason, "response_transport");
  assert.equal(h.detail().firstFailure?.transport, transport);
  assert.equal((h.guard.counts() as {providerResponseBytes: number}).providerResponseBytes, 0);
  assert.equal(h.bodyReads(), 0); await h.close("verification_policy");
});

for (const {operationMs, elapsedMs, expired} of [
  {operationMs: 15000, elapsedMs: 4999, expired: false}, {operationMs: 15000, elapsedMs: 5000, expired: true},
  {operationMs: 40, elapsedMs: 39, expired: false}, {operationMs: 40, elapsedMs: 40, expired: true},
]) test(`fixture deadline boundary: operation ${operationMs}ms, fetch ${elapsedMs}ms`, async t => {
  const h = await harness(t, {operationMs, elapsedMs});
  assert.equal(await h.request(), expired ? "blocked" : "fulfilled");
  const limit = Math.min(operationMs, 5000);
  assert.equal(h.requests[0]!.timeout, limit); assert.equal(h.guard.submission.deadline, 1000 + limit);
  assert.equal(h.responseDisposed(), 1);
  if (expired) {
    assert.throws(() => h.guard.assertSafe(), e => e instanceof DriverFailure && e.code === "verification_timeout");
    assert.equal(h.detail().firstFailure?.reason, "response_transport");
    assert.equal(h.detail().firstFailure?.transport, "none");
    assert.equal(h.bodyReads(), 0);
    assert.equal((h.guard.counts() as {providerResponseBytes: number}).providerResponseBytes, 0);
  } else {
    h.guard.submission.startPhase(); // Further activity cannot renew the window.
    assert.equal(h.guard.submission.deadline, 1000 + limit); assert.equal(h.detail().firstFailure, null);
  }
  await h.close(expired ? "verification_timeout" : undefined);
});

test("fixture retains blocked read and provider 4xx despite null firstFailure", async t => {
  const h = await harness(t, {status: 403});
  assert.equal(await h.request("https://unapproved.example/" + canary), "blocked");
  assert.equal(await h.request(), "fulfilled"); h.guard.assertSafe();
  const d = h.detail(); assert.equal(d.firstFailure, null);
  assert.deepEqual(d.network.map(e => [e.reason, e.status]), [["unapproved_read", "none"], ["response", "4xx"]]);
  assert.equal(d.summary.counters.reduce((n, r) => n + r.blockedReads, 0), 1);
  assert.equal(d.summary.counters.reduce((n, r) => n + r.provider4xx, 0), 1);
  await h.close();
});

test("fixture diagnostics preserve zero-POST containment", async t => {
  const h = await harness(t); assert.equal(await h.request(origin + "/register", "POST"), "blocked");
  assert.equal(h.detail().firstFailure?.reason, "application_mutation"); assert.equal(h.requests.length, 0);
  await h.close("verification_policy");
});

function evicted() {
  const trace = new VerificationDiagnostics();
  trace.network(reduceNetwork("unapproved_read", "unapproved"));
  trace.network(reduceNetwork("response", "turnstile_script", "GET", "script", "main", 403));
  trace.network(reduceNetwork("response_transport", "turnstile_script", "GET", "script", "main", 0, "timeout"));
  trace.beginShutdown();
  for (let i = 0; i < 40; i++) trace.network(reduceNetwork("shutdown_blocked", "application"));
  return trace;
}
test("fixture history eviction retains early failure, abnormal events and fixed summaries", () => {
  const d = initializationFixtureNetwork(evicted().snapshotV5());
  assert.equal(d.network.length, 32); assert.equal(d.omittedNetworkEvents, 11);
  assert.ok(d.network.every(e => e.phase === "shutdown" && e.reason === "shutdown_blocked"));
  assert.equal(d.firstFailure?.transport, "timeout");
  assert.equal(d.summary.firstAbnormal?.reason, "unapproved_read");
  assert.equal(d.summary.lastAbnormal?.reason, "response_transport");
  assert.equal(d.summary.counters.reduce((n, r) => n + r.provider4xx, 0), 1);
  assert.equal(d.summary.fatalReasons.find(r => r.reason === "response_transport")?.count, 1);
  assert.ok(Buffer.byteLength(JSON.stringify(d)) < fixtureNetworkMaxBytes);
});

test("fixture reader rejects malformed, expanded, unbounded and duplicate-key input without prose leakage", () => {
  const valid = initializationFixtureNetwork(evicted().snapshotV5());
  const rejects = (text: string) => assert.throws(() => readInitializationFixtureNetwork(text), e =>
    e instanceof Error && e.message === "invalid_initialization_fixture_network" && !e.message.includes(canary));
  for (const mutate of [
    (d: any) => {d.version = "unrecognized";}, (d: any) => {d.raw = canary;},
    (d: any) => {delete d.firstFailure;}, (d: any) => {d.firstFailure.transport = canary;},
    (d: any) => {d.network[0].url = canary;}, (d: any) => {d.network[0].reason = canary;},
    (d: any) => {d.network.push(d.network[0]);}, (d: any) => {d.network.pop();},
    (d: any) => {d.omittedNetworkEvents = -1;}, (d: any) => {d.omittedNetworkEvents = Number.MAX_SAFE_INTEGER + 1;},
    (d: any) => {d.summary.counters[0].events = 1.5;}, (d: any) => {d.summary.counters[0].events = 1000001;},
    (d: any) => {d.summary.counters[0].events = null;}, (d: any) => {d.summary.counters.reverse();},
    (d: any) => {d.summary.fatalReasons.pop();}, (d: any) => {d.summary.firstAbnormal = null;},
    (d: any) => {d.summary.firstAbnormal.reason = "response";}, (d: any) => {d.summary.unit = canary;},
  ]) {const d = structuredClone(valid); mutate(d); rejects(JSON.stringify(d));}
  rejects(canary); rejects(" ".repeat(fixtureNetworkMaxBytes + 1)); rejects(JSON.stringify(valid) + "\n");
  rejects(JSON.stringify(valid).replace('"omittedNetworkEvents":11', '"omittedNetworkEvents":11,"omittedNetworkEvents":11'));
});

test("fixture writer omits unrelated snapshot fields and returns detached validated data", () => {
  const snapshot = evicted().snapshotV5(), expanded = {...snapshot, rawException: canary, responseBody: canary};
  const d = initializationFixtureNetwork(expanded);
  assert.equal(JSON.stringify(d).includes(canary), false);
  d.network.pop(); d.summary.counters[0]!.events = 999;
  assert.equal(snapshot.network.length, 32); assert.equal(snapshot.summary.counters[0]!.events, 0);
  const empty = initializationFixtureNetwork(new VerificationDiagnostics().snapshotV5());
  assert.equal(empty.firstFailure, null); assert.equal(empty.summary.firstAbnormal, null);
});
