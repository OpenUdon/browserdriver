import assert from "node:assert/strict";
import test from "node:test";
import { DriverFailure, failure, parseInput, protocolVersion } from "../src/protocol.js";

test("protocol accepts one versioned close envelope", () => {
  const value = parseInput(JSON.stringify({ version: protocolVersion, type: "close", requestId: "one" }));
  assert.equal(value.type, "close");
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
});
