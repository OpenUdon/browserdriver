import assert from "node:assert/strict";
import test from "node:test";
import { chromium, type LaunchOptions } from "playwright";
import { PersistentBrowserDriver } from "../src/driver.js";
import { verificationRequest } from "./verification-fixture.js";
import { runProviderFixture } from "./provider-fixture.js";
import { runFixturePresentationDiagnostic } from "./fixture-presentation.js";

test("driver and both fixture entries require sandboxing and do not fall back after launch rejection", async t => {
  const canary = "private-sandbox-launch-rejection";
  const attempts: Array<{headless?: boolean; chromiumSandbox?: boolean}> = [];
  t.mock.method(chromium, "launch", async (options?: LaunchOptions) => {
    attempts.push(options!);
    assert.equal(options?.chromiumSandbox, true);
    throw Error(canary);
  });
  const messages: unknown[] = [];
  const driver = new PersistentBrowserDriver({next: async () => ({done: true, value: undefined})}, message => messages.push(message), {headed: true});
  await driver.register(verificationRequest());
  assert.equal(attempts.length, 1);
  assert.equal((messages.at(-1) as {result: string}).result, "failure");
  const provider = await runProviderFixture("turnstile", "before_approval", () => {});
  assert.equal(attempts.length, 2);
  assert.equal(provider.outcome, "failure");
  assert.equal(provider.version, "browserdriver.provider-fixture.v4");
  assert.equal(provider.chromiumSandbox, true);
  assert.deepEqual(provider.teardown, {context: true, browser: true, server: true});
  const local = await runFixturePresentationDiagnostic(() => {});
  assert.equal(attempts.length, 3);
  assert.equal(local.outcome, "failure");
  assert.equal(local.version, "browserdriver.fixture-presentation.v2");
  assert.equal(local.chromiumSandbox, true);
  assert.deepEqual(local.teardown, {context: true, browser: true, server: true});
  assert.equal(JSON.stringify({messages, provider, local}).includes(canary), false);
  await driver.close();
});
