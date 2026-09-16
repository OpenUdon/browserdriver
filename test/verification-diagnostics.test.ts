import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { browserVerificationProbe } from "../src/verification.js";
import { endpointClass, reduceNetwork, transportClass, VerificationDiagnostics, type VerificationObservation } from "../src/verification-diagnostics.js";
import { VerificationSubmission } from "../src/verification-policy.js";
import { verificationDescriptor } from "./verification-fixture.js";

const canary = "private-token-credential-provider-prose-canary";
function probeHarness(provider: "turnstile" | "recaptcha_v2" | "hcaptcha") {
  let calls = 0, rendered = false, value: unknown = "", fieldValue = "", fail = false, expired = false, visible = false;
  const attributes = {target: "", method: "post", action: "https://registration.example/register"};
  const form: Record<string, unknown> = {...attributes};
  const prototype = Object.fromEntries([]);
  for (const name of ["action", "method", "target"] as const) Object.defineProperty(prototype, name, {get: () => attributes[name]});
  const overrides: Record<string, string> = {};
  const widget = {matches: () => true};
  const field = {form, get value() {return fieldValue;}};
  const element = {form, isConnected: true, type: "submit", hasAttribute: (name: string) => name in overrides,
    get formAction() { return overrides.formaction; }, get formMethod() { return overrides.formmethod; }, get formTarget() { return overrides.formtarget; }};
  const binding = {form, widget};
  const api = {isExpired: () => {calls++; if (!rendered) throw Error(canary); return expired;},
    getResponse: () => {calls++; if (!rendered || fail) throw Error(canary); return value;}};
  const context = {HTMLFormElement: {prototype}, Node: {prototype: {contains: () => true}}, element, binding, options: {provider, submissionURL: attributes.action, frameVisibility: "unavailable"}, window: {
    [provider === "turnstile" ? "turnstile" : provider === "recaptcha_v2" ? "grecaptcha" : "hcaptcha"]: api},
    document: {querySelectorAll: (selector: string) => selector.startsWith(".cf-") ? [widget] : selector === "iframe" ? visible ? [{getBoundingClientRect:()=>({width:100,height:100})}] : [] : rendered ? [field] : []},getComputedStyle:()=>({visibility:"visible"})};
  return {probe: () => runInNewContext(`(${browserVerificationProbe.toString()})(element, options, binding)`, context) as VerificationObservation,
    shadow: () => {for (const key of ["action", "method", "target", "contains", "getAttribute", "append", "submit"]) form[key] = {value: canary};},
    attribute: (key: keyof typeof attributes, value: string) => {attributes[key] = value;},
    override: (key: string, value: string) => {overrides[key] = value;},
    render: () => {rendered = true;}, ready: () => {value = fieldValue = canary;}, remove: () => {rendered = false;}, fail: () => {fail = true;}, calls: () => calls, set: (response:unknown, field="")=>{value=response;fieldValue=field;}, expire:()=>{expired=true;}, visible:()=>{visible=true;context.options.frameVisibility="visible";}};
}

test("provider API presence before rendering stays loading without invoking getResponse or isExpired", () => {
  for (const provider of ["turnstile", "recaptcha_v2", "hcaptcha"] as const) {
    const h = probeHarness(provider), trace = new VerificationDiagnostics();
    assert.equal(trace.observe(h.probe()).reason, "response_pending");
    assert.equal(h.calls(), 0);
    h.render();
    assert.equal(trace.observe(h.probe()).state, "loading");
    h.ready();
    const ready = trace.observe(h.probe());
    assert.equal(ready.state, "ready");
    const submission = new VerificationSubmission(verificationDescriptor(provider), Date.now() + 120_000);
    submission.observe(ready.state); submission.approve();
    h.remove();
    assert.throws(() => submission.observe(trace.observe(h.probe()).state));
    assert.equal(submission.postCount(), 0);
    assert.equal(JSON.stringify(trace.snapshot()).includes(canary), false);
  }
});

test("API errors after rendering remain terminal and export only a closed reason", () => {
  for (const provider of ["turnstile", "recaptcha_v2", "hcaptcha"] as const) {
    const h = probeHarness(provider), trace = new VerificationDiagnostics();
    h.render(); h.fail();
    const observation = trace.observe(h.probe());
    assert.equal(observation.state, "failed");
    assert.equal(observation.reason, "api_exception");
    assert.equal(JSON.stringify(trace.snapshot()).includes(canary), false);
  }
});

test("diagnostic reduction closes untrusted values, bounds history and preserves the first rejection", () => {
  const trace = new VerificationDiagnostics(), origins = new Set(["https://registration.example"]);
  assert.equal(trace.observe({state: "ready", reason: canary, response: canary}).state, "unsupported");
  trace.observe({state: "loading", reason: "api_loading", responseKind: "unobserved", response: canary});
  const event = reduceNetwork("provider_frame", endpointClass("hcaptcha", `https://${canary}.hcaptcha.com/${canary}?response=${canary}`, origins), canary, canary, "child", 403);
  trace.network(event);
  event.reason = "response";
  for (let i = 0; i < 100; i++) {
    trace.observe({state: i % 2 ? "loading" : "awaiting_interaction", reason: i % 2 ? "api_loading" : "visible_frame", responseKind: "unobserved"});
    trace.network(reduceNetwork("response", "recaptcha_api", "POST", "fetch", "child", 200));
  }
  const snapshot = trace.snapshot();
  assert.equal(snapshot.observations.length, 32);
  assert.equal(snapshot.network.length, 32);
  assert.ok(snapshot.omittedObservations > 0 && snapshot.omittedNetworkEvents > 0);
  assert.equal(snapshot.firstFailure?.reason, "provider_frame");
  snapshot.firstFailure!.reason = "response";
  assert.equal(trace.snapshot().firstFailure?.reason, "provider_frame");
  assert.equal(JSON.stringify(snapshot).includes(canary), false);
  assert.equal(endpointClass("hcaptcha", "https://hcaptcha.com.evil.example/", origins), "unapproved");
  assert.equal(transportClass(new Error("ECONNRESET " + canary)), "connection");
  assert.equal(transportClass(new Error("ENOTFOUND " + canary)), "dns");
  assert.equal(transportClass(new Error("CERT_HAS_EXPIRED " + canary)), "tls");
  assert.equal(transportClass(new Error(canary)), "other");
});


test("only initial Turnstile undefined is pending; unsupported values and field contradictions stop", () => {
  const h = probeHarness("turnstile"); h.render(); h.set(undefined);
  assert.equal(h.probe().state,"loading"); assert.equal(h.probe().responseKind,"undefined");
  h.visible(); assert.equal(h.probe().state,"awaiting_interaction");
  h.set(undefined,canary); assert.equal(h.probe().reason,"response_mismatch");
  for (const provider of ["turnstile","recaptcha_v2","hcaptcha"] as const) {
    for (const value of [null,0,false,{},undefined]) {
      if(provider==="turnstile"&&value===undefined)continue;
      const unsupported=probeHarness(provider);unsupported.render();unsupported.set(value);
      assert.equal(unsupported.probe().state,"unsupported");assert.equal(unsupported.probe().reason,"response_type");
    }
  }
});

test("pending responses never release a POST, and losing or replacing readiness invalidates either approval mode", () => {
  for (const activation of ["before_approval","approved_submit"] as const) {
    for(const replacement of [undefined,"","replacement",null]) {
      const h=probeHarness("turnstile");h.render();h.set(undefined);
      const descriptor=verificationDescriptor("turnstile",activation);
      const premature=new VerificationSubmission(descriptor,Date.now()+120_000);
      premature.observe(h.probe().state);
      if(activation==="approved_submit") {premature.approve();premature.trigger();assert.throws(()=>premature.release(h.probe().state));}
      else assert.throws(()=>premature.approve());
      assert.equal(premature.postCount(),0);
      const submission=new VerificationSubmission(descriptor,Date.now()+120_000);
      submission.observe(h.probe().state);
      assert.equal(submission.postCount(),0);
      h.ready();submission.observe(h.probe().state);submission.approve();
      h.set(replacement,typeof replacement==="string"?replacement:"");
      assert.equal(h.probe().state,"expired");
      assert.throws(()=>submission.observe(h.probe().state));
      assert.equal(submission.postCount(),0);
    }
  }
  const h=probeHarness("turnstile");h.render();h.ready();assert.equal(h.probe().state,"ready");h.expire();
  assert.equal(h.probe().reason,"provider_expired");
});

test("response kind is closed, retained across state deduplication and never contains a response", () => {
  const h=probeHarness("turnstile"),trace=new VerificationDiagnostics();h.render();h.set(undefined);trace.observe(h.probe());
  h.set("");trace.observe(h.probe());h.ready();trace.observe(h.probe());
  assert.deepEqual(trace.snapshot().observations.map(o=>o.responseKind),["undefined","string","string"]);
  assert.equal(JSON.stringify(trace.snapshot()).includes(canary),false);
  assert.equal(trace.observe({state:"ready",reason:"response_ready",responseKind:canary}).reason,"invalid_observation");
});


test("named form controls cannot hide native destinations, methods, targets or submitter overrides", () => {
  for (const provider of ["turnstile", "recaptcha_v2", "hcaptcha"] as const) {
    const good = probeHarness(provider); good.shadow(); good.render(); good.ready();
    assert.equal(good.probe().state, "ready");
    assert.equal(JSON.stringify(good.probe()).includes(canary), false);
    for (const [name, value] of [["action", "https://escape.example/register"], ["method", "get"], ["target", "_blank"]] as const) {
      const changed = probeHarness(provider); changed.shadow(); changed.render(); changed.ready(); changed.attribute(name, value);
      assert.equal(changed.probe().reason, "form_binding");
    }
    for (const [name, value] of [["formaction", "https://escape.example/register"], ["formaction", ""], ["formmethod", "get"], ["formtarget", "_blank"]]) {
      const changed = probeHarness(provider); changed.shadow(); changed.render(); changed.ready(); changed.override(name!, value!);
      assert.equal(changed.probe().reason, "form_binding");
    }
    good.override("formaction", "https://registration.example/register"); good.override("formmethod", "POST"); good.override("formtarget", "_self");
    assert.equal(good.probe().state, "ready");
  }
});
