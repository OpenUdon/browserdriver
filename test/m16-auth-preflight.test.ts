import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { chromium } from "playwright";
import { PersistentBrowserDriver } from "../src/driver.js";
import { parseSessionSavePlan } from "../src/session-save.js";
import { fixtureAuthentication, fixtureSavePlan } from "./m16-fixture-auth.js";

test("exact failed-v1 authentication passes validation and consumes its save permission before stubbed launch", async (t) => {
  const preserved = JSON.parse(await readFile("fixtures/m16-session-save-v1/failed-v1-authentication-requests.json", "utf8"));
  assert.equal(preserved.fixtureOnly, true);
  for (const [index, phase] of ["start", "reuse"].entries()) {
    const auth = fixtureAuthentication(phase as "start" | "reuse");
    assert.deepEqual(auth, preserved.requests[index]);
    let launches = 0;
    t.mock.method(chromium, "launch", async () => { launches += 1; throw new Error("offline launch sentinel"); });
    const plan = parseSessionSavePlan(Buffer.from(JSON.stringify(fixtureSavePlan(phase as "start" | "reuse", auth, Date.now()))));
    const messages: object[] = [];
    const driver = new PersistentBrowserDriver({ next: async () => ({ done: true, value: undefined }) }, message => messages.push(message), {
      headed: true, sessionSave: { plan, planSHA256: "a".repeat(64), candidates: {
        write: async () => assert.fail("stubbed launch cannot save"), close: async () => undefined,
      } },
    });
    await driver.authenticate(auth);
    assert.equal(launches, 1);
    assert.equal((driver as unknown as { consumedSavePermissions: Set<string> }).consumedSavePermissions.has(`fixture-${phase}`), true);
    assert.deepEqual(messages, [{ version: auth.version, type: "status", requestId: phase, status: "resolving" },
      { version: auth.version, type: "result", requestId: phase, result: "failure", failureCode: "driver_error" }]);
    await driver.close(); t.mock.restoreAll();
  }
});
