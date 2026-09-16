import { networkReasons, type NetworkDiagnostic } from "./verification-diagnostics.js";

export const summaryLimit = 1_000_000;
export const endpointClasses = ["application", "turnstile_script", "turnstile_platform", "recaptcha_api", "recaptcha_static", "hcaptcha_script", "hcaptcha_service", "unapproved"] as const;
export const networkPhases = ["active", "shutdown"] as const;
export function fatalNetworkEvent(event: NetworkDiagnostic): boolean {
  return event.phase === "active" && !["response", "unapproved_read", "provider_redirect_followed"].includes(event.reason);
}
export function abnormalNetworkEvent(event: NetworkDiagnostic): boolean {
  return fatalNetworkEvent(event) || event.reason === "unapproved_read" || event.reason === "response" && ["4xx", "5xx"].includes(event.status);
}

// Fixed keys and saturating counts, independent of the event ring. These count
// diagnostic events, not request admissions, redirect hops or human clicks.
export class VerificationNetworkSummary {
  private saturated = false;
  private readonly counters = networkPhases.flatMap(phase => endpointClasses.map(endpoint =>
    ({ phase, endpoint, events: 0, blockedReads: 0, provider4xx: 0, provider5xx: 0, fatal: 0 })));
  private readonly failures = networkReasons.map(reason => ({ reason, count: 0 }));
  private first: NetworkDiagnostic | null = null;
  private last: NetworkDiagnostic | null = null;
  private add(value: number): number {
    if (value === summaryLimit) { this.saturated = true; return value; }
    return value + 1;
  }
  observe(event: NetworkDiagnostic): void {
    const counter = this.counters.find(value => value.phase === event.phase && value.endpoint === event.endpoint)!;
    counter.events = this.add(counter.events);
    if (event.reason === "unapproved_read") counter.blockedReads = this.add(counter.blockedReads);
    if (event.reason === "response" && event.endpoint !== "application" && event.endpoint !== "unapproved") {
      if (event.status === "4xx") counter.provider4xx = this.add(counter.provider4xx);
      if (event.status === "5xx") counter.provider5xx = this.add(counter.provider5xx);
    }
    if (fatalNetworkEvent(event)) {
      counter.fatal = this.add(counter.fatal);
      const failure = this.failures.find(value => value.reason === event.reason)!;
      failure.count = this.add(failure.count);
    }
    if (abnormalNetworkEvent(event)) { this.first ??= { ...event }; this.last = { ...event }; }
  }
  snapshot() {
    return { unit: "diagnostic_events" as const, saturated: this.saturated,
      counters: this.counters.map(value => ({ ...value })), fatalReasons: this.failures.map(value => ({ ...value })),
      firstAbnormal: this.first && { ...this.first }, lastAbnormal: this.last && { ...this.last } };
  }
}
