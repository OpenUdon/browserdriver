import type { VerificationDescriptor } from "./protocol.js";
import { verificationStates, type VerificationState } from "./verification-policy.js";

// This is an internal, separately versioned diagnostic surface. Driver v6
// messages do not gain fields. Never accept URLs, provider prose or DOM values.
export const probeReasons = ["unbound", "form_binding", "widget_binding", "response_binding",
  "api_loading", "response_pending", "enterprise", "expiry_api_missing", "provider_expired",
  "response_type", "response_changed", "response_mismatch", "response_ready", "visible_frame",
  "no_visible_frame", "api_exception", "evaluation_failed", "invalid_observation"] as const;
export type ProbeReason = typeof probeReasons[number];
export const responseKinds = ["unobserved", "undefined", "string", "null", "other"] as const;
export type ResponseKind = typeof responseKinds[number];
export interface VerificationObservation { state: VerificationState; reason: ProbeReason; responseKind: ResponseKind }
export const networkReasons = ["response", "unapproved_read", "invalid_url", "persistent_channel",
  "provider_frame", "request_budget", "provider_redirect", "response_stream", "response_download",
  "response_budget", "unapproved_destination", "application_frame", "application_navigation",
  "application_mutation", "response_transport", "response_body", "response_fulfill", "route_transport",
  "application_redirect", "redirect_transport", "popup", "download", "external_rejection",
  "provider_redirect_followed", "provider_redirect_target", "provider_redirect_limit", "shutdown_blocked"] as const;
export type NetworkReason = typeof networkReasons[number];
export type EndpointClass = "application" | "turnstile_script" | "turnstile_platform" |
  "recaptcha_api" | "recaptcha_static" | "hcaptcha_script" | "hcaptcha_service" | "unapproved";
export interface NetworkDiagnostic {
  phase: "active" | "shutdown";
  frameFailure: "none" | "main_navigation" | "main_origin" | "ancestor_url" | "ancestor_depth" | "unattached";
  reason: NetworkReason;
  endpoint: EndpointClass;
  method: "GET" | "HEAD" | "POST" | "other";
  resource: "document" | "script" | "stylesheet" | "image" | "xhr" | "fetch" | "other";
  frame: "main" | "child" | "unavailable";
  status: "none" | "1xx" | "2xx" | "3xx" | "4xx" | "5xx" | "other";
  transport: "none" | "timeout" | "dns" | "tls" | "connection" | "other";
}

export function transportClass(error: unknown): NetworkDiagnostic["transport"] {
  if (!(error instanceof Error)) return "other";
  // Inspect only to classify; retain neither the exception nor matching text.
  if (error.name === "TimeoutError" || /\b(?:ETIMEDOUT|ERR_TIMED_OUT)\b/u.test(error.message)) return "timeout";
  if (/\b(?:ENOTFOUND|EAI_AGAIN|ERR_NAME_NOT_RESOLVED)\b/u.test(error.message)) return "dns";
  if (/\b(?:ERR_CERT_[A-Z_]+|CERT_[A-Z_]+|UNABLE_TO_VERIFY_LEAF_SIGNATURE|SELF_SIGNED_CERT_IN_CHAIN)\b/u.test(error.message)) return "tls";
  if (/\b(?:ECONNRESET|ECONNREFUSED|EPIPE|ERR_CONNECTION_[A-Z_]+)\b/u.test(error.message)) return "connection";
  return "other";
}

export function endpointClass(provider: VerificationDescriptor["provider"], raw: string, applicationOrigins: ReadonlySet<string>): EndpointClass {
  try {
    const url = new URL(raw);
    if (applicationOrigins.has(url.origin)) return "application";
    // These are labels, never permission decisions. Suffix boundaries remain
    // exact, and neither variable subdomains nor path/query values are emitted.
    if (provider === "turnstile" && url.hostname === "challenges.cloudflare.com")
      return url.pathname.startsWith("/turnstile/") ? "turnstile_script" : "turnstile_platform";
    if (provider === "recaptcha_v2") {
      if (url.hostname === "www.gstatic.com") return "recaptcha_static";
      if (["www.google.com", "www.recaptcha.net"].includes(url.hostname)) return "recaptcha_api";
    }
    if (provider === "hcaptcha" && (url.hostname === "hcaptcha.com" || url.hostname.endsWith(".hcaptcha.com")))
      return url.hostname === "js.hcaptcha.com" ? "hcaptcha_script" : "hcaptcha_service";
  } catch { /* Deliberately discard malformed input. */ }
  return "unapproved";
}

export function reduceNetwork(reason: NetworkReason, endpoint: EndpointClass, method = "", resource = "", frame: NetworkDiagnostic["frame"] = "unavailable", status = 0, transport: NetworkDiagnostic["transport"] = "none"): NetworkDiagnostic {
  return { reason, endpoint, phase: "active", frameFailure: "none", method: method === "GET" || method === "HEAD" || method === "POST" ? method : "other",
    resource: resource === "document" || resource === "script" || resource === "stylesheet" || resource === "image" || resource === "xhr" || resource === "fetch" ? resource : "other",
    frame, transport, status: status >= 100 && status < 200 ? "1xx" : status >= 200 && status < 300 ? "2xx" :
      status >= 300 && status < 400 ? "3xx" : status >= 400 && status < 500 ? "4xx" : status >= 500 && status < 600 ? "5xx" : status === 0 ? "none" : "other" };
}

export class VerificationDiagnostics {
  private phase: "active" | "shutdown" = "active";
  beginShutdown(): void { this.phase = "shutdown"; }
  private observations: VerificationObservation[] = [];
  private events: NetworkDiagnostic[] = [];
  private omittedObservations = 0;
  private omittedEvents = 0;
  private firstFailure: NetworkDiagnostic | null = null;
  observe(value: unknown): VerificationObservation {
    const candidate = value as Partial<VerificationObservation> | null;
    const observation: VerificationObservation = candidate && verificationStates.includes(candidate.state as VerificationState) && probeReasons.includes(candidate.reason as ProbeReason) && responseKinds.includes(candidate.responseKind as ResponseKind)
      ? { state: candidate.state!, reason: candidate.reason!, responseKind: candidate.responseKind! } : { state: "unsupported", reason: "invalid_observation", responseKind: "unobserved" };
    const previous = this.observations.at(-1);
    if (previous?.state !== observation.state || previous.reason !== observation.reason || previous.responseKind !== observation.responseKind) {
      if (this.observations.length === 32) { this.observations.shift(); this.omittedObservations++; }
      this.observations.push(observation);
    }
    return observation;
  }
  network(event: NetworkDiagnostic): void {
    event = { ...event, phase: this.phase };
    if (event.phase === "active" && !["response", "unapproved_read", "provider_redirect_followed"].includes(event.reason)) this.firstFailure ??= { ...event };
    if (this.events.length === 32) { this.events.shift(); this.omittedEvents++; }
    this.events.push({ ...event });
  }
  snapshot() {
    return { version: "browserdriver.verification-diagnostics.v3" as const,
      observations: this.observations.map(value => ({ ...value })), omittedObservations: this.omittedObservations,
      network: this.events.map(value => ({ ...value })), omittedNetworkEvents: this.omittedEvents,
      firstFailure: this.firstFailure && { ...this.firstFailure } };
  }
}
