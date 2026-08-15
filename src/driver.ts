import { chromium, type Browser, type BrowserContext, type Locator, type Page, type Route } from "playwright";
import {
  type ActionMessage, type AuthenticateMessage, type AuthenticationStep, type BrowserOutput, type BrowserWait,
  type ChallengeKind, type ChallengeResponseMessage, DriverFailure, challenge, failure, status, success,
} from "./protocol.js";
import { assertAllowedURL, credentialValue, exactOrigin, totp } from "./security.js";
import type { SessionStateStore } from "./session-store.js";

export interface MessageSource {
  next(): Promise<IteratorResult<string>>;
}

export type Emit = (message: object) => void;

interface NamedSession {
  context: BrowserContext;
  page: Page;
  visited: string[];
  navigation: NavigationGuard;
}

export class PersistentBrowserDriver {
  private browser: Browser | undefined;
  private readonly sessions = new Map<string, NamedSession>();

  constructor(
    private readonly lines: MessageSource,
    private readonly emit: Emit,
    private readonly headed = false,
    private readonly sessionStore?: SessionStateStore,
  ) {}

  async authenticate(request: AuthenticateMessage): Promise<void> {
    let context: BrowserContext | undefined;
    try {
      validateAuthenticationMessage(request);
      this.emit(status(request.requestId, "resolving"));
      const allowed = new Set(request.allowedOrigins.map(exactOrigin));
      const flow = request.profile.flows[request.flow]!;
      context = await this.createContext(request.sessionBinding);
      const visited: string[] = [];
      const navigation = new NavigationGuard(context, visited, allowed);
      await navigation.install();
      const page = await context.newPage();
      this.emit(status(request.requestId, request.sessionBinding ? "refreshing" : "logging_in"));
      for (const step of flow.sequence) {
        await rejectCaptcha(page);
        try {
          await this.authenticationStep(request, step, page, allowed);
        } finally {
          navigation.assertSafe();
        }
      }
      await rejectCaptcha(page);
      assertAllowedURL(page.url(), allowed);
      if (exactOrigin(page.url()) !== exactOrigin(flow.success.origin)) throw new DriverFailure("origin_rejected");
      await exactLocator(page, flow.success.locator);
      const previous = this.sessions.get(request.session);
      if (previous) await previous.context.close();
      this.sessions.set(request.session, { context, page, visited, navigation });
      context = undefined;
      this.emit(success(request.requestId));
    } catch (error) {
      await context?.close().catch(() => undefined);
      this.emit(failure(request.requestId, failureCode(error)));
    }
  }

  async action(request: ActionMessage): Promise<void> {
    try {
      if (!request.session || !request.action || request.action.version !== "udon.browser-driver.v1") {
        throw new DriverFailure("invalid_response");
      }
      const session = this.sessions.get(request.session);
      if (!session) throw new DriverFailure("session_expired");
      const allowed = new Set(request.action.allowedOrigins.map(exactOrigin));
      const visitedStart = session.visited.length;
      session.navigation.setAllowed(allowed);
      assertAllowedURL(session.page.url(), allowed);
      this.emit(status(request.requestId, "executing"));
      for (const step of request.action.action.sequence) {
        await rejectCaptcha(session.page);
        try {
          await browserStep(session.page, step as Record<string, unknown>, allowed);
        } finally {
          session.navigation.assertSafe();
        }
      }
      await rejectCaptcha(session.page);
      assertAllowedURL(session.page.url(), allowed);
      const outputs = await extractOutputs(session.page, request.action.action.outputs ?? {});
      this.emit(success(request.requestId, {
        status: "success", outputs,
        visitedUrls: attestedVisitedURLs(session.page.url(), session.visited.slice(visitedStart)), ambiguities: [],
      }));
    } catch (error) {
      if (failureCode(error) === "origin_rejected") {
        const session = this.sessions.get(request.session);
        this.sessions.delete(request.session);
        await session?.context.close().catch(() => undefined);
      }
      this.emit(failure(request.requestId, failureCode(error)));
    }
  }

  async close(): Promise<void> {
    for (const session of this.sessions.values()) await session.context.close().catch(() => undefined);
    this.sessions.clear();
    await this.browser?.close().catch(() => undefined);
    this.browser = undefined;
  }

  private async createContext(binding?: string): Promise<BrowserContext> {
    this.browser ??= await chromium.launch({ headless: !this.headed });
    if (!binding) return this.browser.newContext({ serviceWorkers: "block" });
    if (!this.sessionStore) throw new DriverFailure("session_expired");
    const storageState = await this.sessionStore.load(binding);
    return this.browser.newContext({ serviceWorkers: "block", storageState: storageState as never });
  }

  private async authenticationStep(request: AuthenticateMessage, step: AuthenticationStep, page: Page, allowed: Set<string>): Promise<void> {
    if ("navigate" in step) {
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

  private async authenticationChallenge(request: AuthenticateMessage, step: { kind: ChallengeKind; locator?: import("./protocol.js").LocatorSpec; slot?: string }, page: Page): Promise<void> {
    this.emit(status(request.requestId, "awaiting_mfa"));
    if (step.kind === "totp") {
      if (!step.slot || !step.locator) throw new DriverFailure("invalid_response");
      const binding = request.credentialBindings[step.slot];
      const environment = binding ? request.credentialEnvironment[binding] : undefined;
      await (await exactLocator(page, step.locator)).fill(totp(credentialValue(environment)));
      return;
    }
    let number: string | undefined;
    if (step.kind === "push_number_match") number = await uniqueNumberMatch(page);
    const response = await this.requestChallenge(request.requestId, step.kind, number);
    if (response.decision === "deny") throw new DriverFailure("mfa_denied");
    if (step.kind === "sms_otp" || step.kind === "email_otp" || step.kind === "voice_otp") {
      if (response.decision !== "provide" || !response.value || !step.locator) throw new DriverFailure("mfa_denied");
      await (await exactLocator(page, step.locator)).fill(response.value);
      return;
    }
    if (response.decision !== "approve" || response.value) throw new DriverFailure("mfa_denied");
  }

  private async requestChallenge(requestId: string, kind: ChallengeKind, number?: string): Promise<ChallengeResponseMessage> {
    const pending = challenge(requestId, kind, number);
    this.emit(pending.message);
    const line = await this.lines.next();
    if (line.done) throw new DriverFailure("mfa_timeout");
    let value: unknown;
    try { value = JSON.parse(line.value); } catch { throw new DriverFailure("invalid_response"); }
    const response = value as Partial<ChallengeResponseMessage>;
    if (response.version !== "udon.browser-driver.v2" || response.type !== "challenge_response" ||
        response.requestId !== requestId || response.challengeId !== pending.id ||
        !["approve", "deny", "provide"].includes(response.decision ?? "")) {
      throw new DriverFailure("invalid_response");
    }
    return response as ChallengeResponseMessage;
  }
}

function validateAuthenticationMessage(request: AuthenticateMessage): void {
  if (!request.operationId || !request.requestId || !request.sourceDigest || !request.session ||
      request.profile?.profile !== "uws.browser-authentication.1.0" || !request.profile.flows[request.flow]) {
    throw new DriverFailure("invalid_response");
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

async function optionalWait(page: Page, wait?: BrowserWait): Promise<void> {
  if (!wait) return;
  if ("locator" in wait) {
    await exactLocator(page, wait.locator);
    return;
  }
  const state = wait.navigation === "network_idle" ? "networkidle" : wait.navigation;
  await page.waitForLoadState(state);
}

function locatorFor(page: Page, spec: import("./protocol.js").LocatorSpec): Locator {
  if (!spec || typeof spec.role !== "string") throw new DriverFailure("invalid_response");
  let locator = page.getByRole(spec.role as Parameters<Page["getByRole"]>[0], {
    ...(spec.name !== undefined ? { name: spec.name, exact: true } : {}),
  });
  if (spec.text !== undefined) locator = locator.filter({ hasText: spec.text });
  return locator;
}

export async function exactLocator(page: Page, spec: import("./protocol.js").LocatorSpec): Promise<Locator> {
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

async function rejectCaptcha(page: Page): Promise<void> {
  const locator = page.locator('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare"], [data-sitekey]');
  if (await locator.count() > 0) throw new DriverFailure("captcha_required");
}

async function uniqueNumberMatch(page: Page): Promise<string> {
  const text = await page.locator("body").innerText();
  const matches = [...text.matchAll(/\b\d{2,8}\b/gu)].map((value) => value[0]);
  const values = unique(matches);
  if (values.length !== 1) throw new DriverFailure("ambiguous_locator");
  return values[0]!;
}

export class NavigationGuard {
  private blocked = false;

  constructor(
    private readonly context: Pick<BrowserContext, "route">,
    private readonly visited: string[],
    private allowed: ReadonlySet<string>,
  ) {}

  async install(): Promise<void> {
    await this.context.route("**/*", async (route) => this.handle(route));
  }

  setAllowed(allowed: ReadonlySet<string>): void {
    this.allowed = allowed;
  }

  assertSafe(): void {
    if (this.blocked) throw new DriverFailure("origin_rejected");
  }

  private async handle(route: Route): Promise<void> {
    const request = route.request();
    if (!request.isNavigationRequest() || request.frame().parentFrame() !== null) {
      await route.continue();
      return;
    }
    const url = request.url();
    if (url !== "about:blank") this.visited.push(url);
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

export async function extractOutputs(page: Page, outputs: Record<string, BrowserOutput>): Promise<Record<string, unknown>> {
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

async function locatorOutput(locator: Locator, output: BrowserOutput): Promise<unknown> {
  if (output.presence !== undefined) return await locator.count() > 0;
  if (output.attribute) return locator.getAttribute(output.attribute);
  if (output.property) return locator.evaluate((element, property) => (element as unknown as Record<string, unknown>)[property], output.property);
  const tag = await locator.evaluate((element) => element.tagName.toLowerCase());
  if (tag === "input" || tag === "textarea" || tag === "select") return locator.inputValue();
  return (await locator.textContent())?.trim() ?? "";
}

async function jsonLDOutput(page: Page, property?: string): Promise<unknown> {
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

async function microdataOutput(page: Page, property?: string, attribute?: string): Promise<unknown> {
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

function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
