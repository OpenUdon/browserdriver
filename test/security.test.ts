import assert from "node:assert/strict";
import test from "node:test";
import { DriverFailure } from "../src/protocol.js";
import { assertAllowedURL, credentialValue, exactOrigin, totp } from "../src/security.js";

test("exact origin rejects URL-prefix confusion", () => {
  assert.equal(exactOrigin("https://example.test/path"), "https://example.test");
  assert.throws(() => assertAllowedURL("https://example.test.evil.invalid/", new Set(["https://example.test"])), DriverFailure);
});

test("credential lookup accepts only environment names and never returns missing values", () => {
  process.env.BROWSERDRIVER_TEST_CREDENTIAL = "private-value";
  assert.equal(credentialValue("BROWSERDRIVER_TEST_CREDENTIAL"), "private-value");
  delete process.env.BROWSERDRIVER_TEST_CREDENTIAL;
  assert.throws(() => credentialValue("BROWSERDRIVER_TEST_CREDENTIAL"), DriverFailure);
  assert.throws(() => credentialValue("NAME=value"), DriverFailure);
});

test("TOTP matches the RFC 6238 SHA-1 test vector truncation", () => {
  // Base32 for the RFC test secret "12345678901234567890".
  assert.equal(totp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59_000), "287082");
});
