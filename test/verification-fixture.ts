import type { VerificationDescriptor } from "../src/protocol.js";
import { inputRequest } from "./registration-input-fixture.js";

export function verificationDescriptor(provider: VerificationDescriptor["provider"] = "turnstile", activation: VerificationDescriptor["activation"] = "before_approval", origin = "https://registration.example"): VerificationDescriptor {
  return { provider, activation, widgetBinding: "single_in_submit_form", submissionURL: origin + "/register",
    dependencies: { policy: `${provider}.v1`, maxRequests: 256, maxResponseBytes: 33_554_432, timeoutMs: 120_000 } };
}

export function verificationRequest(provider: VerificationDescriptor["provider"] = "turnstile", activation: VerificationDescriptor["activation"] = "before_approval", origin = "https://registration.example") {
  const request = inputRequest(origin);
  request.version = "udon.browser-driver.v6";
  request.profile.profile = "uws.browser-registration.1.2";
  request.profile.flows.member!.humanVerification = verificationDescriptor(provider, activation, origin);
  request.controls.verification = "reviewed_flow";
  request.deadline = new Date(Date.now() + 120_000).toISOString();
  return request;
}

