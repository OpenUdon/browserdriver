import { chromium, type Browser, type BrowserContext, type Locator, type Page, type Route } from "playwright";
import {
  type ActionMessage, type AuthenticateMessage, type AuthenticationStep, type BrowserOutput, type BrowserWait,
  type ChallengeKind, type ChallengeResponseMessage, DriverFailure, challenge, failure,
  protocolVersionV3, status, success,
} from "./protocol.js";
import { assertAllowedURL, credentialValue, exactOrigin, totp } from "./security.js";
import type { SessionStateStore } from "./session-store.js";
import { RuntimeContexts, type BrowserTarget } from "./contexts.js";

export interface MessageSource {
  next(signal?: AbortSignal): Promise<IteratorResult<string>>;
}

export type Emit = (message: object) => void;

interface NamedSession {
  context: BrowserContext;
  page: Page;
  visited: string[];
  navigation: NavigationGuard;
  runtime?: RuntimeContexts;
}

export interface PersistentBrowserDriverOptions {
  headed?: boolean;
  sessionStore?: SessionStateStore;
  challengeTimeoutMs?: number;
  numberMatchSelector?: string;
}

export const defaultChallengeTimeoutMs = 120_000;
export const maxVisitedURLsPerWindow = 1_024;

export class PersistentBrowserDriver {
  private browser: Browser | undefined;
  private readonly sessions = new Map<string, NamedSession>();

  constructor(
    private readonly lines: MessageSource,
    private readonly emit: Emit,
    private readonly options: PersistentBrowserDriverOptions = {},
  ) {
    const timeout = options.challengeTimeoutMs ?? defaultChallengeTimeoutMs;
    if (!Number.isSafeInteger(timeout) || timeout <= 0) throw new Error("challenge timeout must be a positive integer");
    if (options.numberMatchSelector !== undefined &&
        (!options.numberMatchSelector.trim() || options.numberMatchSelector.length > 4_096 || /[\0\r\n]/u.test(options.numberMatchSelector))) {
      throw new Error("number-match selector is invalid");
    }
  }

  async authenticate(request: AuthenticateMessage): Promise<void> {
    let context: BrowserContext | undefined;
    try {
      validateAuthenticationMessage(request);
      this.emit(status(request.requestId, "resolving", request.version));
      const allowed = new Set(request.allowedOrigins.map(exactOrigin));
      const flow = request.profile.flows[request.flow]!;
      context = await this.createContext(request.sessionBinding);
      const visited: string[] = [];
      const navigation = new NavigationGuard(context, visited, allowed, request.version === protocolVersionV3);
      await navigation.install();
      const page = await context.newPage();
      const runtime = request.version === protocolVersionV3
        ? new RuntimeContexts(context, page, request.profile.contexts, allowed)
        : undefined;
      this.emit(status(request.requestId, request.sessionBinding ? "refreshing" : "logging_in", request.version));
      for (const step of flow.sequence) {
        if (runtime) {
          runtime.assertNoExtraPages();
          await rejectCaptchas(runtime.allResolvedTargets());
        } else await rejectCaptcha(page);
        try {
          if (runtime) await this.authenticationStepV3(request, step, runtime, allowed);
          else await this.authenticationStep(request, step, page, allowed);
        } finally {
          navigation.assertSafe();
        }
      }
      const successTarget = runtime ? await runtime.target(flow.success.context) : page;
      if (runtime) {
        runtime.assertNoExtraPages();
        await rejectCaptchas(runtime.allResolvedTargets());
      } else await rejectCaptcha(page);
      assertAllowedURL(successTarget.url(), allowed);
      if (exactOrigin(successTarget.url()) !== exactOrigin(flow.success.origin)) throw new DriverFailure("origin_rejected");
      if (flow.success.path !== undefined && new URL(successTarget.url()).pathname !== flow.success.path) throw new DriverFailure("invalid_response");
      await exactLocator(successTarget, flow.success.locator);
      visited.length = 0;
      const previous = this.sessions.get(request.session);
      if (previous) await previous.context.close();
      this.sessions.set(request.session, { context, page, visited, navigation, ...(runtime ? { runtime } : {}) });
      context = undefined;
      this.emit(success(request.requestId, undefined, request.version));
    } catch (error) {
      await context?.close().catch(() => undefined);
      this.emit(failure(request.requestId, failureCode(error), request.version));
    }
  }

  async action(request: ActionMessage): Promise<void> {
    try {
      const expectedActionVersion = request.version === protocolVersionV3 ? "udon.browser-driver.v2" : "udon.browser-driver.v1";
      if (!request.session || !request.action || request.action.version !== expectedActionVersion) {
        throw new DriverFailure("invalid_response");
      }
      if (request.version === protocolVersionV3 && request.action.allowedOrigins.some((origin) => exactOrigin(origin) !== origin)) {
        throw new DriverFailure("origin_rejected");
      }
      const session = this.sessions.get(request.session);
      if (!session) throw new DriverFailure("session_expired");
      const allowed = new Set(request.action.allowedOrigins.map(exactOrigin));
      const visitedStart = session.visited.length;
      let outputs: Record<string, unknown>;
      let visitedUrls: string[];
      try {
        session.navigation.setAllowed(allowed);
        if (request.version === protocolVersionV3) {
          if (!session.runtime) throw new DriverFailure("invalid_response");
          session.runtime.mergeForAction(request.action.contexts, allowed);
          session.runtime.assertNoExtraPages();
        } else if (session.runtime) throw new DriverFailure("invalid_response");
        assertAllowedURL(session.page.url(), allowed);
        this.emit(status(request.requestId, "executing", request.version));
        for (const step of request.action.action.sequence) {
          if (session.runtime) await rejectCaptchas(session.runtime.allResolvedTargets());
          else await rejectCaptcha(session.page);
          try {
            if (session.runtime) await browserStepV3(session.runtime, step as Record<string, unknown>, allowed);
            else await browserStep(session.page, step as Record<string, unknown>, allowed);
          } finally {
            session.navigation.assertSafe();
          }
        }
        if (session.runtime) {
          session.runtime.assertNoExtraPages();
          await rejectCaptchas(session.runtime.allResolvedTargets());
        } else await rejectCaptcha(session.page);
        assertAllowedURL(session.page.url(), allowed);
        outputs = session.runtime
          ? await extractOutputsV3(session.runtime, request.action.action.outputs ?? {})
          : await extractOutputs(session.page, request.action.action.outputs ?? {});
        visitedUrls = attestedVisitedURLs(session.page.url(), session.visited.slice(visitedStart));
      } finally {
        session.visited.splice(visitedStart);
      }
      this.emit(success(request.requestId, {
        status: "success", outputs, visitedUrls, ambiguities: [],
      }, request.version));
    } catch (error) {
      if (failureCode(error) === "origin_rejected") {
        const session = this.sessions.get(request.session);
        this.sessions.delete(request.session);
        await session?.context.close().catch(() => undefined);
      }
      this.emit(failure(request.requestId, failureCode(error), request.version));
    }
  }

  async close(): Promise<void> {
    for (const session of this.sessions.values()) await session.context.close().catch(() => undefined);
    this.sessions.clear();
    await this.browser?.close().catch(() => undefined);
    this.browser = undefined;
  }

  private async createContext(binding?: string): Promise<BrowserContext> {
    this.browser ??= await chromium.launch({ headless: !this.options.headed });
    if (!binding) return this.browser.newContext({ serviceWorkers: "block" });
    if (!this.options.sessionStore) throw new DriverFailure("session_expired");
    const storageState = await this.options.sessionStore.load(binding);
    return this.browser.newContext({ serviceWorkers: "block", storageState: storageState as never });
  }

  private async authenticationStep(request: AuthenticateMessage, step: AuthenticationStep, page: Page, allowed: Set<string>): Promise<void> {
    if ("navigate" in step) {
      if (typeof step.navigate !== "string") throw new DriverFailure("invalid_response");
      assertAllowedURL(step.navigate, allowed);
      await page.goto(step.navigate, { waitUntil: "domcontentloaded" });
      assertAllowedURL(page.url(), allowed);
      return;
    }
    if ("type_credential" in step) {
      const binding = request.credentialBindings[step.type_credential.slot];
      const environment = binding ? request.credentialEnvironment[binding] : undefined;
      const value = credentialValue(environment);
      await (await exactLocator(page, step.type_credential.locator)).fill(value);
      return;
    }
    if ("click" in step) {
      await (await exactLocator(page, step.click.locator)).click();
      return;
    }
    if ("wait_for" in step) {
      await exactLocator(page, step.wait_for.locator);
      return;
    }
    if ("challenge" in step) {
      await this.authenticationChallenge(request, step.challenge, page);
      return;
    }
    throw new DriverFailure("invalid_response");
  }

  private async authenticationStepV3(request: AuthenticateMessage, step: AuthenticationStep, runtime: RuntimeContexts, allowed: Set<string>): Promise<void> {
    if ("navigate" in step) {
      const navigation = typeof step.navigate === "string" ? { url: step.navigate, context: "main" } : step.navigate;
      assertAllowedURL(navigation.url, allowed);
      const target = await runtime.target(navigation.context);
      await target.goto(navigation.url, { waitUntil: "domcontentloaded" });
      assertAllowedURL(target.url(), allowed);
      runtime.assertNoExtraPages();
      return;
    }
    if ("type_credential" in step) {
      const binding = request.credentialBindings[step.type_credential.slot];
      const environment = binding ? request.credentialEnvironment[binding] : undefined;
      const target = await runtime.target(step.type_credential.context);
      await (await exactLocator(target, step.type_credential.locator)).fill(credentialValue(environment));
      return;
    }
    if ("click" in step) {
      const target = await runtime.target(step.click.context);
      const locator = await exactLocator(target, step.click.locator);
      if (step.click.opensContext) await openPopup(runtime, step.click.context ?? "main", step.click.opensContext, target, locator);
      else await locator.click();
      runtime.assertNoExtraPages();
      return;
    }
    if ("wait_for" in step) {
      const target = await runtime.target(step.wait_for.context);
      await exactLocator(target, step.wait_for.locator);
      return;
    }
    if ("challenge" in step) {
      const target = await runtime.target(step.challenge.context);
      await this.authenticationChallenge(request, step.challenge, target);
      return;
    }
    throw new DriverFailure("invalid_response");
  }

  private async authenticationChallenge(request: AuthenticateMessage, step: { kind: ChallengeKind; locator?: import("./protocol.js").LocatorSpec; slot?: string; context?: string }, page: BrowserTarget): Promise<void> {
    this.emit(status(request.requestId, "awaiting_mfa", request.version));
    if (step.kind === "totp") {
      if (!step.slot || !step.locator) throw new DriverFailure("invalid_response");
      const binding = request.credentialBindings[step.slot];
      const environment = binding ? request.credentialEnvironment[binding] : undefined;
      await (await exactLocator(page, step.locator)).fill(totp(credentialValue(environment)));
      return;
    }
    let number: string | undefined;
    if (step.kind === "push_number_match") number = await uniqueNumberMatch(page, this.options.numberMatchSelector);
    const response = await this.requestChallenge(request.requestId, step.kind, request.version, number);
    if (response.decision === "deny") throw new DriverFailure("mfa_denied");
    if (step.kind === "sms_otp" || step.kind === "email_otp" || step.kind === "voice_otp") {
      if (response.decision !== "provide" || !response.value || !step.locator) throw new DriverFailure("mfa_denied");
      await (await exactLocator(page, step.locator)).fill(response.value);
      return;
    }
    if (response.decision !== "approve" || response.value) throw new DriverFailure("mfa_denied");
  }

  private async requestChallenge(requestId: string, kind: ChallengeKind, version: import("./protocol.js").ProtocolVersion, number?: string): Promise<ChallengeResponseMessage> {
    const pending = challenge(requestId, kind, number, version);
    this.emit(pending.message);
    return readChallengeResponse(this.lines, requestId, pending.id, this.options.challengeTimeoutMs ?? defaultChallengeTimeoutMs, version);
  }
}

export async function readChallengeResponse(
  lines: MessageSource,
  requestId: string,
  challengeId: string,
  timeoutMs: number,
  version: import("./protocol.js").ProtocolVersion = "udon.browser-driver.v2",
): Promise<ChallengeResponseMessage> {
  const signal = AbortSignal.timeout(timeoutMs);
  let line: IteratorResult<string>;
  try {
    line = await lines.next(signal);
  } catch {
    if (signal.aborted) throw new DriverFailure("mfa_timeout");
    throw new DriverFailure("invalid_response");
  }
  if (line.done) throw new DriverFailure("mfa_timeout");
  let value: unknown;
  try { value = JSON.parse(line.value); } catch { throw new DriverFailure("invalid_response"); }
  const response = value as Partial<ChallengeResponseMessage>;
  if (response.version !== version || response.type !== "challenge_response" ||
      response.requestId !== requestId || response.challengeId !== challengeId ||
      !["approve", "deny", "provide"].includes(response.decision ?? "")) {
    throw new DriverFailure("invalid_response");
  }
  return response as ChallengeResponseMessage;
}

function validateAuthenticationMessage(request: AuthenticateMessage): void {
  if (!request.operationId || !request.requestId || !request.sourceDigest || !request.session ||
      !request.profile?.flows[request.flow] ||
      (request.version === protocolVersionV3
        ? request.profile.profile !== "uws.browser-authentication.1.1"
        : request.profile.profile !== "uws.browser-authentication.1.0" || request.profile.contexts !== undefined)) {
    throw new DriverFailure("invalid_response");
  }
  if (request.version === protocolVersionV3) {
    const profileOrigins = [...request.profile.info.applicationOrigins, ...request.profile.info.authenticationOrigins];
    if ([...request.allowedOrigins, ...profileOrigins].some((origin) => exactOrigin(origin) !== origin)) throw new DriverFailure("origin_rejected");
    const allowed = new Set(request.allowedOrigins);
    if (profileOrigins.some((origin) => !allowed.has(origin))) throw new DriverFailure("origin_rejected");
  }
}

async function browserStep(page: Page, step: Record<string, unknown>, allowed: Set<string>): Promise<void> {
  if (typeof step.navigate === "string") {
    assertAllowedURL(step.navigate, allowed);
    await page.goto(step.navigate, { waitUntil: "domcontentloaded" });
    assertAllowedURL(page.url(), allowed);
    return;
  }
  if (isObject(step.click)) {
    await (await exactLocator(page, requiredLocator(step.click))).click();
    await optionalWait(page, step.click.wait_for as BrowserWait | undefined);
    return;
  }
  if (isObject(step.type_text) && typeof step.type_text.value === "string") {
    await (await exactLocator(page, requiredLocator(step.type_text))).fill(step.type_text.value);
    await optionalWait(page, step.type_text.wait_for as BrowserWait | undefined);
    return;
  }
  if (isObject(step.check_radio)) {
    await (await exactLocator(page, requiredLocator(step.check_radio))).check();
    await optionalWait(page, step.check_radio.wait_for as BrowserWait | undefined);
    return;
  }
  if (isObject(step.uncheck)) {
    await (await exactLocator(page, requiredLocator(step.uncheck))).uncheck();
    await optionalWait(page, step.uncheck.wait_for as BrowserWait | undefined);
    return;
  }
  if (isObject(step.select_option) && typeof step.select_option.value === "string") {
    await (await exactLocator(page, requiredLocator(step.select_option))).selectOption(step.select_option.value);
    await optionalWait(page, step.select_option.wait_for as BrowserWait | undefined);
    return;
  }
  if (isObject(step.wait_for)) {
    await optionalWait(page, step.wait_for as BrowserWait);
    return;
  }
  throw new DriverFailure("invalid_response");
}

async function browserStepV3(runtime: RuntimeContexts, step: Record<string, unknown>, allowed: Set<string>): Promise<void> {
  if (typeof step.navigate === "string" || isObject(step.navigate)) {
    const navigation = typeof step.navigate === "string" ? { url: step.navigate, context: "main" } : step.navigate;
    if (typeof navigation.url !== "string") throw new DriverFailure("invalid_response");
    assertAllowedURL(navigation.url, allowed);
    const target = await runtime.target(typeof navigation.context === "string" ? navigation.context : "main");
    await target.goto(navigation.url, { waitUntil: "domcontentloaded" });
    assertAllowedURL(target.url(), allowed);
    runtime.assertNoExtraPages();
    return;
  }
  if (isObject(step.click)) {
    const context = contextID(step.click);
    const target = await runtime.target(context);
    const locator = await exactLocator(target, requiredLocator(step.click));
    if (typeof step.click.opensContext === "string") await openPopup(runtime, context, step.click.opensContext, target, locator);
    else await locator.click();
    await optionalWaitV3(runtime, step.click.wait_for as BrowserWait | undefined, context);
    runtime.assertNoExtraPages();
    return;
  }
  if (isObject(step.type_text) && typeof step.type_text.value === "string") {
    const context = contextID(step.type_text);
    const target = await runtime.target(context);
    await (await exactLocator(target, requiredLocator(step.type_text))).fill(step.type_text.value);
    await optionalWaitV3(runtime, step.type_text.wait_for as BrowserWait | undefined, context);
    return;
  }
  if (isObject(step.check_radio)) {
    const context = contextID(step.check_radio);
    await (await exactLocator(await runtime.target(context), requiredLocator(step.check_radio))).check();
    await optionalWaitV3(runtime, step.check_radio.wait_for as BrowserWait | undefined, context);
    return;
  }
  if (isObject(step.uncheck)) {
    const context = contextID(step.uncheck);
    await (await exactLocator(await runtime.target(context), requiredLocator(step.uncheck))).uncheck();
    await optionalWaitV3(runtime, step.uncheck.wait_for as BrowserWait | undefined, context);
    return;
  }
  if (isObject(step.select_option) && typeof step.select_option.value === "string") {
    const context = contextID(step.select_option);
    await (await exactLocator(await runtime.target(context), requiredLocator(step.select_option))).selectOption(step.select_option.value);
    await optionalWaitV3(runtime, step.select_option.wait_for as BrowserWait | undefined, context);
    return;
  }
  if (isObject(step.wait_for)) {
    await optionalWaitV3(runtime, step.wait_for as BrowserWait, "main");
    return;
  }
  throw new DriverFailure("invalid_response");
}

async function optionalWait(page: Page, wait?: BrowserWait): Promise<void> {
  if (!wait) return;
  if ("locator" in wait) {
    await exactLocator(page, wait.locator);
    return;
  }
  if (!("navigation" in wait)) throw new DriverFailure("invalid_response");
  const state = wait.navigation === "network_idle" ? "networkidle" : wait.navigation;
  await page.waitForLoadState(state);
}

async function optionalWaitV3(runtime: RuntimeContexts, wait: BrowserWait | undefined, fallbackContext: string): Promise<void> {
  if (!wait) return;
  if ("navigation" in wait) {
    const target = await runtime.target(fallbackContext);
    const state = wait.navigation === "network_idle" ? "networkidle" : wait.navigation;
    await target.waitForLoadState(state);
    return;
  }
  if ("locator" in wait) {
    const target = await runtime.target(wait.context ?? fallbackContext);
    await exactLocator(target, wait.locator);
    return;
  }
  await exactLocator(await runtime.target(fallbackContext), wait);
}

async function openPopup(runtime: RuntimeContexts, parentID: string, opensContext: string, target: BrowserTarget, locator: Locator): Promise<void> {
  const definition = runtime.definition(opensContext);
  if (!definition || definition.kind !== "popup" || definition.parent !== parentID) throw new DriverFailure("invalid_response");
  runtime.assertNoExtraPages();
  const owner = isPageTarget(target) ? target : target.page();
  const before = new Set(owner.context().pages());
  runtime.beginPopup(opensContext);
  const [popup] = await Promise.all([owner.waitForEvent("popup"), locator.click()]);
  await popup.waitForLoadState("domcontentloaded");
  const added = owner.context().pages().filter((page) => !before.has(page));
  if (added.length !== 1 || added[0] !== popup) throw new DriverFailure("invalid_response");
  runtime.completePopup(opensContext, parentID, popup);
}

function locatorFor(page: BrowserTarget, spec: import("./protocol.js").LocatorSpec): Locator {
  if (!spec || typeof spec.role !== "string") throw new DriverFailure("invalid_response");
  let locator = page.getByRole(spec.role as Parameters<Page["getByRole"]>[0], {
    ...(spec.name !== undefined ? { name: spec.name, exact: true } : {}),
  });
  if (spec.text !== undefined) locator = locator.filter({ hasText: spec.text });
  return locator;
}

export async function exactLocator(page: BrowserTarget, spec: import("./protocol.js").LocatorSpec): Promise<Locator> {
  const locator = locatorFor(page, spec);
  await locator.first().waitFor({ state: "visible" });
  if (await locator.count() !== 1) throw new DriverFailure("ambiguous_locator");
  if (spec.value !== undefined && await locator.inputValue() !== spec.value) throw new DriverFailure("ambiguous_locator");
  return locator;
}

function requiredLocator(value: Record<string, unknown>): import("./protocol.js").LocatorSpec {
  if (!isObject(value.locator)) throw new DriverFailure("invalid_response");
  return value.locator as unknown as import("./protocol.js").LocatorSpec;
}

async function rejectCaptcha(page: BrowserTarget): Promise<void> {
  const locator = page.locator('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare"], [data-sitekey]');
  if (await locator.count() > 0) throw new DriverFailure("captcha_required");
}

async function rejectCaptchas(targets: BrowserTarget[]): Promise<void> {
  for (const target of targets) await rejectCaptcha(target);
}

export async function uniqueNumberMatch(page: BrowserTarget, selector?: string): Promise<string> {
  const text = await page.locator(selector ?? "body").innerText();
  const preferred = unique([...text.matchAll(/\b\d{2}\b/gu)].map((value) => value[0]));
  const values = preferred.length > 0
    ? preferred
    : unique([...text.matchAll(/\b\d{2,8}\b/gu)].map((value) => value[0]));
  if (values.length !== 1) throw new DriverFailure("ambiguous_locator");
  return values[0]!;
}

export class NavigationGuard {
  private blocked = false;
  private overflow = false;
  private windowStart = 0;

  constructor(
    private readonly context: Pick<BrowserContext, "route">,
    private readonly visited: string[],
    private allowed: ReadonlySet<string>,
    private readonly includeChildContexts = false,
  ) {}

  async install(): Promise<void> {
    await this.context.route("**/*", async (route) => this.handle(route));
  }

  setAllowed(allowed: ReadonlySet<string>): void {
    this.allowed = allowed;
    this.windowStart = this.visited.length;
    this.overflow = false;
  }

  assertSafe(): void {
    if (this.blocked) throw new DriverFailure("origin_rejected");
    if (this.overflow) throw new DriverFailure("driver_error");
  }

  private async handle(route: Route): Promise<void> {
    const request = route.request();
    if (!request.isNavigationRequest() || (!this.includeChildContexts && request.frame().parentFrame() !== null)) {
      await route.continue();
      return;
    }
    const url = request.url();
    if (url !== "about:blank") {
      if (this.visited.length - this.windowStart >= maxVisitedURLsPerWindow) {
        this.overflow = true;
        await route.abort("blockedbyclient");
        return;
      }
      this.visited.push(url);
    }
    try {
      assertAllowedURL(url, this.allowed);
    } catch {
      this.blocked = true;
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  }
}

export function attestedVisitedURLs(currentURL: string, visited: string[]): string[] {
  return unique([...visited, currentURL].filter((value) => value !== "about:blank"));
}

export async function extractOutputs(page: BrowserTarget, outputs: Record<string, BrowserOutput>): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const [name, output] of Object.entries(outputs)) {
    if (output.source === "a11y") {
      if (!output.locator) throw new DriverFailure("invalid_response");
      if (output.presence !== undefined) {
        const locator = locatorFor(page, output.locator);
        const count = await locator.count();
        if (count > 1) throw new DriverFailure("ambiguous_locator");
        result[name] = count === 1;
      } else {
        const locator = await exactLocator(page, output.locator);
        result[name] = await locatorOutput(locator, output);
      }
    } else if (output.source === "css") {
      if (!output.selector) throw new DriverFailure("invalid_response");
      const locator = page.locator(output.selector);
      if (output.presence !== undefined) {
        result[name] = await locator.count() > 0;
      } else {
        if (await locator.count() !== 1) throw new DriverFailure("ambiguous_locator");
        result[name] = await locatorOutput(locator, output);
      }
    } else if (output.source === "jsonld") {
      result[name] = await jsonLDOutput(page, output.property ?? name);
    } else if (output.source === "microdata") {
      result[name] = await microdataOutput(page, output.property ?? name, output.attribute);
    } else {
      throw new DriverFailure("invalid_response");
    }
  }
  return result;
}

export async function extractOutputsV3(runtime: RuntimeContexts, outputs: Record<string, BrowserOutput>): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const [name, output] of Object.entries(outputs)) {
    const target = await runtime.target(output.context);
    const { context: _context, ...portable } = output;
    Object.assign(result, await extractOutputs(target, { [name]: portable }));
  }
  return result;
}

async function locatorOutput(locator: Locator, output: BrowserOutput): Promise<unknown> {
  if (output.presence !== undefined) return await locator.count() > 0;
  if (output.attribute) return locator.getAttribute(output.attribute);
  if (output.property) return locator.evaluate((element, property) => (element as unknown as Record<string, unknown>)[property], output.property);
  const tag = await locator.evaluate((element) => element.tagName.toLowerCase());
  if (tag === "input" || tag === "textarea" || tag === "select") return locator.inputValue();
  return (await locator.textContent())?.trim() ?? "";
}

async function jsonLDOutput(page: BrowserTarget, property?: string): Promise<unknown> {
  if (!property) throw new DriverFailure("invalid_response");
  const documents = await page.locator('script[type="application/ld+json"]').allTextContents();
  const found: unknown[] = [];
  for (const document of documents) {
    try { collectProperty(JSON.parse(document), property.split("."), found); } catch { /* untrusted invalid JSON-LD is ignored */ }
  }
  if (found.length !== 1) throw new DriverFailure("ambiguous_locator");
  return found[0];
}

function collectProperty(value: unknown, path: string[], found: unknown[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectProperty(item, path, found);
    return;
  }
  if (!isObject(value)) return;
  let current: unknown = value;
  for (const segment of path) {
    if (!isObject(current) || !(segment in current)) { current = undefined; break; }
    current = current[segment];
  }
  if (current !== undefined) found.push(current);
  for (const child of Object.values(value)) if (typeof child === "object" && child !== null) collectProperty(child, path, found);
}

async function microdataOutput(page: BrowserTarget, property?: string, attribute?: string): Promise<unknown> {
  if (!property) throw new DriverFailure("invalid_response");
  const values = await page.locator("[itemprop]").evaluateAll((elements, input) => elements
    .filter((element) => element.getAttribute("itemprop")?.split(/\s+/u).includes(input.property))
    .map((element) => input.attribute ? element.getAttribute(input.attribute) : element.getAttribute("content") ?? element.textContent?.trim()),
  { property, attribute });
  if (values.length !== 1) throw new DriverFailure("ambiguous_locator");
  return values[0];
}

function failureCode(error: unknown): import("./protocol.js").FailureCode {
  if (error instanceof DriverFailure) return error.code;
  return "driver_error";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function contextID(value: Record<string, unknown>): string {
  if (value.context === undefined) return "main";
  if (typeof value.context !== "string") throw new DriverFailure("invalid_response");
  return value.context;
}

function isPageTarget(value: BrowserTarget): value is Page { return "mainFrame" in value; }

function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
