export const lifecycleEvents = ["success", "error", "expired", "timeout", "before_interactive", "after_interactive"] as const;
export const errorFamilies = ["configuration", "timeout", "clock_or_cache", "frame_load", "challenge", "unknown"] as const;
export type LifecycleEvent = typeof lifecycleEvents[number];
export type ErrorFamily = typeof errorFamilies[number];
export interface LifecycleObservation {
  availability: "unavailable" | "partial" | "observed";
  renderObserved: boolean;
  hooks: Record<LifecycleEvent, boolean>;
  events: Record<LifecycleEvent, number>;
  errorFamilies: Record<ErrorFamily, number>;
  firstError: ErrorFamily | "none";
  lastError: ErrorFamily | "none";
  saturated: boolean;
}
export function unavailableLifecycle(): LifecycleObservation {
  return { availability: "unavailable", renderObserved: false,
    hooks: { success: false, error: false, expired: false, timeout: false, before_interactive: false, after_interactive: false },
    events: { success: 0, error: 0, expired: 0, timeout: 0, before_interactive: 0, after_interactive: 0 },
    errorFamilies: { configuration: 0, timeout: 0, clock_or_cache: 0, frame_load: 0, challenge: 0, unknown: 0 },
    firstError: "none", lastError: "none", saturated: false };
}

// Never retain untrusted properties or arguments from the website realm.
export function reduceLifecycle(value: unknown): LifecycleObservation {
  const empty = unavailableLifecycle();
  if (!value || typeof value !== "object") return empty;
  const v = value as LifecycleObservation;
  if (!["unavailable", "partial", "observed"].includes(v.availability) || typeof v.renderObserved !== "boolean" || typeof v.saturated !== "boolean" ||
      !["none", ...errorFamilies].includes(v.firstError) || !["none", ...errorFamilies].includes(v.lastError)) return empty;
  for (const event of lifecycleEvents) {
    if (typeof v.hooks?.[event] !== "boolean" || !Number.isSafeInteger(v.events?.[event]) || v.events[event] < 0 || v.events[event] > 1_000_000) return empty;
  }
  for (const family of errorFamilies) {
    if (!Number.isSafeInteger(v.errorFamilies?.[family]) || v.errorFamilies[family] < 0 || v.errorFamilies[family] > 1_000_000) return empty;
  }
  const hooked = lifecycleEvents.filter(event => v.hooks[event]).length;
  const availability = hooked === 0 ? "unavailable" : hooked === lifecycleEvents.length && v.renderObserved ? "observed" : "partial";
  const errors = errorFamilies.reduce((sum, family) => sum + v.errorFamilies[family], 0);
  if (v.availability !== availability || lifecycleEvents.some(event => !v.hooks[event] && v.events[event] !== 0) ||
      (v.events.error === 0) !== (v.firstError === "none" && v.lastError === "none") ||
      v.events.error > 0 && (v.firstError === "none" || v.lastError === "none" || v.errorFamilies[v.firstError] === 0 || v.errorFamilies[v.lastError] === 0) ||
      (v.events.error < 1_000_000 && errors !== v.events.error) || errors < v.events.error || errorFamilies.some(family => v.errorFamilies[family] > v.events.error) ||
      v.saturated && ![...Object.values(v.events), ...Object.values(v.errorFamilies)].includes(1_000_000)) return empty;
  return { availability: v.availability, renderObserved: v.renderObserved,
    hooks: Object.fromEntries(lifecycleEvents.map(event => [event, v.hooks[event]])) as LifecycleObservation["hooks"],
    events: Object.fromEntries(lifecycleEvents.map(event => [event, v.events[event]])) as LifecycleObservation["events"],
    errorFamilies: Object.fromEntries(errorFamilies.map(family => [family, v.errorFamilies[family]])) as LifecycleObservation["errorFamilies"],
    firstError: v.firstError, lastError: v.lastError, saturated: v.saturated };
}

// Self-contained trusted init script. It observes only callbacks already supplied
// by the application. Adding a missing error callback can change SDK logging and
// retry behavior, so missing/late/opaque hooks deliberately remain unavailable.
// Nothing calls execute/reset/render, reads challenge content or saves a token.
export function installLifecycleObserver(key: string): void {
  // SDK hooks belong to the application page, never a provider challenge frame.
  if (window.top && window !== window.top) return;
  const globals = window as unknown as Record<string, unknown>;
  const names = { success: "callback", error: "error-callback", expired: "expired-callback", timeout: "timeout-callback", before_interactive: "before-interactive-callback", after_interactive: "after-interactive-callback" } as const;
  const events = Object.keys(names) as Array<keyof typeof names>;
  type Event = keyof typeof names;
  type Family = "configuration" | "timeout" | "clock_or_cache" | "frame_load" | "challenge" | "unknown";
  const entries = new WeakMap<Element, LifecycleObservation>();
  const wrappers = new WeakSet<Function>();
  const callbacks = new WeakMap<LifecycleObservation, WeakMap<Function, Map<Event, Function>>>();
  let wrapperCount = 0;
  const empty = (): LifecycleObservation => ({ availability: "unavailable", renderObserved: false,
    hooks: { success: false, error: false, expired: false, timeout: false, before_interactive: false, after_interactive: false },
    events: { success: 0, error: 0, expired: 0, timeout: 0, before_interactive: 0, after_interactive: 0 },
    errorFamilies: { configuration: 0, timeout: 0, clock_or_cache: 0, frame_load: 0, challenge: 0, unknown: 0 },
    firstError: "none", lastError: "none", saturated: false });
  const entryFor = (widget: Element) => {
    let entry = entries.get(widget);
    if (!entry) { entry = empty(); entries.set(widget, entry); callbacks.set(entry, new WeakMap()); }
    return entry;
  };
  const add = (entry: LifecycleObservation, value: number) => {
    if (value === 1_000_000) { entry.saturated = true; return value; }
    return value + 1;
  };
  const family = (code: unknown): Family => {
    // Only documented fixed families survive; no coercion or raw code retention.
    if (typeof code !== "string" || !/^\d{6}$/u.test(code)) return "unknown";
    if (["110100", "110110", "110200", "400020", "400070"].includes(code)) return "configuration";
    if (["110600", "110620"].includes(code)) return "timeout";
    if (code === "200100") return "clock_or_cache";
    if (code === "200500") return "frame_load";
    return code.startsWith("300") || code.startsWith("600") ? "challenge" : "unknown";
  };
  const wrap = (fn: Function, event: Event, entry: LifecycleObservation): Function => {
    const cache = callbacks.get(entry)!;
    let byEvent = cache.get(fn);
    if (!byEvent) { byEvent = new Map(); cache.set(fn, byEvent); }
    const previous = byEvent.get(event);
    if (previous) return previous;
    if (wrapperCount >= 256) return fn;
    wrapperCount++;
    const proxy = new Proxy(fn, { apply(target, receiver, args: unknown[]) {
      // Observation failures cannot change the application's callback semantics.
      try {
        entry.events[event] = add(entry, entry.events[event]);
        if (event === "error") {
          const kind = family(args[0]);
          entry.errorFamilies[kind] = add(entry, entry.errorFamilies[kind]);
          if (entry.firstError === "none") entry.firstError = kind;
          entry.lastError = kind;
        }
      } catch { /* Retain only successfully reduced evidence. */ }
      return Reflect.apply(target, receiver, args);
    } });
    wrappers.add(proxy); byEvent.set(event, proxy); entry.hooks[event] = true;
    return proxy;
  };
  const implicit = () => {
    const widgets = document.querySelectorAll(".cf-turnstile");
    if (widgets.length !== 1) return;
    const widget = widgets[0]!, entry = entryFor(widget);
    for (const event of events) {
      const name = widget.getAttribute("data-" + names[event]);
      if (!name || !/^[A-Za-z_$][A-Za-z0-9_$]{0,127}$/u.test(name)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(window, name);
      if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "function" || !descriptor.writable) continue;
      if (wrappers.has(descriptor.value)) continue;
      try { Object.defineProperty(window, name, { ...descriptor, value: wrap(descriptor.value, event, entry) }); } catch { /* Unsupported hook. */ }
    }
  };
  const renderMethods = new WeakSet<Function>();
  const instrument = (api: unknown) => {
    if (!api || typeof api !== "object") return;
    const descriptor = Object.getOwnPropertyDescriptor(api, "render");
    if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "function" || !descriptor.writable || renderMethods.has(descriptor.value)) return;
    const render = new Proxy(descriptor.value as Function, { apply(target, receiver, args: unknown[]) {
      let next = args;
      try {
        const widget = typeof args[0] === "string" ? document.querySelector(args[0]) : args[0];
        const parameters = args[1];
        if (widget instanceof Element && parameters && typeof parameters === "object") {
          const entry = entryFor(widget); entry.renderObserved = true;
          const proxy = new Proxy(parameters, { get(object, property) {
            const value = Reflect.get(object, property, object);
            const event = events.find(event => names[event] === property);
            const own = Object.getOwnPropertyDescriptor(object, property);
            if (!event || typeof value !== "function" || own && own.configurable === false && "value" in own && own.writable === false) return value;
            return wrap(value, event, entry);
          } });
          next = [args[0], proxy, ...args.slice(2)];
        }
      } catch { /* Call the original render unchanged when observation is unavailable. */ }
      return Reflect.apply(target, receiver, next);
    } });
    try { Object.defineProperty(api, "render", { ...descriptor, value: render }); renderMethods.add(render); } catch { /* Unsupported SDK surface. */ }
  };
  // Never publish or replace the SDK global. Even an undefined accessor changes
  // existence-guarded loaders. Accessor/early synchronous hooks stay unavailable.
  const discover = () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "turnstile");
    if (descriptor && "value" in descriptor) instrument(descriptor.value);
  };
  try { discover(); } catch { /* Unsupported SDK surface. */ }
  implicit();
  const observer = new MutationObserver(() => { try { implicit(); discover(); } catch { /* No page error output. */ } });
  observer.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: events.map(event => "data-" + names[event]) });
  Object.defineProperty(window, key, { configurable: false, enumerable: false, value: (widget: Element | null): LifecycleObservation => {
    try {
      implicit(); discover();
      if (!widget?.isConnected) return empty();
      const entry = entries.get(widget);
      if (!entry) return empty();
      const hooked = events.filter(event => entry.hooks[event]).length;
      return { ...entry, availability: hooked === 0 ? "unavailable" : hooked === events.length && entry.renderObserved ? "observed" : "partial",
        hooks: { ...entry.hooks }, events: { ...entry.events }, errorFamilies: { ...entry.errorFamilies } };
    } catch { return empty(); }
  } });
}
