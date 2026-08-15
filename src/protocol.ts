import { randomUUID } from "node:crypto";

export const protocolVersion = "udon.browser-driver.v2";
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
  profile: "uws.browser-authentication.1.0";
  info: {
    title: string;
    applicationOrigins: string[];
    authenticationOrigins: string[];
  };
  credentialSlots: Record<string, { kind: "identifier" | "password" | "totp_seed" }>;
  flows: Record<string, AuthenticationFlow>;
}

export interface AuthenticationFlow {
  sequence: AuthenticationStep[];
  effects: string[];
  success: { origin: string; locator: LocatorSpec };
}

export type AuthenticationStep =
  | { navigate: string }
  | { type_credential: { locator: LocatorSpec; slot: string } }
  | { click: { locator: LocatorSpec } }
  | { challenge: { kind: ChallengeKind; locator?: LocatorSpec; slot?: string } }
  | { wait_for: { locator: LocatorSpec } };

export interface ActionRequest {
  version: string;
  operationId: string;
  sourceDigest: string;
  actionName: string;
  allowedOrigins: string[];
  parameters: Record<string, unknown>;
  action: BrowserAction;
}

export interface BrowserAction {
  sequence: BrowserStep[];
  outputs?: Record<string, BrowserOutput>;
}

export type BrowserStep =
  | { navigate: string }
  | { click: { locator: LocatorSpec; wait_for?: BrowserWait } }
  | { type_text: { locator: LocatorSpec; value: string; wait_for?: BrowserWait } }
  | { check_radio: { locator: LocatorSpec; wait_for?: BrowserWait } }
  | { uncheck: { locator: LocatorSpec; wait_for?: BrowserWait } }
  | { select_option: { locator: LocatorSpec; value: string; wait_for?: BrowserWait } }
  | { wait_for: BrowserWait };

export type BrowserWait = { locator: LocatorSpec } | { navigation: "load" | "domcontentloaded" | "network_idle" };

export interface BrowserOutput {
  type: string;
  source: "a11y" | "jsonld" | "microdata" | "css";
  locator?: LocatorSpec;
  selector?: string;
  presence?: boolean;
  property?: string;
  attribute?: string;
}

export interface AuthenticateMessage {
  version: typeof protocolVersion;
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
  version: typeof protocolVersion;
  type: "action";
  requestId: string;
  operationId: string;
  session: string;
  action: ActionRequest;
}

export interface ChallengeResponseMessage {
  version: typeof protocolVersion;
  type: "challenge_response";
  requestId: string;
  challengeId: string;
  decision: "approve" | "deny" | "provide";
  value?: string;
}

export type InputMessage = AuthenticateMessage | ActionMessage | ChallengeResponseMessage | {
  version: typeof protocolVersion;
  type: "close";
  requestId: string;
};

export function parseInput(line: string): InputMessage {
  if (Buffer.byteLength(line) > maxMessageBytes) throw new DriverFailure("invalid_response");
  let value: unknown;
  try { value = JSON.parse(line); } catch { throw new DriverFailure("invalid_response"); }
  if (!isRecord(value) || value.version !== protocolVersion || typeof value.type !== "string" || typeof value.requestId !== "string") {
    throw new DriverFailure("invalid_response");
  }
  return value as unknown as InputMessage;
}

export function status(requestId: string, value: Status): object {
  return { version: protocolVersion, type: "status", requestId, status: value };
}

export function challenge(requestId: string, kind: ChallengeKind, number?: string): { id: string; message: object } {
  const id = randomUUID();
  return {
    id,
    message: { version: protocolVersion, type: "challenge", requestId, challengeId: id, kind, ...(number ? { number } : {}) },
  };
}

export function success(requestId: string, response?: object): object {
  return { version: protocolVersion, type: "result", requestId, result: "success", ...(response ? { response } : {}) };
}

export function failure(requestId: string, code: FailureCode): object {
  return { version: protocolVersion, type: "result", requestId, result: "failure", failureCode: code };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
