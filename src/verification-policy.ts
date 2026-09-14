import { DriverFailure, isRecord, type VerificationDescriptor } from "./protocol.js";

export const verificationStates = ["loading", "awaiting_interaction", "ready", "expired", "failed", "unsupported"] as const;
export type VerificationState = (typeof verificationStates)[number];

export function validateVerificationDescriptor(value: unknown): asserts value is VerificationDescriptor {
  function bad(): never { throw new DriverFailure("invalid_response"); }
  if (!isRecord(value) || Object.keys(value).sort().join() !== ["provider", "activation", "widgetBinding", "submissionURL", "dependencies"].sort().join()) bad();
  if (!["turnstile", "recaptcha_v2", "hcaptcha"].includes(String(value.provider)) ||
      !["before_approval", "approved_submit"].includes(String(value.activation)) || value.widgetBinding !== "single_in_submit_form" || typeof value.submissionURL !== "string") bad();
  const d = value.dependencies;
  if (!isRecord(d) || Object.keys(d).sort().join() !== ["policy", "maxRequests", "maxResponseBytes", "timeoutMs"].sort().join() || d.policy !== `${String(value.provider)}.v1`) bad();
  for (const [key, maximum] of [["maxRequests", 256], ["maxResponseBytes", 33_554_432], ["timeoutMs", 120_000]] as const) {
    if (!Number.isSafeInteger(d[key]) || Number(d[key]) < 1 || Number(d[key]) > maximum) bad();
  }
}

// Literal adapter-owned policy, never a profile-supplied suffix or selector.
// URL normalization must not turn encoded separators/traversal into authority.
export function permitsVerificationURL(provider: VerificationDescriptor["provider"], raw: string, method: string, document = false): boolean {
  let url: URL;
  try { url = new URL(raw); } catch { return false; }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.port ||
      /[\\\s]/u.test(raw) || /%(?:2e|2f|5c|00)/iu.test(raw.split(/[?#]/u, 1)[0]!) || !["GET", "HEAD", "POST"].includes(method)) return false;
  const host = url.hostname, path = url.pathname;
  if (provider === "turnstile") return host === "challenges.cloudflare.com" &&
    (path.startsWith("/turnstile/") || path.startsWith("/cdn-cgi/challenge-platform/"));
  if (provider === "recaptcha_v2") {
    if (!path.startsWith("/recaptcha/") || path.startsWith("/recaptcha/enterprise")) return false;
    if (host === "www.gstatic.com") return !document && method !== "POST";
    return host === "www.google.com" || host === "www.recaptcha.net";
  }
  return provider === "hcaptcha" && (host === "hcaptcha.com" || /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+hcaptcha\.com$/u.test(host));
}

// Redirects remain inside an already reviewed provider origin and path policy.
// Do not normalize raw escapes into authority, replay a POST, or disguise a
// redirected document's base URL by fulfilling it under its original URL.
export function verificationRedirect(provider: VerificationDescriptor["provider"], current: string, location: string, method: string, navigation: boolean): string | null {
  if (navigation || !["GET", "HEAD"].includes(method) || /[\\\s]/u.test(location) ||
      /%(?:2e|2f|5c|00)/iu.test(location.split(/[?#]/u, 1)[0]!)) return null;
  try {
    const target = new URL(location, current);
    return target.origin === new URL(current).origin && permitsVerificationURL(provider, target.href, method) ? target.href : null;
  } catch { return null; }
}

// One nonrenewable readiness/approval window. A released POST consumes the
// allowance before asynchronous network work; duplicate callbacks cannot race.
export class VerificationSubmission {
  private phaseDeadline: number | undefined;
  get deadline(): number { return this.phaseDeadline ?? this.operationDeadline; }
  private approved = false;
  private triggered = false;
  private submitted = false;
  private terminal: DriverFailure | undefined;
  private readySeen = false;
  state: VerificationState = "loading";

  constructor(readonly descriptor: VerificationDescriptor, private readonly operationDeadline: number, private readonly now = Date.now, start = true) {
    if (start) this.startPhase();
    this.assertActive();
  }
  startPhase(): void {
    this.phaseDeadline ??= Math.min(this.operationDeadline, this.now() + this.descriptor.dependencies.timeoutMs);
    this.assertActive();
  }
  assertActive(): void {
    if (this.terminal) throw this.terminal;
    if (this.now() >= this.deadline) this.fail("verification_timeout");
  }
  fail(code: "verification_timeout" | "verification_expired" | "verification_failed" | "verification_unsupported" | "verification_not_ready" | "verification_policy" | "verification_budget"): never {
    this.terminal ??= new DriverFailure(code);
    throw this.terminal;
  }
  observe(state: VerificationState): void {
    this.assertActive();
    this.state = state;
    if (state === "expired" || this.readySeen && state !== "ready") this.fail("verification_expired");
    if (state === "failed") this.fail("verification_failed");
    if (state === "unsupported") this.fail("verification_unsupported");
    this.readySeen ||= state === "ready";
  }
  approve(): void {
    this.assertActive();
    if (this.approved || this.descriptor.activation === "before_approval" && this.state !== "ready") this.fail("verification_not_ready");
    this.approved = true;
  }
  trigger(): void {
    this.assertActive();
    if (!this.approved || this.triggered) this.fail("verification_policy");
    this.triggered = true;
  }
  checkRelease(state: VerificationState): void {
    this.observe(state);
    if (!this.approved || !this.triggered || this.submitted || state !== "ready") this.fail("verification_not_ready");
  }
  release(state: VerificationState): void {
    this.checkRelease(state);
    this.submitted = true;
  }
  postCount(): number { return this.submitted ? 1 : 0; }
}
