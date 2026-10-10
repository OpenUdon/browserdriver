import { createHash } from "node:crypto";
import type { AuthenticateMessage } from "../src/protocol.js";
import { authenticationRequestSHA256 } from "../src/session-save.js";

export const fixtureOrigin = "http://127.0.0.1:46061";
export const fixtureBinding = "m16-live-disposable-binding";
export function fixtureAuthentication(phase: "start" | "reuse"): AuthenticateMessage {
  return { version: "udon.browser-driver.v3", type: "authenticate", requestId: phase,
    operationId: `fixture-${phase}`, sourceDigest: `sha256:${"a".repeat(64)}`, flow: "login", session: "member",
    ...(phase === "reuse" ? { sessionBinding: fixtureBinding } : {}), allowedOrigins: [fixtureOrigin], credentialBindings: {}, credentialEnvironment: {},
    profile: { profile: "uws.browser-authentication.1.1", info: { title: "M16 disposable fixture", applicationOrigins: [fixtureOrigin], authenticationOrigins: [] },
      credentialSlots: {}, flows: { login: { effects: ["establishes_session"], sequence: [{ navigate: `${fixtureOrigin}/${phase}` }],
        success: { origin: fixtureOrigin, path: `/${phase}`, locator: { role: "heading", name: "Member" } } } } } };
}

export function fixtureSavePlan(phase: "start" | "reuse", auth: AuthenticateMessage, now: number) {
  const createdAt = new Date(now - 86_400_000).toISOString(), expiresAt = new Date(now - 86_400_000 + 604_800_000).toISOString();
  return { version: "browserdriver.session-save-plan.v1", launchNonce: `fixture-${phase}`, admittedDeadline: new Date(now + 90_000).toISOString(),
    permissions: [{ permissionId: `fixture-${phase}`, authenticate: { version: auth.version, operationId: auth.operationId, sourceDigest: auth.sourceDigest,
      flow: auth.flow, session: auth.session, sessionBinding: auth.sessionBinding ?? null }, authenticationRequestSHA256: authenticationRequestSHA256(auth),
      saveBinding: fixtureBinding, bindingSHA256: createHash("sha256").update(fixtureBinding).digest("hex"), generation: 3, createdAt, expiresAt }] };
}
