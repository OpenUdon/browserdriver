import assert from "node:assert/strict";
import test from "node:test";
import { DriverFailure, parseInput, type VerificationDescriptor } from "../src/protocol.js";
import { permitsVerificationURL, VerificationSubmission } from "../src/verification-policy.js";
import { validateRegistrationMessage } from "../src/registration.js";
import { inputRequest } from "./registration-input-fixture.js";

import { verificationDescriptor, verificationRequest } from "./verification-fixture.js";

test("v6 explicitly binds 1.2 and refuses legacy/new authority mixing before launch", () => {
  const valid = verificationRequest();
  assert.doesNotThrow(() => validateRegistrationMessage(valid));
  for (const mutate of [
    (r: typeof valid) => { r.version = "udon.browser-driver.v5"; },
    (r: typeof valid) => { r.profile.profile = "uws.browser-registration.1.1"; },
    (r: typeof valid) => { delete r.controls.verification; },
    (r: typeof valid) => { r.deadline = new Date(0).toISOString(); },
    (r: typeof valid) => { r.profile.flows.member!.humanVerification!.dependencies.policy = "hcaptcha.v1"; },
    (r: typeof valid) => { r.profile.flows.member!.humanVerification!.dependencies.maxRequests = 257; },
    (r: typeof valid) => { r.profile.flows.member!.sequence.splice(2, 0, { human_checkpoint: { kind: "captcha" } }); },
    (r: typeof valid) => { r.profile.flows.member!.humanVerification!.submissionURL = "https://evil.example/register"; },
  ]) {
    const request = structuredClone(valid); mutate(request);
    assert.throws(() => validateRegistrationMessage(request), DriverFailure);
  }
  assert.throws(() => parseInput(JSON.stringify({ ...valid, version: "udon.browser-driver.v7" })), DriverFailure);
  assert.throws(() => parseInput(JSON.stringify({ ...valid, credentialEnvironment: {} })), DriverFailure);
  const old = inputRequest();
  assert.doesNotThrow(() => validateRegistrationMessage(old));
});

test("provider policy has DNS, path, scheme, method and frame boundaries", () => {
  for (const [provider, good] of [["turnstile", "https://challenges.cloudflare.com/turnstile/v0/api.js"],
    ["recaptcha_v2", "https://www.google.com/recaptcha/api2/reload"],
    ["hcaptcha", "https://new.assets.hcaptcha.com/captcha/v1/script.js"]] as const) {
    assert.equal(permitsVerificationURL(provider, good, "GET"), true);
    for (const bad of [good.replace("https:", "http:"), good.replace(".com/", ".com.evil.example/"), good.replace("https://", "https://user@"), good.replace(".com/", ".com:8443/"), good + "#fragment"]) {
      assert.equal(permitsVerificationURL(provider, bad, "GET"), false, bad);
    }
    assert.equal(permitsVerificationURL(provider, good, "DELETE"), false);
  }
  for (const bad of ["https://www.google.com/search", "https://www.google.com/recaptcha/enterprise.js", "https://www.google.com/recaptcha/%2fsecret", "https://hcaptcha.com.evil.example/a", "https://evilhcaptcha.com/a"]) {
    assert.equal(permitsVerificationURL("recaptcha_v2", bad, "GET"), false);
    assert.equal(permitsVerificationURL("hcaptcha", bad, "GET"), false);
  }
  assert.equal(permitsVerificationURL("recaptcha_v2", "https://www.recaptcha.net/recaptcha/api.js", "GET"), true);
  assert.equal(permitsVerificationURL("recaptcha_v2", "https://www.gstatic.com/recaptcha/releases/a.js", "POST"), false);
  assert.equal(permitsVerificationURL("recaptcha_v2", "https://www.gstatic.com/recaptcha/releases/a.js", "GET", true), false);
});

test("background and invisible verification each release at most one application POST", () => {
  for (const mode of ["before_approval", "approved_submit"] as const) {
    const submission = new VerificationSubmission(verificationDescriptor("turnstile", mode), 500_000, () => 1_000);
    if (mode === "before_approval") submission.observe("ready");
    submission.approve(); submission.trigger();
    if (mode === "approved_submit") { submission.observe("awaiting_interaction"); submission.observe("ready"); }
    submission.release("ready");
    assert.equal(submission.postCount(), 1);
    assert.throws(() => submission.release("ready"), DriverFailure);
    assert.equal(submission.postCount(), 1);
  }
});

test("premature, expired, failed, unsupported, duplicate-trigger and late states stop without POST", () => {
  for (const state of ["loading", "awaiting_interaction", "expired", "failed", "unsupported"] as const) {
    const submission = new VerificationSubmission(verificationDescriptor("hcaptcha", "approved_submit"), 500_000, () => 1_000);
    submission.approve(); submission.trigger();
    assert.throws(() => submission.release(state), DriverFailure);
    assert.throws(() => submission.release("ready"), DriverFailure);
    assert.equal(submission.postCount(), 0);
  }
  let now = 1_000;
  const submission = new VerificationSubmission(verificationDescriptor(), 3_000, () => now);
  submission.observe("ready"); submission.approve();
  now = 3_000;
  assert.throws(() => submission.trigger(), (e: unknown) => e instanceof DriverFailure && e.code === "verification_timeout");
  assert.equal(submission.postCount(), 0);
  const expired = new VerificationSubmission(verificationDescriptor(), 500_000, () => 1_000);
  expired.observe("ready"); expired.approve();
  assert.throws(() => expired.observe("loading"), (e: unknown) => e instanceof DriverFailure && e.code === "verification_expired");
  const duplicate = new VerificationSubmission(verificationDescriptor("turnstile", "approved_submit"), 500_000, () => 1_000);
  duplicate.approve(); duplicate.trigger();
  assert.throws(() => duplicate.trigger(), DriverFailure);
});
