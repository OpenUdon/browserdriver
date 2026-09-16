import { randomUUID } from "node:crypto";
import type { BrowserContext, Frame, Locator, Page, Route } from "playwright";
import { DriverFailure, type VerificationDescriptor } from "./protocol.js";
import { permitsVerificationURL, verificationRedirect, VerificationSubmission, type VerificationState } from "./verification-policy.js";
import { endpointClass, reduceNetwork, transportClass, VerificationDiagnostics, type NetworkDiagnostic, type NetworkReason, type ProbeReason, type VerificationObservation } from "./verification-diagnostics.js";
import { observeProviderFrame, type FrameObservation } from "./verification-visibility.js";
import { installLifecycleObserver } from "./verification-lifecycle.js";

class VerificationShutdown extends Error {}

// This trusted evaluator returns only a closed state. Provider response values
// are compared within the website realm and never cross the Playwright wire.
export function browserVerificationProbe(element: HTMLElement | SVGElement, options: Pick<VerificationDescriptor, "provider" | "submissionURL"> & { frameVisibility?: FrameObservation["visibility"] }, binding: {form: HTMLFormElement | null; widget: Element | null; response?: string}): VerificationObservation {
    let responseKind: VerificationObservation["responseKind"] = "unobserved";
    const result = (state: VerificationState, reason: ProbeReason): VerificationObservation => ({ state, reason, responseKind });
    const control = element as HTMLButtonElement | HTMLInputElement;
    const form = control.form;
    if (!control.isConnected || !form || control.type !== "submit" || form !== binding.form) return result("unsupported", "form_binding");
    // HTML named controls can hide instance properties and methods. Read the
    // native reflected attributes, retaining URL resolution and browser defaults.
    const property = (name: "action" | "method" | "target"): string => Object.getOwnPropertyDescriptor(HTMLFormElement.prototype, name)!.get!.call(form) as string;
    const action = property("action"), method = property("method"), target = property("target");
    if ((target && target !== "_self") || (control.hasAttribute("formtarget") && control.formTarget !== "_self" && control.formTarget !== "") || method.toUpperCase() !== "POST" || action !== options.submissionURL ||
        control.hasAttribute("formaction") && control.formAction !== action ||
        control.hasAttribute("formmethod") && control.formMethod.toUpperCase() !== "POST") return result("unsupported", "form_binding");
    const selectors = { turnstile: ".cf-turnstile", recaptcha_v2: ".g-recaptcha", hcaptcha: ".h-captcha" };
    const fields = { turnstile: "cf-turnstile-response", recaptcha_v2: "g-recaptcha-response", hcaptcha: "h-captcha-response" };
    const provider = options.provider;
    const widgets = [...document.querySelectorAll(".cf-turnstile,.g-recaptcha,.h-captcha")];
    const responses = [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(`[name="${fields[provider]}"]`)];
    // hCaptcha may also create a compatibility g-recaptcha-response field.
    if (widgets.length !== 1 || widgets[0] !== binding.widget || widgets.some(widget => !widget.matches(selectors[provider]) || !(Node.prototype.contains.call(form, widget) || widget === control))) return result("unsupported", "widget_binding");
    if (responses.length > 1 || responses.some(response => response.form !== form)) return result("unsupported", "response_binding");
    const globals = window as unknown as Record<string, { getResponse?: () => unknown; isExpired?: () => unknown; enterprise?: unknown }>;
    const api = globals[provider === "turnstile" ? "turnstile" : provider === "recaptcha_v2" ? "grecaptcha" : "hcaptcha"];
    if (!api || typeof api.getResponse !== "function") return result("loading", "api_loading");
    if (provider === "recaptcha_v2" && api.enterprise) return result("unsupported", "enterprise");
    // A script can expose its API before it renders the first widget. Calling
    // getResponse/isExpired during that interval can throw. Wait for the bound
    // standard response field; its continued absence never establishes ready.
    if (responses.length === 0) return result("loading", "response_pending");
    try {
      if (provider === "turnstile") {
        if (typeof api.isExpired !== "function") return result("unsupported", "expiry_api_missing");
        if (api.isExpired() === true) return result("expired", "provider_expired");
      }
      const response = api.getResponse();
      responseKind = response === undefined ? "undefined" : response === null ? "null" : typeof response === "string" ? "string" : "other";
      // Keep the response identity only in the website realm. A refreshed or
      // replaced response invalidates the previous readiness/approval window.
      const previous = binding.response;
      if (previous !== undefined && previous !== response) return result("expired", "response_changed");
      // Turnstile documents undefined while its first response is pending.
      // This exception is provider-specific, never coerces other falsy values,
      // and cannot revive a previously approved response or contradict a field.
      if (provider === "turnstile" && response === undefined) {
        if (responses[0]!.value !== "") return result("unsupported", "response_mismatch");
      } else if (typeof response !== "string") return result("unsupported", "response_type");
      if (typeof response === "string" && response.length > 0) {
        if (response !== responses[0]!.value) return result("unsupported", "response_mismatch");
        binding.response = response;
        return result("ready", "response_ready");
      }
      // Visibility does not prove a challenge was presented. This is a prompt
      // for human attention, never a claim about provider/backend acceptance.
      const visibleFrame = options.frameVisibility === "visible";
      return visibleFrame ? result("awaiting_interaction", "visible_frame") : result("loading", "no_visible_frame");
    } catch { return result("failed", "api_exception"); }
}

// This source consists only of trusted adapter code. No profile string is
// interpolated into executable source. DOM values stay in the website realm.
const installSubmissionBoundary = new Function("return " + `(element, options) => {
  const probe = ${browserVerificationProbe.toString()};
  const form = element.form;
  if (!form) return false;
  // This identity lives in a closure held by a Playwright JSHandle. It is
  // neither a window property nor returned as serializable response data.
  const identity = { form, widget: document.querySelector(".cf-turnstile,.g-recaptcha,.h-captcha") };
  let visibility = "unavailable";
  const current = () => probe(element, {...options, frameVisibility: visibility}, identity);
  const nativeSubmit = HTMLFormElement.prototype.submit;
  let pending = false;
  const submit = (submitter) => {
    if (pending) { window[options.binding]("duplicate").catch(() => {}); return; }
    pending = true;
    const state = current().state;
    window[options.binding](state).then(() => {
      // Native submit() omits the successful submit button. Keep that value
      // inside the form without exporting it through the protocol.
      if (submitter && submitter.name) {
        const field = document.createElement("input");
        field.type = "hidden"; field.name = submitter.name; field.value = submitter.value;
        Node.prototype.appendChild.call(form, field);
      }
      nativeSubmit.call(form);
    }).catch(() => {});
  };
  HTMLFormElement.prototype.submit = function() {
    if (this === form) submit(null); else nativeSubmit.call(this);
  };
  // Observe after application listeners. Invisible integrations that defer
  // submission keep control until their later form.submit() callback.
  window.addEventListener("submit", event => {
    if (event.target !== form || event.defaultPrevented) return;
    event.preventDefault();
    submit(event.submitter);
  });
  return { widget: identity.widget, probe: (observed) => { visibility = observed; return current(); },
    setVisibility: (observed) => { visibility = observed; },
    lifecycle: () => typeof window[options.lifecycle] === "function" ? window[options.lifecycle](identity.widget) : null };
}`)() as (element: HTMLElement | SVGElement, options: {provider: VerificationDescriptor["provider"]; submissionURL: string; binding: string; lifecycle: string}) => false | {widget: Element | null; probe: (visibility: FrameObservation["visibility"]) => VerificationObservation; setVisibility: (visibility: FrameObservation["visibility"]) => void; lifecycle: () => unknown};

export class VerificationGuard {
  private blocked: DriverFailure | undefined;
  private main: Frame | undefined;
  private page: Page | undefined;
  private readonly lifecycleKey = "__udon_lifecycle_" + randomUUID().replaceAll("-", "");
  private providerRequests = 0;
  private providerPosts = 0;
  private responseBytes = 0;
  private applicationRequests = 0;
  private pendingPost = false;
  private boundaryReady = false;
  private submit: Locator | undefined;
  private readiness: (() => Promise<VerificationState>) | undefined;
  private readonly trace = new VerificationDiagnostics();
  private closing = false;
  private closePromise: Promise<void> | undefined;
  private readonly shutdown = { started: false, contextClosed: false, requestsDisposed: false, callbacksJoined: false };
  private readonly pending = new Set<Promise<unknown>>();
  private track<T>(operation: Promise<T>): Promise<T> {
    this.pending.add(operation);
    void operation.then(() => this.pending.delete(operation), () => this.pending.delete(operation));
    return operation;
  }
  readonly submission: VerificationSubmission;

  constructor(private readonly context: BrowserContext, private readonly descriptor: VerificationDescriptor,
    private readonly applicationOrigins: ReadonlySet<string>, private readonly navigationURLs: ReadonlySet<string>,
    deadline: number, private readonly diagnostic = false, private readonly expanded = false) {
    this.submission = new VerificationSubmission(descriptor, deadline, Date.now, false);
  }

  async bindSubmit(submit: Locator): Promise<void> {
    this.assertSafe();
    this.submission.startPhase();
    const control = await submit.elementHandle();
    if (!control) throw new DriverFailure("verification_unsupported");
    this.submit = submit;
    const binding = "__udon_verification_" + randomUUID().replaceAll("-", "");
    await this.context.exposeBinding(binding, (source, state: unknown) => this.track((async () => {
      try {
        this.assertSafe();
        if (source.frame !== this.main || this.diagnostic || this.boundaryReady || state !== "ready") {
          if (state === "expired") this.submission.fail("verification_expired");
          if (state === "failed") this.submission.fail("verification_failed");
          if (state === "unsupported") this.submission.fail("verification_unsupported");
          this.submission.fail("verification_not_ready");
        }
        // The page can discover and invoke an exposed binding. Re-evaluate
        // the trusted probe before acknowledging; never trust its argument.
        // The form has not navigated yet, so this cannot deadlock a routed POST.
        if (!this.readiness) this.submission.fail("verification_unsupported");
        const observed = await this.readiness();
        this.assertSafe();
        if (this.boundaryReady) this.submission.fail("verification_not_ready");
        this.submission.checkRelease(observed);
        this.boundaryReady = true;
      } catch (error) {
        if (!this.closing) this.blocked ??= error instanceof DriverFailure ? error : new DriverFailure("verification_policy");
        // Only closed prose crosses this trusted binding into the page.
        throw new Error("verification_stopped");
      }
    })()));
    const adapter = await control.evaluateHandle(installSubmissionBoundary, { provider: this.descriptor.provider, submissionURL: this.descriptor.submissionURL, binding, lifecycle: this.lifecycleKey });
    const widget = await adapter.evaluateHandle(value => value === false ? null : value.widget);
    this.readiness = async () => {
      try {
        // Readiness/expiry is evaluated before optional frame geometry. A usable
        // matched response never waits on frame discovery or SDK activity.
        let observation = await adapter.evaluate(value => value === false ? { state: "unsupported", reason: "form_binding", responseKind: "unobserved" } as VerificationObservation : value.probe("unavailable"));
        const frame = observation.reason === "no_visible_frame" && this.page ? await observeProviderFrame(this.page, widget, this.descriptor.provider) : { visibility: "unavailable" as const, associatedFrames: 0 };
        this.trace.observeFrame(frame);
        if (frame.visibility === "visible") {
          await adapter.evaluate((value, visibility) => { if (value !== false) value.setVisibility(visibility); }, frame.visibility);
          observation = { ...observation, state: "awaiting_interaction", reason: "visible_frame" };
        }
        if (this.expanded) {
          try { this.trace.observeLifecycle(await adapter.evaluate(value => value === false ? null : value.lifecycle())); }
          catch { this.trace.observeLifecycle(null); } // Optional evidence never changes readiness.
        }
        return this.trace.observe(observation).state;
      } catch {
        this.trace.observe({ state: "failed", reason: "evaluation_failed", responseKind: "unobserved" });
        throw new DriverFailure("verification_failed");
      }
    };
  }
  async state(): Promise<VerificationState> {
    this.assertSafe();
    if (!this.readiness) throw new DriverFailure("verification_unsupported");
    const state = await this.readiness();
    this.assertSafe();
    this.submission.observe(state);
    return state;
  }
  counts(): object {
    return { providerRequests: this.providerRequests, providerPosts: this.providerPosts,
      providerResponseBytes: this.responseBytes, applicationRequests: this.applicationRequests, applicationPosts: this.postCount() };
  }
  diagnostics() { return {...(this.expanded ? this.trace.snapshotV4() : this.trace.snapshot()), shutdown: {...this.shutdown}}; }
  async install(): Promise<void> {
    if (this.expanded && this.descriptor.provider === "turnstile") {
      await this.context.addInitScript(installLifecycleObserver, this.lifecycleKey);
    }
    await this.context.route("**/*", route => this.track(this.handle(route)));
    await this.context.routeWebSocket("**/*", socket => this.track((async () => {
      this.rejectMutation("persistent_channel"); await socket.close().catch(() => undefined);
    })()));
    this.context.on("page", page => {
      if (this.main && page.mainFrame() !== this.main) { this.rejectMutation("popup"); void this.track(page.close().catch(() => undefined)); }
      page.on("download", download => { this.rejectMutation("download"); void this.track(download.cancel().catch(() => undefined)); });
    });
  }

  // Provider redirects are followed explicitly within policy and never handed
  // to Chromium. This also covers OOPIF routes. Application redirects use CDP.
  async watchRedirects(page: Page): Promise<void> {
    if (this.main) throw new DriverFailure("invalid_response");
    this.main = page.mainFrame();
    this.page = page;
    const session = await this.context.newCDPSession(page);
    session.on("Fetch.requestPaused", event => this.track((async () => {
      let reason: NetworkReason = "redirect_transport";
      try {
        this.assertSafe();
        if ([301, 302, 303, 307, 308].includes(event.responseStatusCode ?? 0)) {
          reason = "application_redirect";
          const locations = (event.responseHeaders ?? []).filter(h => h.name.toLowerCase() === "location");
          if (locations.length !== 1 || permitsVerificationURL(this.descriptor.provider, event.request.url, event.request.method, event.resourceType === "Document")) throw new DriverFailure("verification_policy");
          const target = new URL(locations[0]!.value, event.request.url).href;
          if (!this.navigationURLs.has(target) || event.resourceType !== "Document" ||
              event.request.method === "POST" && event.responseStatusCode !== 303 && event.responseStatusCode !== 301 && event.responseStatusCode !== 302) throw new DriverFailure("verification_policy");
        }
        reason = "redirect_transport";
        await session.send("Fetch.continueResponse", { requestId: event.requestId });
      } catch (error) {
        this.trace.network(reduceNetwork(reason, endpointClass(this.descriptor.provider, event.request.url, this.applicationOrigins),
          event.request.method, event.resourceType.toLowerCase(), "unavailable", event.responseStatusCode, error instanceof DriverFailure ? "none" : transportClass(error)));
        if (!this.closing) this.blocked ??= new DriverFailure("verification_policy");
        await session.send("Fetch.failRequest", { requestId: event.requestId, errorReason: "BlockedByClient" }).catch(() => undefined);
      }
    })()));
    await session.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Response" }] });
  }
  beginSubmit(): void {
    this.assertSafe();
    if (this.diagnostic || !this.submit) this.deny();
    this.submission.approve(); this.submission.trigger();
  }
  finishSubmit(): void { this.assertSafe(); if (this.postCount() !== 1) this.submission.fail("verification_not_ready"); }
  postCount(): number { return this.submission.postCount(); }
  assertSafe(): void { if (this.blocked) throw this.blocked; if (this.closing) throw new VerificationShutdown(); this.submission.assertActive(); }
  rejectMutation(reason: NetworkReason = "external_rejection"): void {
    this.trace.network(reduceNetwork(reason, "unapproved"));
    if (!this.closing) this.blocked ??= new DriverFailure("verification_policy");
  }
  private deny(): never { this.rejectMutation(); throw this.blocked!; }

  // Call only when execution has reached its final outcome. Freeze admissions
  // synchronously, cancel the context's API fetches, close Chromium's context,
  // and join all callbacks before returning final evidence. Failures observed
  // before this boundary remain failures; cancellation is a separate phase.
  close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    let failure: unknown;
    try { this.assertSafe(); } catch (error) { failure = error; }
    this.closing = true;
    this.shutdown.started = true;
    this.trace.beginShutdown();
    this.closePromise = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cleanup = (async () => {
        const results = await Promise.allSettled([
          this.context.request.dispose({ reason: "verification_shutdown" }), this.context.close(),
        ]);
        this.shutdown.requestsDisposed = results[0]!.status === "fulfilled";
        this.shutdown.contextClosed = results[1]!.status === "fulfilled";
        while (this.pending.size) await Promise.allSettled([...this.pending]);
        this.shutdown.callbacksJoined = true;
        if (results.some(result => result.status === "rejected")) throw new DriverFailure("driver_error");
      })();
      try {
        await Promise.race([cleanup, new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new DriverFailure("driver_error")), 5_000);
        })]);
      } finally { clearTimeout(timer); }
      if (failure) throw failure;
    })();
    return this.closePromise;
  }

  private providerFrame(frame: Frame, navigation: boolean): NetworkDiagnostic["frameFailure"] {
    if (!this.main) return "unattached";
    if (frame === this.main && navigation) return "main_navigation";
    let current: Frame | null = navigation ? frame.parentFrame() : frame;
    for (let depth = 0; current && depth < 8; depth++, current = current.parentFrame()) {
      if (current === this.main) {
        try { return this.applicationOrigins.has(new URL(current.url()).origin) ? "none" : "main_origin"; }
        catch { return "main_origin"; }
      }
      // Frame URLs include fragments; HTTP request URLs do not. Strip only
      // that non-network portion, retaining raw path validation and ancestry.
      if (!permitsVerificationURL(this.descriptor.provider, current.url().split("#", 1)[0]!, "GET", true)) return "ancestor_url";
    }
    return current ? "ancestor_depth" : "unattached";
  }

  private async handle(route: Route): Promise<void> {
    const request = route.request();
    let reason: NetworkReason = "route_transport", status = 0;
    let frameFailure: NetworkDiagnostic["frameFailure"] = "none";
    const note = (why: NetworkReason, error?: unknown) => {
      let frame: "main" | "child" | "unavailable" = "unavailable";
      try { frame = request.frame() === this.main ? "main" : "child"; } catch { /* No raw frame errors. */ }
      this.trace.network({...reduceNetwork(why, endpointClass(this.descriptor.provider, request.url(), this.applicationOrigins),
        request.method(), request.resourceType(), frame, status, error === undefined || error instanceof DriverFailure || error instanceof VerificationShutdown ? "none" : transportClass(error)), frameFailure});
    };
    const deny = (why: NetworkReason): never => { reason = why; throw new DriverFailure("verification_policy"); };
    try {
      if (this.closing) { note("shutdown_blocked"); await route.abort("blockedbyclient").catch(() => undefined); return; }
      this.assertSafe();
      reason = "invalid_url";
      const url = new URL(request.url()), method = request.method().toUpperCase(), navigation = request.isNavigationRequest();
      if (request.resourceType() === "eventsource") deny("persistent_channel");
      if (url.username || url.password || !["https:", "http:"].includes(url.protocol)) deny("invalid_url");
      if (permitsVerificationURL(this.descriptor.provider, request.url(), method, navigation)) {
        frameFailure = this.providerFrame(request.frame(), navigation);
        if (frameFailure !== "none") deny("provider_frame");
        this.submission.startPhase();
        let nextURL = request.url();
        const visited = new Set([nextURL]);
        for (let hop = 0; ; hop++) {
          this.assertSafe();
          frameFailure = this.providerFrame(request.frame(), navigation);
          if (frameFailure !== "none") deny("provider_frame");
          reason = "request_budget";
          if (this.providerRequests >= this.descriptor.dependencies.maxRequests) this.submission.fail("verification_budget");
          this.providerRequests++;
          if (method === "POST") this.providerPosts++;
          reason = "response_transport";
          const response = await route.fetch({ url: nextURL, maxRedirects: 0, maxRetries: 0,
            timeout: Math.max(1, this.submission.deadline - Date.now()) });
          try {
            this.assertSafe();
            const headers = response.headers();
            status = response.status();
            let redirect: string | null = null;
            if (status >= 300 && status < 400) {
              if (![301, 302, 303, 307, 308].includes(status) || navigation || !["GET", "HEAD"].includes(method)) deny("provider_redirect");
              const locations = response.headersArray().filter(header => header.name.toLowerCase() === "location");
              if (locations.length !== 1 || !(redirect = verificationRedirect(this.descriptor.provider, nextURL, locations[0]!.value, method, navigation))) deny("provider_redirect_target");
              if (hop >= 5 || visited.has(redirect!)) deny("provider_redirect_limit");
            }
            if (/text\/event-stream/iu.test(headers["content-type"] ?? "")) deny("response_stream");
            if (headers["content-disposition"]?.toLowerCase().includes("attachment")) deny("response_download");
            const remaining = this.descriptor.dependencies.maxResponseBytes - this.responseBytes;
            reason = "response_budget";
            if (Number(headers["content-length"] ?? 0) > remaining) this.submission.fail("verification_budget");
            reason = "response_body";
            const body = await response.body();
            reason = "response_budget";
            if (body.length > this.descriptor.dependencies.maxResponseBytes - this.responseBytes) this.submission.fail("verification_budget");
            this.responseBytes += body.length;
            this.assertSafe();
            frameFailure = this.providerFrame(request.frame(), navigation);
            if (frameFailure !== "none") deny("provider_frame");
            if (redirect) { note("provider_redirect_followed"); visited.add(redirect); nextURL = redirect; continue; }
            reason = "response_fulfill";
            await route.fulfill({ response, body });
            note("response");
          } finally { await response.dispose(); }
          return;
        }
      }
      if (!this.applicationOrigins.has(url.origin)) {
        if (!navigation && ["GET", "HEAD"].includes(method)) { note("unapproved_read"); await route.abort("blockedbyclient"); return; }
        deny("unapproved_destination");
      }
      if (request.frame() !== this.main) deny("application_frame");
      if (navigation && !this.navigationURLs.has(url.href) && !(method === "POST" && url.href === this.descriptor.submissionURL)) deny("application_navigation");
      this.applicationRequests++;
      reason = "route_transport";
      if (method === "GET" || method === "HEAD") { await route.continue(); return; }
      if (method !== "POST" || url.href !== this.descriptor.submissionURL || this.diagnostic || this.pendingPost || this.postCount()) deny("application_mutation");
      this.pendingPost = true;
      if (!this.boundaryReady) this.submission.fail("verification_not_ready");
      this.assertSafe();
      this.submission.release("ready");
      await route.continue();
    } catch (error) {
      note(reason, error);
      if (!this.closing) this.blocked ??= error instanceof DriverFailure ? error : new DriverFailure("verification_policy");
      await route.abort("blockedbyclient").catch(() => { this.rejectMutation(); });
    }
  }
}

export async function waitForVerification(guard: VerificationGuard, emit: (state: VerificationState) => void, untilPost = false): Promise<void> {
  while (!untilPost || !guard.postCount()) {
    let state: VerificationState;
    try { state = await guard.state(); }
    catch (error) {
      // The POST boundary already probed readiness. Navigation may destroy the
      // evaluation context while this independent progress poll is pending.
      if (untilPost && guard.postCount()) { guard.assertSafe(); return; }
      throw error;
    }
    emit(state);
    if (!untilPost && state === "ready") return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  guard.assertSafe();
}
