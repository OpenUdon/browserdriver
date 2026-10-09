import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { authenticationRequestSHA256, maxSessionCandidateBytes, maxSessionMaxAgeSeconds, maxSessionSavePlanBytes } from "../src/session-save.js";
import { parseInput, type AuthenticateMessage } from "../src/protocol.js";

test("M16 preserves exact frozen M51 session-save input and independent complete-request golden", async () => {
  const input = await readFile("fixtures/m16-session-save-v1/session-save-contract.json");
  assert.equal(createHash("sha256").update(input).digest("hex"), "7f829101443fb5b8404135f453fa0406d5b09e9d52a61b3340b9c918b32c873f");
  const contract = JSON.parse(input.toString("utf8"));
  assert.equal(contract.state, "frozen-reviewed");
  assert.equal(contract.constructor, "sessionSavePlan + sessionCandidateStore; PersistentBrowserDriverOptions.sessionSave={plan,planSHA256,candidates}");
  const golden = JSON.parse(await readFile("fixtures/m16-session-save-v1/authentication-request-golden.json", "utf8"));
  const auth = parseInput(JSON.stringify(golden.request)) as AuthenticateMessage;
  assert.equal(auth.type, "authenticate");
  assert.equal(authenticationRequestSHA256(auth), golden.sha256);
  assert.equal(createHash("sha256").update(Buffer.from(golden.canonicalHex, "hex")).digest("hex"), golden.sha256);
  assert.equal(authenticationRequestSHA256({ ...auth, requestId: "other" }), golden.sha256);
  assert.notEqual(authenticationRequestSHA256({ ...auth, allowedOrigins: [...auth.allowedOrigins].reverse().concat("https://second.invalid") }), golden.sha256);
  assert.equal(maxSessionSavePlanBytes, 256 << 10); assert.equal(maxSessionCandidateBytes, 1 << 20);
  assert.equal(maxSessionMaxAgeSeconds, 2_592_000);
});
