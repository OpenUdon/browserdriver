import { randomUUID } from "node:crypto";
import type { BrowserContext, Frame, Locator, Page, Route } from "playwright";
import { DriverFailure, type FailureCode, type VerificationDescriptor } from "./protocol.js";
import { permitsVerificationURL, VerificationSubmission, verificationStates, type VerificationState } from "./verification-policy.js";

// This trusted evaluator returns only a closed state. Provider response values
// are compared within the website realm and never cross the Playwright wire.
function browserVerificationProbe(element: HTMLElement | SVGElement, options: Pick<VerificationDescriptor, "provider" | "submissionURL">, binding: {form: HTMLFormElement | null; widget: Element | null; response?: string}): VerificationState {
    const control = element as HTMLButtonElement | HTMLInputElement;
    const form = control.form;
    if (!control.isConnected || !form || control.type !== "submit" || form !== binding.form || (form.target && form.target !== "_self") || (control.hasAttribute("formtarget") && control.formTarget !== "_self" && control.formTarget !== "") || form.method.toUpperCase() !== "POST" || form.action !== options.submissionURL ||
        control.formAction && control.hasAttribute("formaction") && control.formAction !== form.action ||
        control.hasAttribute("formmethod") && control.formMethod.toUpperCase() !== "POST") return "unsupported";
    const selectors = { turnstile: ".cf-turnstile", recaptcha_v2: ".g-recaptcha", hcaptcha: ".h-captcha" };
    const fields = { turnstile: "cf-turnstile-response", recaptcha_v2: "g-recaptcha-response", hcaptcha: "h-captcha-response" };
    const provider = options.provider;
    const widgets = [...document.querySelectorAll(".cf-turnstile,.g-recaptcha,.h-captcha")];
    const responses = [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(`[name="${fields[provider]}"]`)];
    // hCaptcha may also create a compatibility g-recaptcha-response field.
    if (widgets.length !== 1 || widgets[0] !== binding.widget || responses.length > 1 || widgets.some(widget => !widget.matches(selectors[provider]) || !(form.contains(widget) || widget === control))) return "unsupported";
    if (responses.some(response => response.form !== form)) return "unsupported";
    const globals = window as unknown as Record<string, { getResponse?: () => unknown; isExpired?: () => unknown; enterprise?: unknown }>;
    const api = globals[provider === "turnstile" ? "turnstile" : provider === "recaptcha_v2" ? "grecaptcha" : "hcaptcha"];
    if (!api || typeof api.getResponse !== "function") return "loading";
    if (provider === "recaptcha_v2" && api.enterprise) return "unsupported";
    try {
      if (provider === "turnstile") {
        if (typeof api.isExpired !== "function") return "unsupported";
        if (api.isExpired() === true) return "expired";
      }
      const response = api.getResponse();
      if (typeof response !== "string") return "unsupported";
      // Keep the response identity only in the website realm. A refreshed or
      // replaced response invalidates the previous readiness/approval window.
      const previous = binding.response;
      if (previous !== undefined && previous !== response) return "expired";
      if (response.length > 0) {
        if (responses.length !== 1 || response !== responses[0]!.value) return "unsupported";
        binding.response = response;
        return "ready";
      }
      // Visibility does not prove a challenge was presented. This is a prompt
      // for human attention, never a claim about provider/backend acceptance.
      const visibleFrame = [...document.querySelectorAll("iframe")].some(frame => {
        const box = frame.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && getComputedStyle(frame).visibility !== "hidden";
      });
      return visibleFrame ? "awaiting_interaction" : "loading";
    } catch { return "failed"; }
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
  const current = () => probe(element, options, identity);
  const nativeSubmit = HTMLFormElement.prototype.submit;
  let pending = false;
  const submit = (submitter) => {
    if (pending) { window[options.binding]("duplicate").catch(() => {}); return; }
    pending = true;
    const state = current();
    window[options.binding](state).then(() => {
      // Native submit() omits the successful submit button. Keep that value
      // inside the form without exporting it through the protocol.
      if (submitter && submitter.name) {
        const field = document.createElement("input");
        field.type = "hidden"; field.name = submitter.name; field.value = submitter.value;
        form.append(field);
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
  return { probe: current };
}`)() as (element: HTMLElement | SVGElement, options: {provider: VerificationDescriptor["provider"]; submissionURL: string; binding: string}) => false | {probe: () => VerificationState};

export class VerificationGuard {
  private blocked: DriverFailure | undefined;
  private main: Frame | undefined;
  private providerRequests = 0;
  private providerPosts = 0;
  private responseBytes = 0;
  private applicationRequests = 0;
  private pendingPost = false;
  private boundaryReady = false;
  private submit: Locator | undefined;
  private readiness: (() => Promise<VerificationState>) | undefined;
  readonly submission: VerificationSubmission;

  constructor(private readonly context: BrowserContext, private readonly descriptor: VerificationDescriptor,
    private readonly applicationOrigins: ReadonlySet<string>, private readonly navigationURLs: ReadonlySet<string>,
    deadline: number, private readonly diagnostic = false) {
    this.submission = new VerificationSubmission(descriptor, deadline, Date.now, false);
  }

  async bindSubmit(submit: Locator): Promise<void> {
    this.submission.startPhase();
    const control = await submit.elementHandle();
    if (!control) throw new DriverFailure("verification_unsupported");
    this.submit = submit;
    const binding = "__udon_verification_" + randomUUID().replaceAll("-", "");
    await this.context.exposeBinding(binding, async (source, state: unknown) => {
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
        this.blocked ??= error instanceof DriverFailure ? error : new DriverFailure("verification_policy");
        // Only closed prose crosses this trusted binding into the page.
        throw new Error("verification_stopped");
      }
    });
    const adapter = await control.evaluateHandle(installSubmissionBoundary, { provider: this.descriptor.provider, submissionURL: this.descriptor.submissionURL, binding });
    this.readiness = async () => {
      const state = await adapter.evaluate(value => value === false ? "unsupported" : value.probe());
      if (!verificationStates.includes(state)) throw new DriverFailure("verification_unsupported");
      return state;
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
  async install(): Promise<void> {
    await this.context.route("**/*", route => this.handle(route));
    await this.context.routeWebSocket("**/*", async socket => {
      this.rejectMutation(); await socket.close().catch(() => undefined);
    });
    this.context.on("page", page => {
      if (this.main && page.mainFrame() !== this.main) { this.rejectMutation(); void page.close().catch(() => undefined); }
      page.on("download", download => { this.rejectMutation(); void download.cancel().catch(() => undefined); });
    });
  }

  // Provider responses are fetched with redirects disabled and never handed to
  // Chromium as redirects. This covers OOPIF routes without relying on a main
  // page CDP session. Application redirects use the main-frame response gate.
  async watchRedirects(page: Page): Promise<void> {
    if (this.main) throw new DriverFailure("invalid_response");
    this.main = page.mainFrame();
    const session = await this.context.newCDPSession(page);
    session.on("Fetch.requestPaused", async event => {
      try {
        this.assertSafe();
        if ([301, 302, 303, 307, 308].includes(event.responseStatusCode ?? 0)) {
          const locations = (event.responseHeaders ?? []).filter(h => h.name.toLowerCase() === "location");
          if (locations.length !== 1 || permitsVerificationURL(this.descriptor.provider, event.request.url, event.request.method, event.resourceType === "Document")) this.deny();
          const target = new URL(locations[0]!.value, event.request.url).href;
          if (!this.navigationURLs.has(target) || event.resourceType !== "Document" ||
              event.request.method === "POST" && event.responseStatusCode !== 303 && event.responseStatusCode !== 301 && event.responseStatusCode !== 302) this.deny();
        }
        await session.send("Fetch.continueResponse", { requestId: event.requestId });
      } catch {
        this.rejectMutation();
        await session.send("Fetch.failRequest", { requestId: event.requestId, errorReason: "BlockedByClient" }).catch(() => undefined);
      }
    });
    await session.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Response" }] });
  }
  beginSubmit(): void {
    if (this.diagnostic || !this.submit) this.deny();
    this.submission.approve(); this.submission.trigger();
  }
  finishSubmit(): void { this.assertSafe(); if (this.postCount() !== 1) this.submission.fail("verification_not_ready"); }
  postCount(): number { return this.submission.postCount(); }
  assertSafe(): void { if (this.blocked) throw this.blocked; this.submission.assertActive(); }
  rejectMutation(): void { this.blocked ??= new DriverFailure("verification_policy"); }
  private deny(): never { this.rejectMutation(); throw this.blocked!; }

  private providerFrame(frame: Frame, navigation: boolean): boolean {
    if (!this.main || frame === this.main && navigation) return false;
    let current: Frame | null = navigation ? frame.parentFrame() : frame;
    for (let depth = 0; current && depth < 8; depth++, current = current.parentFrame()) {
      if (current === this.main) return this.applicationOrigins.has(new URL(current.url()).origin);
      if (!permitsVerificationURL(this.descriptor.provider, current.url(), "GET", true)) return false;
    }
    return false;
  }

  private async handle(route: Route): Promise<void> {
    const request = route.request();
    try {
      this.assertSafe();
      const url = new URL(request.url()), method = request.method().toUpperCase(), navigation = request.isNavigationRequest();
      if (request.resourceType() === "eventsource") this.deny();
      if (url.username || url.password || !["https:", "http:"].includes(url.protocol)) this.deny();
      if (permitsVerificationURL(this.descriptor.provider, request.url(), method, navigation)) {
        if (!this.providerFrame(request.frame(), navigation)) this.deny();
        this.submission.startPhase();
        if (this.providerRequests >= this.descriptor.dependencies.maxRequests) this.submission.fail("verification_budget");
        this.providerRequests++;
        if (method === "POST") this.providerPosts++;
        const response = await route.fetch({ maxRedirects: 0, maxRetries: 0,
          timeout: Math.max(1, this.submission.deadline - Date.now()) });
        try {
          this.assertSafe();
          const headers = response.headers();
          if (response.status() >= 300 && response.status() < 400 ||
              /text\/event-stream/iu.test(headers["content-type"] ?? "") || headers["content-disposition"]?.toLowerCase().includes("attachment")) this.deny();
          const remaining = this.descriptor.dependencies.maxResponseBytes - this.responseBytes;
          if (Number(headers["content-length"] ?? 0) > remaining) this.submission.fail("verification_budget");
          const body = await response.body();
          if (body.length > this.descriptor.dependencies.maxResponseBytes - this.responseBytes) this.submission.fail("verification_budget");
          this.responseBytes += body.length;
          this.assertSafe();
          await route.fulfill({ response, body });
        } finally { await response.dispose(); }
        return;
      }
      if (!this.applicationOrigins.has(url.origin)) {
        if (!navigation && ["GET", "HEAD"].includes(method)) { await route.abort("blockedbyclient"); return; }
        this.deny();
      }
      if (request.frame() !== this.main || navigation && !this.navigationURLs.has(url.href) && !(method === "POST" && url.href === this.descriptor.submissionURL)) this.deny();
      this.applicationRequests++;
      if (method === "GET" || method === "HEAD") { await route.continue(); return; }
      if (method !== "POST" || url.href !== this.descriptor.submissionURL || this.diagnostic || this.pendingPost || this.postCount()) this.deny();
      this.pendingPost = true;
      if (!this.boundaryReady) this.submission.fail("verification_not_ready");
      this.assertSafe();
      this.submission.release("ready");
      await route.continue();
    } catch (error) {
      this.blocked ??= error instanceof DriverFailure ? error : new DriverFailure("verification_policy");
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
