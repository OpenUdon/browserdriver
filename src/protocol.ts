import { randomUUID } from "node:crypto";

export const protocolVersion = "udon.browser-driver.v2";
export const protocolVersionV3 = "udon.browser-driver.v3";
export type ProtocolVersion = typeof protocolVersion | typeof protocolVersionV3;
export const maxMessageBytes = 1 << 20;

export const statuses = ["resolving", "logging_in", "awaiting_mfa", "refreshing", "executing"] as const;
export type Status = (typeof statuses)[number];

export const challengeKinds = [
  "push", "push_number_match", "totp", "sms_otp", "email_otp", "voice_otp", "passkey", "security_key",
] as const;
export type ChallengeKind = (typeof challengeKinds)[number];

export const failureCodes = [
  "mfa_timeout", "mfa_denied", "credentials_invalid", "session_expired", "driver_error",
  "unsupported_challenge", "captcha_required", "origin_rejected", "ambiguous_locator", "invalid_response",
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
  version: "udon.browser-driver.v1" | "udon.browser-driver.v2";
  profile?: "uws.browser.1.5" | "uws.browser.1.6" | "uws.browser.1.7";
  operationId: string;
  sourceDigest: string;
  actionName: string;
  allowedOrigins: string[];
  parameters: Record<string, unknown>;
  action: BrowserAction;
  contexts?: Record<string, ContextSpec>;
}

export interface BrowserAction {
  sequence: BrowserStep[];
  outputs?: Record<string, BrowserOutput>;
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
  version: ProtocolVersion;
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
  version: ProtocolVersion;
  type: "action";
  requestId: string;
  operationId: string;
  session: string;
  action: ActionRequest;
}

export interface ChallengeResponseMessage {
  version: ProtocolVersion;
  type: "challenge_response";
  requestId: string;
  challengeId: string;
  decision: "approve" | "deny" | "provide";
  value?: string;
}

export type InputMessage = AuthenticateMessage | ActionMessage | ChallengeResponseMessage | {
  version: ProtocolVersion;
  type: "close";
  requestId: string;
};

export function parseInput(line: string): InputMessage {
  if (Buffer.byteLength(line) > maxMessageBytes) throw new DriverFailure("invalid_response");
  let value: unknown;
  try { value = JSON.parse(line); } catch { throw new DriverFailure("invalid_response"); }
  if (!isRecord(value) || (value.version !== protocolVersion && value.version !== protocolVersionV3) || typeof value.type !== "string" || typeof value.requestId !== "string") {
    throw new DriverFailure("invalid_response");
  }
  if (value.version === protocolVersionV3) validateV3Envelope(value);
  return value as unknown as InputMessage;
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
