import assert from "node:assert/strict";
import test from "node:test";
import {
  DriverFailure, failure, parseInput, protocolVersion, protocolVersionV3, protocolVersionV4, success,
} from "../src/protocol.js";

test("protocol accepts one versioned close envelope", () => {
  const value = parseInput(JSON.stringify({ version: protocolVersion, type: "close", requestId: "one" }));
  assert.equal(value.type, "close");
});

test("protocol accepts v3 without changing v2 response defaults", () => {
  const value = parseInput(JSON.stringify({ version: protocolVersionV3, type: "close", requestId: "three" }));
  assert.equal(value.version, protocolVersionV3);
  assert.deepEqual(success("three", undefined, protocolVersionV3), {
    version: protocolVersionV3, type: "result", requestId: "three", result: "success",
  });
  assert.deepEqual(success("two"), {
    version: protocolVersion, type: "result", requestId: "two", result: "success",
  });
});

test("v3 protocol rejects unknown envelope fields while v2 remains compatible", () => {
  assert.throws(() => parseInput(JSON.stringify({
    version: protocolVersionV3, type: "close", requestId: "three", storageState: { cookies: [] },
  })), DriverFailure);
  assert.equal(parseInput(JSON.stringify({
    version: protocolVersion, type: "close", requestId: "two", legacyIgnored: true,
  })).type, "close");
});

test("v4 accepts only registration, checkpoint response, and close envelopes", () => {
  assert.equal(parseInput(JSON.stringify({
    version: protocolVersionV4, type: "register", requestId: "registration",
    operationId: "register", sourceDigest: `sha256:${"a".repeat(64)}`, profile: {}, flow: "create",
    allowedOrigins: [], credentialBindings: {}, credentialEnvironment: {}, controls: {},
  })).type, "register");
  assert.equal(parseInput(JSON.stringify({
    version: protocolVersionV4, type: "registration_checkpoint_response", requestId: "registration",
    checkpointId: "checkpoint", decision: "continue",
  })).type, "registration_checkpoint_response");
  assert.throws(() => parseInput(JSON.stringify({
    version: protocolVersionV4, type: "authenticate", requestId: "registration",
  })), DriverFailure);
  assert.throws(() => parseInput(JSON.stringify({
    version: protocolVersionV4, type: "registration_checkpoint_response", requestId: "registration",
    checkpointId: "checkpoint", decision: "continue", value: "forbidden",
  })), DriverFailure);
});

test("protocol rejects malformed and wrong-version envelopes", () => {
  assert.throws(() => parseInput("not json"), DriverFailure);
  assert.throws(() => parseInput(JSON.stringify({ version: "v1", type: "close", requestId: "one" })), DriverFailure);
});

test("failure messages carry only a closed code", () => {
  const value = failure("request", "credentials_invalid");
  assert.deepEqual(value, {
    version: protocolVersion, type: "result", requestId: "request", result: "failure", failureCode: "credentials_invalid",
  });
  assert.equal(JSON.stringify(value).includes("secret"), false);
  assert.deepEqual(failure("context", "invalid_context", protocolVersionV3), {
    version: protocolVersionV3, type: "result", requestId: "context", result: "failure", failureCode: "invalid_context",
  });
});
