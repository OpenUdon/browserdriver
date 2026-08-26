import type { BrowserContext, Route } from "playwright";
import {
  DriverFailure, registrationCheckpointKinds, type LocatorSpec, type RegisterMessage,
  type RegistrationFlow, type RegistrationStep,
} from "./protocol.js";
import { exactOrigin } from "./security.js";

const identifierPattern = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/u;
const requestIDPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const environmentPattern = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const cleanPathPattern = /^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/u;
const durationPattern = /^P(?=.+)(?:\d+Y)?(?:\d+M)?(?:\d+W)?(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?(?:\d+S)?)?$/u;
const locatorRoles = new Set([
  "button", "link", "textbox", "checkbox", "radio", "dialog", "status", "alert", "heading", "img", "list",
  "listitem", "combobox", "option", "menu", "menuitem", "tab", "tabpanel", "table", "row", "cell", "region",
  "navigation", "article", "form", "search", "switch", "group",
]);
const sensitiveQueryKeyPattern = /(?:^|[_-])(?:auth|authorization|bearer|code|credential|email|jwt|key|login|otp|pass|password|secret|session|signature|sig|token|user|username)(?:$|[_-])/iu;
const secretValuePattern = /(?:bearer\s+|eyJ[A-Za-z0-9_-]{8,}\.|-----BEGIN |sk-[A-Za-z0-9_-]{8,}|[A-Za-z0-9+/]{24,}={0,2}$)/u;

export function validateRegistrationMessage(request: RegisterMessage): RegistrationFlow {
  assertClosed(request as unknown as Record<string, unknown>, [
    "version", "type", "requestId", "operationId", "sourceDigest", "profile", "flow", "allowedOrigins",
    "credentialBindings", "credentialEnvironment", "controls",
  ]);
  if (!requestIDPattern.test(request.requestId) || !identifierPattern.test(request.operationId) ||
      !digestPattern.test(request.sourceDigest) || !identifierPattern.test(request.flow)) invalid();
  const allowed = validateOrigins(request.allowedOrigins);
  validateProfile(request.profile as unknown as Record<string, unknown>, allowed);
  if (!Object.hasOwn(request.profile.flows, request.flow)) invalid();
  const flow = request.profile.flows[request.flow];
  if (!flow) invalid();
  validateBindings(request, flow);
  validateControls(request.controls as unknown as Record<string, unknown>);
  return flow;
}

function validateProfile(value: Record<string, unknown>, allowed: ReadonlySet<string>): void {
  assertClosed(value, [
    "profile", "info", "observationKind", "evidence", "confidence", "expiresAfter", "verification", "credentialSlots", "flows",
  ], ["profile", "info", "observationKind", "evidence", "confidence", "expiresAfter", "verification", "credentialSlots", "flows"]);
  if (value.profile !== "uws.browser-registration.1.0" ||
      !["accessibility_snapshot", "dom_text", "screenshot_ocr", "other"].includes(String(value.observationKind)) ||
      !["low", "medium", "high"].includes(String(value.confidence)) ||
      typeof value.expiresAfter !== "string" || !durationPattern.test(value.expiresAfter) || !/\d+(?:Y|M|W|D|H|S)/u.test(value.expiresAfter)) invalid();

  const info = record(value.info);
  assertClosed(info, ["title", "provider", "applicationOrigins", "registrationOrigins"], ["title", "applicationOrigins", "registrationOrigins"]);
  boundedString(info.title, 1, 256);
  if (info.provider !== undefined) boundedString(info.provider, 1, 256);
  const profileOrigins = [...validateOrigins(info.applicationOrigins), ...validateOrigins(info.registrationOrigins)];
  if (profileOrigins.some((origin) => !allowed.has(origin))) originRejected();

  const evidence = record(value.evidence);
  assertClosed(evidence, ["learnedAt", "source"], ["learnedAt"]);
  dateTime(evidence.learnedAt);
  if (evidence.source !== undefined) boundedString(evidence.source, 1, 256);
  const verification = record(value.verification);
  assertClosed(verification, ["lastVerifiedAt", "uiStabilityScore"], ["lastVerifiedAt"]);
  dateTime(verification.lastVerifiedAt);
  if (verification.uiStabilityScore !== undefined &&
      (typeof verification.uiStabilityScore !== "number" || !Number.isFinite(verification.uiStabilityScore) || verification.uiStabilityScore < 0 || verification.uiStabilityScore > 1)) invalid();

  const slots = boundedRecord(value.credentialSlots, 1, 64);
  for (const [name, raw] of Object.entries(slots)) {
    identifier(name);
    const slot = record(raw);
    assertClosed(slot, ["kind"], ["kind"]);
    if (slot.kind !== "identifier" && slot.kind !== "password") invalid();
  }
  const flows = boundedRecord(value.flows, 1, 32);
  for (const [name, raw] of Object.entries(flows)) {
    identifier(name);
    validateFlow(record(raw), slots, allowed);
  }
}

function validateFlow(value: Record<string, unknown>, slots: Record<string, unknown>, allowed: ReadonlySet<string>): void {
  assertClosed(value, ["description", "sequence", "effects", "confirmationPolicy", "success"], ["sequence", "effects", "confirmationPolicy", "success"]);
  if (value.description !== undefined) boundedString(value.description, 0, 1_024);
  if (!Array.isArray(value.sequence) || value.sequence.length < 1 || value.sequence.length > 256) invalid();
  let submits = 0;
  let checkpoints = 0;
  for (const raw of value.sequence) {
    const step = record(raw);
    if (Object.keys(step).length !== 1) invalid();
    validateStep(step as unknown as RegistrationStep, slots, allowed);
    if ("submit" in step) submits += 1;
    if ("human_checkpoint" in step) checkpoints += 1;
  }
  if (submits !== 1) invalid();
  if (!Array.isArray(value.effects) || value.effects.length < 1 || value.effects.length > 3 ||
      new Set(value.effects).size !== value.effects.length || !value.effects.includes("creates_account") ||
      value.effects.some((item) => !["creates_account", "sends_verification", "requires_human_verification"].includes(String(item)))) invalid();
  if (value.effects.includes("requires_human_verification") !== (checkpoints > 0)) invalid();
  const confirmation = record(value.confirmationPolicy);
  assertClosed(confirmation, ["required", "prompt"], ["required"]);
  if (confirmation.required !== true) invalid();
  if (confirmation.prompt !== undefined) boundedString(confirmation.prompt, 1, 512);
  const success = record(value.success);
  assertClosed(success, ["origin", "locator", "path"], ["origin", "locator"]);
  if (typeof success.origin !== "string" || exactDeclaredOrigin(success.origin) !== success.origin || !allowed.has(success.origin)) originRejected();
  validateLocator(record(success.locator));
  if (success.path !== undefined && (typeof success.path !== "string" || success.path.length > 2_048 || !cleanPathPattern.test(success.path))) invalid();
}

function validateStep(step: RegistrationStep, slots: Record<string, unknown>, allowed: ReadonlySet<string>): void {
  if ("navigate" in step) {
    assertRegistrationURL(step.navigate, allowed);
    return;
  }
  if ("type_credential" in step) {
    const value = record(step.type_credential);
    assertClosed(value, ["locator", "slot"], ["locator", "slot"]);
    validateLocator(record(value.locator));
    if (typeof value.slot !== "string" || !identifierPattern.test(value.slot) || !Object.hasOwn(slots, value.slot)) invalid();
    return;
  }
  const locatorStep = "click" in step ? step.click : "submit" in step ? step.submit : "wait_for" in step ? step.wait_for : undefined;
  if (locatorStep) {
    const value = record(locatorStep);
    assertClosed(value, ["locator"], ["locator"]);
    validateLocator(record(value.locator));
    return;
  }
  if ("human_checkpoint" in step) {
    const value = record(step.human_checkpoint);
    assertClosed(value, ["kind", "locator"], ["kind"]);
    if (!registrationCheckpointKinds.includes(value.kind as never)) invalid();
    if (value.locator !== undefined) validateLocator(record(value.locator));
    return;
  }
  invalid();
}

function validateBindings(request: RegisterMessage, flow: RegistrationFlow): void {
  const bindings = boundedRecord(request.credentialBindings, 1, 64);
  const environments = boundedRecord(request.credentialEnvironment, 1, 64);
  const used = new Set(flow.sequence.flatMap((step) => "type_credential" in step ? [step.type_credential.slot] : []));
  if (Object.keys(bindings).length !== used.size || [...used].some((slot) => !Object.hasOwn(bindings, slot))) invalid();
  for (const [slot, binding] of Object.entries(bindings)) {
    identifier(slot);
    if (!Object.hasOwn(request.profile.credentialSlots, slot) || typeof binding !== "string" || !identifierPattern.test(binding)) invalid();
  }
  const requiredBindings = new Set(Object.values(bindings) as string[]);
  if (Object.keys(environments).length !== requiredBindings.size || [...requiredBindings].some((binding) => !Object.hasOwn(environments, binding))) invalid();
  for (const [binding, environment] of Object.entries(environments)) {
    identifier(binding);
    if (!requiredBindings.has(binding) || typeof environment !== "string" || !environmentPattern.test(environment)) invalid();
  }
}

function validateControls(value: Record<string, unknown>): void {
  assertClosed(value, ["approval", "duplicatePrevention", "onDuplicate", "ambiguousOutcome", "cleanupDisposition"],
    ["approval", "duplicatePrevention", "onDuplicate", "ambiguousOutcome", "cleanupDisposition"]);
  if (typeof value.approval !== "string" || !identifierPattern.test(value.approval) ||
      value.duplicatePrevention !== "operator_attestation" || value.onDuplicate !== "fail" ||
      value.ambiguousOutcome !== "stop_without_retry" ||
      (value.cleanupDisposition !== "delete_separately" && value.cleanupDisposition !== "retain_dedicated_test_identity")) invalid();
}

export function assertRegistrationURL(raw: string, allowed: ReadonlySet<string>): void {
  boundedString(raw, 1, 2_048);
  let parsed: URL;
  try { parsed = new URL(raw); } catch { invalid(); }
  if (parsed.username || parsed.password || parsed.hash || /\{\{|\}\}/u.test(raw) || !allowed.has(parsed.origin)) originRejected();
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLoopback(parsed.hostname))) originRejected();
  const query = raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : "";
  if (!query) return;
  if (query.length > 2_048) invalid();
  const keys = new Set<string>();
  for (const item of query.split("&")) {
    if (!item || item.length > 512) invalid();
    const separator = item.indexOf("=");
    const encodedKey = separator < 0 ? item : item.slice(0, separator);
    const encodedValue = separator < 0 ? "" : item.slice(separator + 1);
    let key: string;
    let value: string;
    try {
      key = decodeURIComponent(encodedKey.replace(/\+/gu, " "));
      value = decodeURIComponent(encodedValue.replace(/\+/gu, " "));
    } catch { invalid(); }
    if (!/^[A-Za-z][A-Za-z0-9._~-]{0,127}$/u.test(key) || keys.has(key) || sensitiveQueryKeyPattern.test(key) ||
        value.length > 256 || /[\0\r\n]/u.test(value) || /\{\{|\}\}/u.test(value) || secretValuePattern.test(value)) invalid();
    keys.add(key);
  }
}

export class RegistrationGuard {
  private blocked: "origin" | "mutation" | undefined;
  private submitting = false;
  private posts = 0;

  constructor(private readonly context: Pick<BrowserContext, "route">, private readonly allowed: ReadonlySet<string>) {}

  async install(): Promise<void> {
    await this.context.route("**/*", async (route) => this.handle(route));
  }

  beginSubmit(): void {
    if (this.submitting || this.posts !== 0) invalid();
    this.submitting = true;
  }

  finishSubmit(): void {
    this.submitting = false;
    this.assertSafe();
    if (this.posts !== 1) invalid();
  }

  assertSafe(): void {
    if (this.blocked === "origin") originRejected();
    if (this.blocked === "mutation") invalid();
  }

  postCount(): number { return this.posts; }

  private async handle(route: Route): Promise<void> {
    const request = route.request();
    const method = request.method().toUpperCase();
    try {
      if (!this.allowed.has(exactOrigin(request.url()))) originRejected();
      if (request.isNavigationRequest()) assertRegistrationURL(request.url(), this.allowed);
    } catch (error) {
      this.blocked = error instanceof DriverFailure && error.code === "origin_rejected" ? "origin" : "mutation";
      await route.abort("blockedbyclient");
      return;
    }
    if (method === "GET" || method === "HEAD") {
      await route.continue();
      return;
    }
    if (method === "POST" && this.submitting && this.posts === 0) {
      this.posts += 1;
      await route.continue();
      return;
    }
    this.blocked = "mutation";
    await route.abort("blockedbyclient");
  }
}

function validateLocator(value: Record<string, unknown>): void {
  assertClosed(value, ["role", "name", "text", "value"], ["role"]);
  if (typeof value.role !== "string" || !locatorRoles.has(value.role)) invalid();
  for (const field of ["name", "text", "value"] as const) if (value[field] !== undefined) boundedString(value[field], 0, 512);
}

function validateOrigins(raw: unknown): Set<string> {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 32 || new Set(raw).size !== raw.length) originRejected();
  const result = new Set<string>();
  for (const value of raw) {
    if (typeof value !== "string" || value.length > 2_048 || exactDeclaredOrigin(value) !== value) originRejected();
    result.add(value);
  }
  return result;
}

function exactDeclaredOrigin(raw: string): string {
  let parsed: URL;
  try { parsed = new URL(raw); } catch { originRejected(); }
  if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash ||
      (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLoopback(parsed.hostname)))) originRejected();
  return exactOrigin(raw);
}

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function assertClosed(value: Record<string, unknown>, allowed: string[], required: string[] = allowed): void {
  if (Object.keys(value).some((key) => !allowed.includes(key)) || required.some((key) => !(key in value))) invalid();
}

function boundedRecord(value: unknown, min: number, max: number): Record<string, unknown> {
  const result = record(value);
  const count = Object.keys(result).length;
  if (count < min || count > max) invalid();
  return result;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}

function boundedString(value: unknown, min: number, max: number): asserts value is string {
  if (typeof value !== "string" || value.length < min || value.length > max || /[\0\r\n]/u.test(value)) invalid();
}

function identifier(value: string): void { if (!identifierPattern.test(value)) invalid(); }
function dateTime(value: unknown): void { if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) invalid(); }
function invalid(): never { throw new DriverFailure("invalid_response"); }
function originRejected(): never { throw new DriverFailure("origin_rejected"); }
