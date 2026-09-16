import assert from "node:assert/strict";
import test from "node:test";
import {createContext, runInContext} from "node:vm";
import {installInitializationObserver, emptyInitialization, reduceInitializationEvents} from "../src/verification-initialization.js";
import {installLifecycleObserver} from "../src/verification-lifecycle.js";
import {VerificationDiagnostics} from "../src/verification-diagnostics.js";
import {runFakeProbe} from "./verification-probe-fixture.js";
import {parseInput} from "../src/protocol.js";

const canary = "private-token-url-error-policy-canary";
function collector() {
  class Element {children: Element[] = [];}
  class Document extends Element {}
  class Script extends Element {
    constructor(readonly src = "") {super();}
    hasAttribute() {return this.src !== "";}
  }
  class ErrorEvent {isTrusted = true; target = null; filename = ""; message = canary; error = Error(canary);}
  const documentListeners = new Map<string, Function[]>(), windowListeners = new Map<string, Function[]>();
  const listen = (listeners: Map<string, Function[]>) => (name: string, fn: Function, capture: boolean) => {
    assert.equal(capture, true);
    listeners.set(name, [...listeners.get(name) ?? [], fn]);
  };
  const document = Object.assign(new Document(), {baseURI: "https://application.example/register",
    addEventListener: listen(documentListeners),
    createTreeWalker: (node: Element) => {const items = [...node.children]; return {nextNode: () => items.shift() ?? null};}});
  let mutation: Function = () => {};
  const window = {location: {origin: "https://application.example"}, top: null as unknown,
    addEventListener: listen(windowListeners)};
  window.top = window;
  const realm = createContext({window, document, Element, Document, HTMLScriptElement: Script, ErrorEvent, URL,
    NodeFilter: {SHOW_ELEMENT: 1}, MutationObserver: class {constructor(fn: Function) {mutation = fn;} observe() {}}});
  runInContext(`(${installInitializationObserver.toString()})({key:'sample',applicationOrigins:['https://application.example']})`, realm);
  return {window, Script, ErrorEvent, emit: (name: string, event: object) => {
    // Model the special load-event path: resource load excludes Window.
    for (const listeners of name === "load" ? [documentListeners] : [windowListeners, documentListeners])
      for (const fn of listeners.get(name) ?? []) fn(event);
  },
    add: (node: Element) => mutation([{addedNodes: [node]}]),
    sample: () => reduceInitializationEvents(runInContext("window.sample()", realm))!};
}

test("passive collector reduces trusted browser load/error/CSP events without retaining raw values", () => {
  const h = collector(), sdk = new h.Script("https://challenges.cloudflare.com/turnstile/v0/api.js?" + canary);
  assert.equal(Object.hasOwn(h.window, "turnstile"), false);
  h.add(sdk); h.emit("load", {isTrusted: true, target: sdk});
  h.emit("error", {isTrusted: true, target: new h.Script("https://unapproved.example/" + canary)});
  h.emit("error", Object.assign(new h.ErrorEvent(), {filename: "https://application.example/" + canary}));
  h.emit("securitypolicyviolation", {isTrusted: true, effectiveDirective: "script-src-elem", disposition: "enforce", blockedURI: "https://challenges.cloudflare.com", originalPolicy: canary});
  h.emit("securitypolicyviolation", {isTrusted: true, effectiveDirective: "script-src", disposition: "report", blockedURI: "inline", sample: canary});
  h.emit("error", {isTrusted: false, target: sdk});
  h.emit("securitypolicyviolation", {isTrusted: true, effectiveDirective: "img-src", disposition: "enforce", blockedURI: canary});
  const v = h.sample(); assert.equal(v.coverage, "observed");
  assert.equal(v.counters[0]!.script_seen, 1); assert.equal(v.counters[0]!.script_load, 1);
  assert.equal(v.counters[0]!.script_policy_enforced, 1); assert.equal(v.counters[2]!.script_error, 1);
  assert.equal(v.counters[1]!.execution_error, 1); assert.equal(v.counters[3]!.script_policy_report, 1);
  assert.equal(JSON.stringify(v).includes(canary), false);
  assert.equal(Object.hasOwn(h.window, "turnstile"), false);
});

test("initialization summaries preserve evicted errors and API availability; returned snapshots are detached", () => {
  const h = collector(), trace = new VerificationDiagnostics();
  h.emit("error", new h.ErrorEvent());
  trace.observeAPI({globalProperty: "data", api: "callable_get_response"});
  for (let i = 0; i < 40; i++) {
    h.emit("load", {isTrusted: true, target: new h.Script("https://application.example/synthetic.js")});
    trace.observeAPI({globalProperty: "data", api: i % 2 ? "missing" : "incomplete"});
  }
  trace.observeInitialization(h.sample());
  const v = trace.snapshotV5().initialization;
  assert.equal(v.apiEverCallable, true); assert.equal(v.omittedChanges, 9);
  assert.equal(v.events.length, 32); assert.equal(v.omittedEvents, 49);
  assert.equal(v.counters[4]!.execution_error, 1);
  v.counters[4]!.execution_error = 0; v.changes.length = 0;
  assert.equal(trace.snapshotV5().initialization.counters[4]!.execution_error, 1);
  trace.observeInitialization(null); assert.equal(trace.snapshotV5().initialization.coverage, "partial");
  assert.equal("initialization" in trace.snapshotV4(), false); assert.equal("initialization" in trace.snapshot(), false);
});

test("collector bounds script scanning and rejects forged totals and unfounded saturation", () => {
  const h = collector();
  for (let i = 0; i < 257; i++) h.add(new h.Script("https://application.example/a.js"));
  const v = h.sample(); assert.equal(v.coverage, "partial"); assert.equal(v.counters[1]!.script_seen, 256);
  assert.equal(reduceInitializationEvents({...v, saturated: true}), null);
  const bad = structuredClone(v); bad.counters[1]!.script_seen--; assert.equal(reduceInitializationEvents(bad), null);
  assert.equal(reduceInitializationEvents({...v, omittedEvents: 1_000_001}), null);
  const trace = new VerificationDiagnostics(); trace.observeInitialization(v); trace.observeInitialization(emptyInitialization());
  assert.equal(trace.snapshotV5().initialization.counters[1]!.script_seen, 256);
  const saturated = emptyInitialization("observed");
  saturated.events = Array.from({length: 32}, () => ({source: "unknown", kind: "execution_error"}));
  saturated.counters[4]!.execution_error = 1_000_000; saturated.omittedEvents = 1_000_000; saturated.saturated = true;
  assert.ok(reduceInitializationEvents(saturated));
});

test("lifecycle discovery preserves global descriptors, deletion and accessor side effects", () => {
  let reads = 0;
  const window: Record<string, unknown> = {};
  Object.defineProperty(window, "turnstile", {get() {reads++; return {};}, configurable: false});
  const before = Object.getOwnPropertyDescriptor(window, "turnstile");
  const context = {window, document: {querySelectorAll: () => []}, MutationObserver: class {observe() {}}};
  runInContext(`(${installLifecycleObserver.toString()})('observer')`, createContext(context));
  (window.observer as Function)(null);
  assert.equal(reads, 0); assert.deepEqual(Object.getOwnPropertyDescriptor(window, "turnstile"), before);
  const fresh: Record<string, unknown> = {};
  runInContext(`(${installLifecycleObserver.toString()})('observer')`, createContext({...context, window: fresh}));
  fresh.turnstile = {}; const descriptor = Object.getOwnPropertyDescriptor(fresh, "turnstile");
  (fresh.observer as Function)(null); assert.deepEqual(Object.getOwnPropertyDescriptor(fresh, "turnstile"), descriptor);
  assert.equal(delete fresh.turnstile, true); assert.equal("turnstile" in fresh, false);
});

test("immediate render before discovery retains callback behavior with unavailable coverage", () => {
  class Element {isConnected = true; getAttribute() {return null;}}
  const widget = new Element(), window: Record<string, unknown> = {};
  const realm = createContext({window, Element, document: {querySelectorAll: () => [widget], querySelector: () => widget}, MutationObserver: class {observe() {}}});
  runInContext(`(${installLifecycleObserver.toString()})('observer')`, realm);
  let calls = 0;
  const callback = () => {calls++; return false;};
  const api = {render(_widget: unknown, options: {"error-callback": () => boolean}) {return options["error-callback"]();}};
  window.turnstile = api;
  assert.equal(api.render(widget, {"error-callback": callback}), false);
  const first = (window.observer as Function)(widget);
  assert.equal(first.availability, "unavailable"); assert.equal(first.events.error, 0); assert.equal(calls, 1);
  assert.equal(api.render(widget, {"error-callback": callback}), false);
  const second = (window.observer as Function)(widget);
  assert.equal(second.availability, "partial"); assert.equal(second.events.error, 1); assert.equal(calls, 2);
});

test("v9 emits v5 with optional unavailable evidence, while other provider initialization is not applicable", async () => {
  for (const provider of ["turnstile", "recaptcha_v2", "hcaptcha"] as const) {
    for (const scenario of ["ready", "api_exception", "policy", "unstarted"] as const) {
      const result = await runFakeProbe(scenario, provider, "udon.browser-driver.v9");
      assert.doesNotThrow(() => parseInput(JSON.stringify(result.request)));
      assert.throws(() => parseInput(JSON.stringify({...result.request, type: "register"})));
      const d = result.messages.at(-2)!.diagnostics as ReturnType<VerificationDiagnostics["snapshotV5"]> | null;
      if (scenario === "unstarted") assert.equal(d, null);
      else {assert.equal(d!.version, "browserdriver.verification-diagnostics.v5"); assert.equal(d!.initialization.coverage, provider === "turnstile" ? "unavailable" : "not_applicable");}
      assert.equal(JSON.stringify(result.messages).includes(canary), false);
    }
  }
});
