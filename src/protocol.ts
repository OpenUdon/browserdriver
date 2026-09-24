import { randomUUID } from "node:crypto";

export const protocolVersion = "udon.browser-driver.v2";
export const protocolVersionV3 = "udon.browser-driver.v3";
export const protocolVersionV4 = "udon.browser-driver.v4";
export const protocolVersionV5 = "udon.browser-driver.v5";
export const protocolVersionV6 = "udon.browser-driver.v6";
// V7 is verification-only; registration continues to use v6.
export const protocolVersionV7 = "udon.browser-driver.v7";
export const protocolVersionV8 = "udon.browser-driver.v8";
export const protocolVersionV9 = "udon.browser-driver.v9";
// V10 is the additive Browser 1.8/1.9 persistent action contract.
export const protocolVersionV10 = "udon.browser-driver.v10";
export type RegistrationProtocolVersion = typeof protocolVersionV4 | typeof protocolVersionV5 | typeof protocolVersionV6;
export type LegacyProtocolVersion = typeof protocolVersion | typeof protocolVersionV3 | typeof protocolVersionV10;
export type ProtocolVersion = LegacyProtocolVersion | RegistrationProtocolVersion | typeof protocolVersionV7 | typeof protocolVersionV8 | typeof protocolVersionV9;
export const maxMessageBytes = 1 << 20;

export const statuses = [
  "resolving", "logging_in", "awaiting_mfa", "refreshing", "executing", "registering",
  "awaiting_registration_checkpoint", "awaiting_submit_approval",
] as const;
export type Status = (typeof statuses)[number];

export const challengeKinds = [
  "push", "push_number_match", "totp", "sms_otp", "email_otp", "voice_otp", "passkey", "security_key",
] as const;
export type ChallengeKind = (typeof challengeKinds)[number];

export const failureCodes = [
  "mfa_timeout", "mfa_denied", "credentials_invalid", "session_expired", "driver_error",
  "unsupported_challenge", "captcha_required", "origin_rejected", "ambiguous_locator", "invalid_context", "invalid_response",
  "registration_indeterminate", "registration_checkpoint_timeout", "registration_checkpoint_denied",
  "verification_unsupported", "verification_not_ready", "verification_expired", "verification_failed", "verification_timeout", "verification_policy", "verification_budget",
] as const;
export type FailureCode = (typeof failureCodes)[number];

export class DriverFailure extends Error {
  constructor(readonly code: FailureCode) {
    super(code);
    this.name = "DriverFailure";
  }
}

export interface LocatorSpec {
  role: string;
  name?: string;
  text?: string;
  value?: string;
}

export interface AuthenticationProfile {
  profile: "uws.browser-authentication.1.0" | "uws.browser-authentication.1.1";
  info: {
    title: string;
    applicationOrigins: string[];
    authenticationOrigins: string[];
  };
  credentialSlots: Record<string, { kind: "identifier" | "password" | "totp_seed" }>;
  flows: Record<string, AuthenticationFlow>;
  contexts?: Record<string, ContextSpec>;
}

export const registrationCheckpointKinds = [
  "captcha", "email_verification", "mfa", "consent", "other_control",
] as const;
export type RegistrationCheckpointKind = (typeof registrationCheckpointKinds)[number];

export interface RegistrationProfile {
  profile: "uws.browser-registration.1.0" | "uws.browser-registration.1.1" | "uws.browser-registration.1.2";
  info: {
    title: string;
    provider?: string;
    applicationOrigins: string[];
    registrationOrigins: string[];
  };
  observationKind: "accessibility_snapshot" | "dom_text" | "screenshot_ocr" | "other";
  evidence: { learnedAt: string; source?: string };
  confidence: "low" | "medium" | "high";
  expiresAfter: string;
  verification: { lastVerifiedAt: string; uiStabilityScore?: number };
  credentialSlots: Record<string, { kind: "identifier" | "password" }>;
  flows: Record<string, RegistrationFlow>;
  inputSlots?: Record<string, RegistrationInputSlot>;
  discovery?: { coverage: "partial" | "owner_reviewed"; entryPoints: string[]; limitations: string[] };
}

export type RegistrationScalar = string | number | boolean | null;
export interface RegistrationInputSlot {
  type: "string" | "boolean" | "integer" | "number";
  label: string;
  required?: boolean;
  requiredWhen?: { slot: string; equals: Exclude<RegistrationScalar, null> };
  enum?: Exclude<RegistrationScalar, null>[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
}

// Runtime-private. Neither this document nor its digest belongs in reports.
export interface RegistrationInput {
  version: "uws.browser-registration-input.1.0";
  profileSha256: string;
  registrationType: string;
  revision: number;
  values: Record<string, RegistrationScalar>;
}

export interface VerificationDescriptor {
  provider: "turnstile" | "recaptcha_v2" | "hcaptcha";
  activation: "before_approval" | "approved_submit";
  widgetBinding: "single_in_submit_form";
  submissionURL: string;
  dependencies: { policy: "turnstile.v1" | "recaptcha_v2.v1" | "hcaptcha.v1"; maxRequests: number; maxResponseBytes: number; timeoutMs: number };
}
export interface RegistrationFlow {
  humanVerification?: VerificationDescriptor;
  description?: string;
  sequence: RegistrationStep[];
  effects: Array<"creates_account" | "sends_verification" | "requires_human_verification">;
  confirmationPolicy: { required: true; prompt?: string };
  success: { origin: string; locator: LocatorSpec; path?: string };
}

export type RegistrationStep =
  | { navigate: string }
  | { type_credential: { locator: LocatorSpec; slot: string } }
  | { click: { locator: LocatorSpec } }
  | { submit: { locator: LocatorSpec } }
  | { human_checkpoint: { kind: RegistrationCheckpointKind; locator?: LocatorSpec } }
  | { input_checkpoint: { id: string; slots: string[] } }
  | { fill_input: { locator: LocatorSpec; slot: string; control: "fill" | "check" | "select" } }
  | { wait_for: { locator: LocatorSpec } };

export interface RegistrationCallControls {
  verification?: "reviewed_flow";
  approval: string;
  duplicatePrevention: "operator_attestation";
  onDuplicate: "fail";
  ambiguousOutcome: "stop_without_retry";
  cleanupDisposition: "delete_separately" | "retain_dedicated_test_identity";
}

export interface ContextSpec {
  kind: "popup" | "frame";
  parent: string;
  origin: string;
  path?: string;
  name?: string;
}

export interface AuthenticationFlow {
  sequence: AuthenticationStep[];
  effects: string[];
  success: { origin: string; locator: LocatorSpec; context?: string; path?: string };
}

export interface ContextualLocator { locator: LocatorSpec; context?: string }
export interface ContextualClick extends ContextualLocator { opensContext?: string }
export interface ContextualNavigate { url: string; context?: string }

export type AuthenticationStep =
  | { navigate: string | ContextualNavigate }
  | { type_credential: ContextualLocator & { slot: string } }
  | { click: ContextualClick }
  | { challenge: { kind: ChallengeKind; locator?: LocatorSpec; slot?: string; context?: string } }
  | { wait_for: ContextualLocator };

export interface ActionRequest {
  version: "udon.browser-driver.v1" | "udon.browser-driver.v2" | "udon.browser-driver.v3";
  profile?: "uws.browser.1.5" | "uws.browser.1.6" | "uws.browser.1.7" | "uws.browser.1.8" | "uws.browser.1.9";
  operationId: string;
  sourceDigest: string;
  actionName: string;
  allowedOrigins: string[];
  parameters: Record<string, unknown>;
  action: BrowserAction;
  contexts?: Record<string, ContextSpec>;
}

export interface BrowserAction {
  parameters?: Record<string, unknown>;
  sequence: BrowserStep[];
  outputs?: Record<string, BrowserOutput>;
  confirmationPolicy?: { required: boolean; prompt?: string };
}

export type BrowserStep =
  | { navigate: string | ContextualNavigate }
  | { click: ContextualClick & { wait_for?: BrowserWait } }
  | { type_text: ContextualLocator & { value: string; wait_for?: BrowserWait } }
  | { check_radio: ContextualLocator & { wait_for?: BrowserWait } }
  | { uncheck: ContextualLocator & { wait_for?: BrowserWait } }
  | { select_option: ContextualLocator & { value: string; wait_for?: BrowserWait } }
  | { wait_for: BrowserWait };

export type BrowserWait = LocatorSpec | ContextualLocator | { navigation: "load" | "domcontentloaded" | "network_idle" };

export interface BrowserOutput {
  type: string;
  source: "a11y" | "jsonld" | "microdata" | "css";
  locator?: LocatorSpec;
  selector?: string;
  presence?: boolean;
  property?: string;
  attribute?: string;
  context?: string;
}

export interface AuthenticateMessage {
  version: LegacyProtocolVersion;
  type: "authenticate";
  requestId: string;
  operationId: string;
  sourceDigest: string;
  profile: AuthenticationProfile;
  flow: string;
  session: string;
  allowedOrigins: string[];
  credentialBindings: Record<string, string>;
  credentialEnvironment: Record<string, string>;
  sessionBinding?: string;
}

export interface ActionMessage {
  version: LegacyProtocolVersion;
  type: "action";
  requestId: string;
  operationId: string;
  session: string;
  action: ActionRequest;
}

export interface ChallengeResponseMessage {
  version: LegacyProtocolVersion;
  type: "challenge_response";
  requestId: string;
  challengeId: string;
  decision: "approve" | "deny" | "provide";
  value?: string;
}

export interface VerifyMessage {
  version: typeof protocolVersionV6 | typeof protocolVersionV7 | typeof protocolVersionV8 | typeof protocolVersionV9;
  type: "verify";
  requestId: string;
  sourceDigest: string;
  profile: RegistrationProfile;
  flow: string;
  allowedOrigins: string[];
  deadline: string;
}

export interface RegisterMessage {
  deadline?: string;
  version: RegistrationProtocolVersion;
  type: "register";
  requestId: string;
  operationId: string;
  sourceDigest: string;
  profile: RegistrationProfile;
  flow: string;
  allowedOrigins: string[];
  credentialBindings: Record<string, string>;
  credentialEnvironment?: Record<string, string>;
  input?: RegistrationInput;
  controls: RegistrationCallControls;
}

export interface RegistrationCheckpointResponseMessage {
  version: RegistrationProtocolVersion;
  type: "registration_checkpoint_response";
  requestId: string;
  checkpointId: string;
  decision: "continue" | "deny";
  inputRevision?: number;
  inputSha256?: string;
}

export interface RegistrationInputResponseMessage {
  version: typeof protocolVersionV5 | typeof protocolVersionV6;
  type: "registration_input_response";
  requestId: string;
  checkpointId: string;
  decision: "apply" | "stop";
  input?: RegistrationInput;
}

export type InputMessage = VerifyMessage | AuthenticateMessage | ActionMessage | ChallengeResponseMessage | RegisterMessage | RegistrationCheckpointResponseMessage | RegistrationInputResponseMessage | {
  version: ProtocolVersion;
  type: "close";
  requestId: string;
};

export function parseInput(line: string): InputMessage {
  if (Buffer.byteLength(line) > maxMessageBytes) throw new DriverFailure("invalid_response");
  let value: unknown;
  try {
    value = JSON.parse(line);
    // Node 24 exposes the original numeric token to the reviver. V10 alone
    // preserves wide Browser 1.8 integers before binary64 rounding.
    if (isRecord(value) && value.version === protocolVersionV10) {
      value = JSON.parse(line, (_key: string, parsed: unknown, context?: { source?: string }) => {
        const source = context?.source;
        if (typeof parsed === "number" && source && /^-?(?:0|[1-9][0-9]*)$/u.test(source) && !Number.isSafeInteger(parsed)) {
          if (source.length > 20) throw new DriverFailure("invalid_response");
          return BigInt(source);
        }
        return parsed;
      });
    }
  } catch { throw new DriverFailure("invalid_response"); }
  if (!isRecord(value) || (value.version !== protocolVersion && value.version !== protocolVersionV3 && value.version !== protocolVersionV4 && value.version !== protocolVersionV5 && value.version !== protocolVersionV6 && value.version !== protocolVersionV7 && value.version !== protocolVersionV8 && value.version !== protocolVersionV9 && value.version !== protocolVersionV10) || typeof value.type !== "string" || typeof value.requestId !== "string") {
    throw new DriverFailure("invalid_response");
  }
  if (value.version === protocolVersionV3) validateV3Envelope(value);
  if (value.version === protocolVersionV10) validateV3Envelope(value);
  if (value.version === protocolVersionV4) validateV4Envelope(value);
  if (value.version === protocolVersionV5 || value.version === protocolVersionV6) validateV5Envelope(value);
  if (value.version === protocolVersionV7 || value.version === protocolVersionV8 || value.version === protocolVersionV9) {
    const fields = ["version", "type", "requestId", "sourceDigest", "profile", "flow", "allowedOrigins", "deadline"];
    if (value.type !== "verify" || Object.keys(value).length !== fields.length || Object.keys(value).some(field => !fields.includes(field)) ||
        typeof value.sourceDigest !== "string" || !isRecord(value.profile) || typeof value.flow !== "string" ||
        !Array.isArray(value.allowedOrigins) || value.allowedOrigins.some(origin => typeof origin !== "string") || typeof value.deadline !== "string") throw new DriverFailure("invalid_response");
  }
  return value as unknown as InputMessage;
}

export function registrationCheckpoint(
  requestId: string,
  kind: RegistrationCheckpointKind | "submit_approval",
  version: RegistrationProtocolVersion = protocolVersionV4,
  binding?: { inputRevision: number; inputSha256: string },
): { id: string; message: object } {
  const id = randomUUID();
  return {
    id,
    message: { version, type: "registration_checkpoint", requestId, checkpointId: id, kind, ...binding },
  };
}

export function status(requestId: string, value: Status, version: ProtocolVersion = protocolVersion): object {
  return { version, type: "status", requestId, status: value };
}

export function challenge(requestId: string, kind: ChallengeKind, number?: string, version: ProtocolVersion = protocolVersion): { id: string; message: object } {
  const id = randomUUID();
  return {
    id,
    message: { version, type: "challenge", requestId, challengeId: id, kind, ...(number ? { number } : {}) },
  };
}

export function success(requestId: string, response?: object, version: ProtocolVersion = protocolVersion): object {
  return { version, type: "result", requestId, result: "success", ...(response ? { response } : {}) };
}

export function failure(requestId: string, code: FailureCode, version: ProtocolVersion = protocolVersion): object {
  return { version, type: "result", requestId, result: "failure", failureCode: code };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateV3Envelope(value: Record<string, unknown>): void {
  const common = ["version", "type", "requestId"];
  const fields: Record<string, string[]> = {
    authenticate: [...common, "operationId", "sourceDigest", "profile", "flow", "session", "allowedOrigins", "credentialBindings", "credentialEnvironment", "sessionBinding"],
    action: [...common, "operationId", "session", "action"],
    challenge_response: [...common, "challengeId", "decision", "value"],
    close: common,
  };
  const allowed = fields[value.type as string];
  if (!allowed || Object.keys(value).some((field) => !allowed.includes(field))) throw new DriverFailure("invalid_response");
}

function validateV4Envelope(value: Record<string, unknown>): void {
  const common = ["version", "type", "requestId"];
  const fields: Record<string, string[]> = {
    register: [
      ...common, "operationId", "sourceDigest", "profile", "flow", "allowedOrigins",
      "credentialBindings", "credentialEnvironment", "controls",
    ],
    registration_checkpoint_response: [...common, "checkpointId", "decision"],
    close: common,
  };
  const allowed = fields[value.type as string];
  if (!allowed || Object.keys(value).some((field) => !allowed.includes(field))) throw new DriverFailure("invalid_response");
}

function validateV5Envelope(value: Record<string, unknown>): void {
  const common = ["version", "type", "requestId"];
  const fields: Record<string, string[]> = {
    register: [...common, "operationId", "sourceDigest", "profile", "flow", "allowedOrigins", "credentialBindings", "controls", "input", ...(value.version === protocolVersionV6 ? ["deadline"] : [])],
    registration_checkpoint_response: [...common, "checkpointId", "decision", "inputRevision", "inputSha256"],
    registration_input_response: [...common, "checkpointId", "decision", "input"],
    close: common,
  };
  if (value.version === protocolVersionV6) fields.verify = [...common, "sourceDigest", "profile", "flow", "allowedOrigins", "deadline"];
  const allowed = fields[value.type as string];
  if (!allowed || Object.keys(value).some((field) => !allowed.includes(field))) throw new DriverFailure("invalid_response");
}
