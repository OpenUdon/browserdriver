import assert from "node:assert/strict";
import { lstat, writeFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import test from "node:test";
import { officialProviders, runProviderFixture } from "./provider-fixture.js";

const selected = process.env.BROWSERDRIVER_PROVIDER_NETWORK_TEST;
const mode = process.env.BROWSERDRIVER_PROVIDER_ACTIVATION;
const report = process.env.BROWSERDRIVER_PROVIDER_REPORT;
const reportVersion = process.env.BROWSERDRIVER_PROVIDER_REPORT_VERSION;
const valid = reportVersion === "browserdriver.provider-fixture.v6" && Object.hasOwn(officialProviders, selected ?? "") && ["before_approval", "approved_submit"].includes(mode ?? "") && report && isAbsolute(report);

test("provider fixture selection requires one provider, one mode, report v6 and an exclusive report path", {skip: [selected, mode, report, reportVersion].every(value => value === undefined)}, () => {
  assert.ok(valid, "provider_fixture_selection_invalid");
});

for (const provider of Object.keys(officialProviders) as Array<keyof typeof officialProviders>) {
  for (const activation of ["before_approval", "approved_submit"] as const) {
    test(`official test-key integration: ${provider}/${activation}`, {
      skip: !valid || selected !== provider || mode !== activation, timeout: 480_000,
    }, async t => {
      // Consume a distinct invocation before browser or provider contact.
      // Reusing its report path cannot replay a failed or crashed invocation.
      try {
        try {await lstat(report!); assert.fail("provider_fixture_report_exists");}
        catch (error) {if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;}
        await writeFile(report! + ".claim.json", JSON.stringify({version: "browserdriver.provider-fixture-claim.v3", reportVersion, provider, activation}) + "\n", {flag: "wx", mode: 0o600});
      } catch {assert.fail("provider_fixture_claim_failed");}
      // Test stdout is TAP-wrapped by Node and streams immediately; t.diagnostic
      // defers its output until completion, too late for a human attention cue.
      const result = await runProviderFixture(provider, activation, event => process.stdout.write(JSON.stringify(event) + "\n"));
      try {await writeFile(report!, JSON.stringify(result, null, 2) + "\n", {flag: "wx", mode: 0o600});}
      catch {assert.fail("provider_fixture_report_failed");}
      t.diagnostic(JSON.stringify(result));
      assert.equal(result.outcome, "success", result.failureCode ?? "provider_fixture_failed");
    });
  }
}
