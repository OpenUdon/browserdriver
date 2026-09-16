// Bounded, value-free initialization evidence. API observations come from the
// existing readiness reads; passive listeners never call the SDK or its getters.
export const initializationSources = ["provider", "application", "other_external", "inline", "unknown"] as const;
export const initializationKinds = ["script_seen", "script_load", "script_error", "script_policy_enforced", "script_policy_report", "execution_error"] as const;
export const globalProperties = ["absent", "data", "accessor", "unavailable"] as const;
export const apiStates = ["unobserved", "missing", "incomplete", "callable_get_response", "access_error"] as const;
export interface APIObservation { globalProperty: typeof globalProperties[number]; api: typeof apiStates[number] }
export interface InitializationEvent { source: typeof initializationSources[number]; kind: typeof initializationKinds[number] }
export type InitializationCounter = { source: typeof initializationSources[number] } & Record<typeof initializationKinds[number], number>;
export interface InitializationEvents {
  coverage: "unavailable" | "partial" | "observed" | "not_applicable";
  events: InitializationEvent[];
  omittedEvents: number;
  counters: InitializationCounter[];
  saturated: boolean;
}
export interface InitializationObservation extends InitializationEvents {
  changes: APIObservation[];
  omittedChanges: number;
  apiEverCallable: boolean;
}
export function emptyInitialization(coverage: InitializationEvents["coverage"] = "unavailable"): InitializationObservation {
  return { coverage, events: [], omittedEvents: 0, counters: initializationSources.map(source => ({source,
    script_seen: 0, script_load: 0, script_error: 0, script_policy_enforced: 0, script_policy_report: 0, execution_error: 0})),
    saturated: false, changes: [], omittedChanges: 0, apiEverCallable: false };
}
export function reduceAPI(value: unknown): APIObservation | null {
  const v = value as APIObservation | null;
  return v && globalProperties.includes(v.globalProperty) && apiStates.includes(v.api)
    ? {globalProperty: v.globalProperty, api: v.api} : null;
}
export function reduceInitializationEvents(value: unknown): InitializationEvents | null {
  const v = value as InitializationEvents | null;
  const count = (n: unknown): n is number => Number.isInteger(n) && Number(n) >= 0 && Number(n) <= 1_000_000;
  if (!v || !["unavailable", "partial", "observed", "not_applicable"].includes(v.coverage) || typeof v.saturated !== "boolean" ||
      !Array.isArray(v.events) || v.events.length > 32 || !count(v.omittedEvents) || v.omittedEvents > 0 && v.events.length !== 32 ||
      !Array.isArray(v.counters) || v.counters.length !== initializationSources.length) return null;
  for (const [i, row] of v.counters.entries()) {
    if (!row || row.source !== initializationSources[i] || initializationKinds.some(kind => !count(row[kind]))) return null;
  }
  if (v.events.some(e => !e || !initializationSources.includes(e.source) || !initializationKinds.includes(e.kind))) return null;
  const total = v.counters.reduce((sum, row) => sum + initializationKinds.reduce((n, kind) => n + row[kind], 0), 0);
  if ((!v.saturated && total !== v.events.length + v.omittedEvents) || total < v.events.length ||
      v.saturated && ![v.omittedEvents, ...v.counters.flatMap(row => initializationKinds.map(kind => row[kind]))].includes(1_000_000) ||
      ["unavailable", "not_applicable"].includes(v.coverage) && (total !== 0 || v.omittedEvents !== 0 || v.saturated)) return null;
  for (const row of v.counters) for (const kind of initializationKinds) {
    const retained = v.events.filter(e => e.source === row.source && e.kind === kind).length;
    if (row[kind] < retained || v.omittedEvents === 0 && row[kind] !== retained) return null;
  }
  return {coverage: v.coverage, events: v.events.map(e => ({source: e.source, kind: e.kind})), omittedEvents: v.omittedEvents,
    counters: v.counters.map(row => ({source: row.source, ...Object.fromEntries(initializationKinds.map(kind => [kind, row[kind]]))}) as InitializationCounter), saturated: v.saturated};
}

// Self-contained init script: only the top application document is observed.
// Raw event properties are classified here and never cross the browser wire.
export function installInitializationObserver(options: {key: string; applicationOrigins: string[]}): void {
  if (window !== window.top || !options.applicationOrigins.includes(window.location.origin)) return;
  const sources = ["provider", "application", "other_external", "inline", "unknown"] as const;
  const counters = sources.map(source => ({source, script_seen: 0, script_load: 0, script_error: 0,
    script_policy_enforced: 0, script_policy_report: 0, execution_error: 0}));
  const events: InitializationEvent[] = [];
  let omittedEvents = 0, saturated = false, partial = false, scanned = 0, visited = 0;
  const seen = new WeakSet<HTMLScriptElement>();
  const source = (raw: unknown): typeof sources[number] => {
    if (raw === "inline" || raw === "eval") return "inline";
    if (typeof raw !== "string" || !raw) return "unknown";
    try {
      const url = new URL(raw, document.baseURI);
      if (url.protocol === "https:" && url.hostname === "challenges.cloudflare.com") return "provider";
      if (options.applicationOrigins.includes(url.origin)) return "application";
      return ["http:", "https:"].includes(url.protocol) ? "other_external" : "unknown";
    } catch { return "unknown"; }
  };
  const increment = (n: number) => { if (n === 1_000_000) { saturated = true; return n; } return n + 1; };
  const note = (kind: InitializationEvent["kind"], origin: InitializationEvent["source"]) => {
    const row = counters.find(row => row.source === origin)!;
    row[kind] = increment(row[kind]);
    if (events.length === 32) { events.shift(); omittedEvents = increment(omittedEvents); }
    events.push({source: origin, kind});
  };
  const script = (element: HTMLScriptElement) => {
    if (seen.has(element)) return;
    if (scanned === 256) { partial = true; return; }
    scanned++; seen.add(element);
    note("script_seen", element.hasAttribute("src") ? source(element.src) : "inline");
  };
  const scan = (node: Node) => {
    if (node instanceof HTMLScriptElement) script(node);
    if (node instanceof Element || node instanceof Document) {
      // Stop walking once the fixed node budget is exhausted.
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT);
      let next: Node | null;
      while ((next = walker.nextNode())) {
        if (scanned === 256 || visited === 4096) { partial = true; break; }
        visited++;
        if (next instanceof HTMLScriptElement) script(next);
      }
    }
  };
  const safely = (fn: () => void) => { try { fn(); } catch { partial = true; } };
  // Resource load events reach Document's capture phase, but exclude Window.
  document.addEventListener("load", event => safely(() => {
    if (event.isTrusted && event.target instanceof HTMLScriptElement) {
      script(event.target); note("script_load", source(event.target.src));
    }
  }), true);
  window.addEventListener("error", event => safely(() => {
    if (!event.isTrusted) return;
    if (event.target instanceof HTMLScriptElement) { script(event.target); note("script_error", source(event.target.src)); }
    else if (event instanceof ErrorEvent) note("execution_error", source(event.filename));
  }), true);
  window.addEventListener("securitypolicyviolation", event => safely(() => {
    if (!event.isTrusted || !["script-src", "script-src-elem", "script-src-attr", "default-src", "require-trusted-types-for"].includes(event.effectiveDirective)) return;
    if (event.disposition === "enforce" || event.disposition === "report")
      note(event.disposition === "enforce" ? "script_policy_enforced" : "script_policy_report", source(event.blockedURI));
  }), true);
  const observer = new MutationObserver(records => safely(() => {
    for (const record of records) for (const node of record.addedNodes) scan(node);
  }));
  observer.observe(document, {childList: true, subtree: true});
  safely(() => scan(document));
  Object.defineProperty(window, options.key, {configurable: false, enumerable: false, value: (): InitializationEvents => ({
    coverage: partial ? "partial" : "observed", events: events.map(e => ({...e})), omittedEvents,
    counters: counters.map(row => ({...row})), saturated,
  })});
}
