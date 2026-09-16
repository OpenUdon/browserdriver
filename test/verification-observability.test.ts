import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import test from "node:test";
import type { JSHandle, Page } from "playwright";
import { installLifecycleObserver, reduceLifecycle } from "../src/verification-lifecycle.js";
import { boundFrameGeometry, observeProviderFrame } from "../src/verification-visibility.js";
import { VerificationDiagnostics, reduceNetwork } from "../src/verification-diagnostics.js";
import { summaryLimit, VerificationNetworkSummary } from "../src/verification-summary.js";
import { parseInput } from "../src/protocol.js";
import { runFakeProbe } from "./verification-probe-fixture.js";

const canary = "synthetic-token-url-sdk-prose-canary";
function lifecycleHarness(attributes: Record<string, string> = {}, initial: Record<string, unknown> = {}) {
  class Element {
    isConnected = true;
    getAttribute(name: string) { return attributes[name] ?? null; }
  }
  const widget = new Element(), window: Record<string, unknown> = { ...initial };
  let wake = () => {};
  const context = { window, Element, document: { querySelectorAll: () => [widget], querySelector: () => widget },
    MutationObserver: class { constructor(callback: () => void) { wake = callback; } observe() {} }, key: "observer" };
  runInNewContext(`(${installLifecycleObserver.toString()})(key)`, context);
  return { window, widget, wake: () => wake(), sample: () => reduceLifecycle((window.observer as Function)(widget)) };
}

test("missing implicit callbacks stay unavailable and no callback/retry setting is created", () => {
  const h = lifecycleHarness();
  assert.equal(h.sample().availability, "unavailable");
  assert.deepEqual(Object.keys(h.window), []);
  assert.equal(JSON.stringify(h.sample()).includes(canary), false);
});

test("implicit callbacks preserve receiver, arguments, return and throw while reducing errors", () => {
  const receiver = {}, thrown = Error(canary); let calls = 0;
  const h = lifecycleHarness({ "data-error-callback": "errorHandler" }, { errorHandler: function(this: object, code: unknown, value: unknown) {
    calls++; assert.equal(this, receiver); assert.equal(code, "600123"); assert.equal(value, canary);
    if (calls === 2) throw thrown;
    return false;
  } });
  const callback = h.window.errorHandler as Function;
  assert.equal(callback.call(receiver, "600123", canary), false);
  assert.throws(() => callback.call(receiver, "600123", canary), error => error === thrown);
  const snapshot = h.sample();
  assert.equal(snapshot.events.error, 2); assert.equal(snapshot.errorFamilies.challenge, 2);
  assert.equal(snapshot.availability, "partial"); assert.equal(snapshot.firstError, "challenge");
  assert.equal(JSON.stringify(snapshot).includes(canary), false);
});

test("implicit callback replacement is observed without invoking callbacks during sampling", () => {
  let original = 0, replacement = 0;
  const h = lifecycleHarness({ "data-error-callback": "errorHandler" }, { errorHandler: () => { original++; return true; } });
  assert.equal((h.window.errorHandler as Function)("110200"), true);
  h.window.errorHandler = () => { replacement++; return undefined; };
  h.wake(); h.sample(); assert.equal(replacement, 0);
  assert.equal((h.window.errorHandler as Function)(canary), undefined);
  assert.equal(original, 1); assert.equal(replacement, 1);
  const d = h.sample(); assert.equal(d.firstError, "configuration"); assert.equal(d.lastError, "unknown");
  h.widget.isConnected = false; assert.equal(h.sample().availability, "unavailable");
});

test("explicit render forwards calls and existing callbacks without adding missing hooks", () => {
  const h = lifecycleHarness(); let renderCalls = 0, callbackCalls = 0;
  const api = { render(this: object, widget: unknown, options: Record<string, Function>) {
    renderCalls++; assert.equal(this, api); assert.equal(widget, h.widget);
    assert.equal(Object.keys(options).join(), "error-callback");
    assert.equal(options["error-callback"], options["error-callback"]);
    assert.equal(options["error-callback"]!("200500", canary), true);
    return "synthetic-widget-id";
  } };
  h.window.turnstile = api;
  h.wake(); // Discovery is explicit; publication itself remains untouched.
  assert.equal(renderCalls, 0);
  assert.equal(api.render(h.widget, { "error-callback": (code: unknown, token: unknown) => {
    callbackCalls++; assert.equal(code, "200500"); assert.equal(token, canary); return true;
  } }), "synthetic-widget-id");
  assert.equal(renderCalls, 1); assert.equal(callbackCalls, 1);
  const d = h.sample(); assert.equal(d.renderObserved, true); assert.equal(d.events.error, 1);
  assert.equal(d.errorFamilies.frame_load, 1); assert.equal(d.hooks.success, false);
  assert.equal(JSON.stringify(d).includes(canary), false);
});

test("opaque callbacks and hostile SDK objects cannot change ordinary assignment behavior", () => {
  const h = lifecycleHarness();
  const api = new Proxy({}, { getOwnPropertyDescriptor() { throw Error(canary); } });
  assert.doesNotThrow(() => { h.window.turnstile = api; });
  assert.equal(h.window.turnstile, api);
  assert.equal(h.sample().availability, "unavailable");
});

test("all explicit lifecycle hooks preserve ordering and errors remain separate from readiness", () => {
  const h = lifecycleHarness(), order: string[] = [];
  const names = ["callback", "error-callback", "expired-callback", "timeout-callback", "before-interactive-callback", "after-interactive-callback"];
  const api = {render(_widget: unknown, options: Record<string, Function>) {
    for (const name of names) options[name]!(name === "error-callback" ? "110600" : canary);
    order.push("render_return"); return 7;
  }};
  h.window.turnstile = api;
  h.wake(); // Discovery is explicit; publication itself remains untouched.
  const options = Object.fromEntries(names.map(name => [name, () => {order.push(name); return name === "error-callback" ? false : undefined;}]));
  assert.equal(api.render(h.widget, options), 7);
  assert.deepEqual(order, [...names, "render_return"]);
  const d = h.sample(); assert.equal(d.availability, "observed");
  assert.deepEqual(Object.values(d.events), [1, 1, 1, 1, 1, 1]);
  assert.equal(d.errorFamilies.timeout, 1); assert.equal("state" in d, false);
  assert.equal(JSON.stringify(d).includes(canary), false);
  const impossible = structuredClone(d); impossible.events.error = 0;
  assert.equal(reduceLifecycle(impossible).availability, "unavailable");
});

test("readonly callback properties and render exceptions pass through unchanged", () => {
  const h = lifecycleHarness(), failure = Error(canary), callback = () => false;
  const options = Object.freeze({"error-callback": callback});
  const api = {render(_widget: unknown, received: typeof options) {
    assert.equal(received["error-callback"], callback); throw failure;
  }};
  h.window.turnstile = api;
  h.wake(); // Discovery is explicit; publication itself remains untouched.
  assert.throws(() => api.render(h.widget, options), error => error === failure);
  assert.equal(h.sample().availability, "unavailable");
});

test("frame-element geometry follows open and closed shadow hosts without enumerating challenge DOM", () => {
  for (const mode of ["open", "closed"]) {
    const widget = { isConnected: true };
    class ShadowRoot { host = widget; mode = "closed"; }
    const root = new ShadowRoot(); root.mode = mode;
    const frame = { isConnected: true, parentNode: root, getRootNode: () => root,
      getBoundingClientRect: () => ({ width: 300, height: 80 }) };
    Object.assign(root, { parentNode: null, getRootNode: () => root });
    const result = runInNewContext(`(${boundFrameGeometry.toString()})(frame,widget)`, { frame, widget, ShadowRoot, getComputedStyle: () => ({ visibility: "visible" }) });
    assert.equal(result.bound, true); assert.equal(result.visible, true);
    frame.isConnected = false;
    assert.equal(runInNewContext(`(${boundFrameGeometry.toString()})(frame,widget)`, { frame, widget, ShadowRoot }).bound, false);
  }
});

test("frame discovery filters provider policy and widget association, bounds ambiguity and handles detachment", async () => {
  const main = {}, widget = {} as JSHandle<Element | null>;
  const frame = (url: string, bound = true, visible = true, detached = false) => ({ parentFrame: () => main, url: () => url, isDetached: () => detached,
    frameElement: async () => ({ evaluate: async () => ({ bound, visible }), dispose: async () => {} }) });
  const provider = "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/frame";
  const inspect = (frames: unknown[]) => observeProviderFrame({ mainFrame: () => main, frames: () => [main, ...frames] } as unknown as Page, widget, "turnstile");
  assert.equal((await inspect([frame("https://unrelated.example/frame")])).visibility, "unavailable");
  assert.equal((await inspect([frame(provider, false)])).visibility, "unavailable");
  assert.equal((await inspect([frame(provider)])).visibility, "visible");
  assert.equal((await inspect([frame(provider, true, false)])).visibility, "hidden");
  assert.equal((await inspect([frame(provider), frame(provider)])).visibility, "ambiguous");
  assert.equal((await inspect([frame(provider, true, true, true)])).visibility, "unavailable");
  assert.equal((await inspect(Array.from({length: 33}, () => frame(provider)))).visibility, "unavailable");
});

test("summary retains evicted nonfatal blocks and HTTP errors without changing v3 serialization", () => {
  const trace = new VerificationDiagnostics();
  trace.network(reduceNetwork("unapproved_read", "unapproved", "GET", "fetch", "child"));
  trace.network(reduceNetwork("response", "turnstile_platform", "GET", "fetch", "child", 401));
  for (let i = 0; i < 42; i++) trace.network(reduceNetwork("response", "turnstile_platform", "POST", "xhr", "child", 200));
  const legacy = trace.snapshot(), current = trace.snapshotV4();
  assert.equal(legacy.firstFailure, null); assert.equal(legacy.omittedNetworkEvents, 12);
  assert.equal("summary" in legacy, false); assert.equal(legacy.version, "browserdriver.verification-diagnostics.v3");
  assert.equal(current.summary.counters.reduce((sum, row) => sum + row.blockedReads, 0), 1);
  assert.equal(current.summary.counters.reduce((sum, row) => sum + row.provider4xx, 0), 1);
  assert.equal(current.summary.firstAbnormal?.reason, "unapproved_read");
  assert.equal(current.summary.lastAbnormal?.status, "4xx");
  current.summary.firstAbnormal!.reason = "response";
  assert.equal(trace.snapshotV4().summary.firstAbnormal?.reason, "unapproved_read");
});

test("summary separates shutdown observations and preserves fatal failure beyond ring eviction", () => {
  const trace = new VerificationDiagnostics();
  trace.network(reduceNetwork("provider_frame", "turnstile_platform"));
  trace.beginShutdown();
  for (let i = 0; i < 40; i++) trace.network(reduceNetwork("shutdown_blocked", "application"));
  const d = trace.snapshotV4();
  assert.equal(d.firstFailure?.reason, "provider_frame");
  assert.equal(d.summary.fatalReasons.find(r => r.reason === "provider_frame")!.count, 1);
  assert.equal(d.summary.counters.filter(r => r.phase === "shutdown").reduce((sum, row) => sum + row.events, 0), 40);
  assert.equal(d.summary.counters.filter(r => r.phase === "shutdown").reduce((sum, row) => sum + row.fatal, 0), 0);
});

test("summary counters saturate with an explicit flag", () => {
  const summary = new VerificationNetworkSummary();
  const event = reduceNetwork("response", "turnstile_script");
  for (let i = 0; i <= summaryLimit; i++) summary.observe(event);
  const snapshot = summary.snapshot();
  assert.equal(snapshot.saturated, true);
  assert.equal(snapshot.counters.find(r => r.phase === "active" && r.endpoint === "turnstile_script")!.events, summaryLimit);
});

test("v8 emits v4 after teardown while v7 keeps the exact v3 surface", async () => {
  for (const version of ["udon.browser-driver.v7", "udon.browser-driver.v8"] as const) {
    for (const scenario of ["ready", "api_exception", "policy", "unstarted"] as const) {
      const result = await runFakeProbe(scenario, "turnstile", version);
      assert.doesNotThrow(() => parseInput(JSON.stringify(result.request)));
      const d = result.messages.at(-2)!.diagnostics as Record<string, unknown> | null;
      if (scenario === "unstarted") assert.equal(d, null);
      else { assert.equal(d!.version, version.endsWith("v8") ? "browserdriver.verification-diagnostics.v4" : "browserdriver.verification-diagnostics.v3"); assert.equal("summary" in d!, version.endsWith("v8")); }
      assert.equal(JSON.stringify(result.messages).includes(canary), false);
    }
  }
  const result = await runFakeProbe("ready", "turnstile", "udon.browser-driver.v8");
  assert.throws(() => parseInput(JSON.stringify({...result.request, type: "register"})));
});

test("optional lifecycle evaluation failure cannot change a matching ready response", async () => {
  const {messages} = await runFakeProbe("lifecycle_exception", "turnstile", "udon.browser-driver.v8");
  assert.equal(messages.at(-1)!.result, "success");
  const d = messages.at(-2)!.diagnostics as {lifecycle: {availability: string}; observations: Array<{reason: string}>};
  assert.equal(d.lifecycle.availability, "unavailable");
  assert.equal(d.observations.at(-1)!.reason, "response_ready");
  assert.equal(JSON.stringify(messages).includes(canary), false);
});
