import assert from "node:assert/strict";
import { lstat, writeFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import test from "node:test";
import { runFixturePresentationDiagnostic } from "./fixture-presentation.js";

const selected = process.env.BROWSERDRIVER_FIXTURE_VISIBILITY_TEST;
const report = process.env.BROWSERDRIVER_FIXTURE_VISIBILITY_REPORT;
const reportVersion = process.env.BROWSERDRIVER_FIXTURE_VISIBILITY_REPORT_VERSION;
test("local fixture window presentation: human confirmation, no provider execution", {
  skip: [selected, report, reportVersion].every(value => value === undefined), timeout: 350_000,
}, async () => {
  assert.ok(selected === "1" && report && isAbsolute(report) && reportVersion === "browserdriver.fixture-presentation.v2", "fixture_presentation_selection_invalid");
  try {
    try {await lstat(report); assert.fail("exists");}
    catch (error) {if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;}
    await writeFile(report + ".claim.json", JSON.stringify({version: "browserdriver.fixture-presentation-claim.v2", reportVersion}) + "\n", {flag: "wx", mode: 0o600});
  } catch {assert.fail("fixture_presentation_claim_failed");}
  const result = await runFixturePresentationDiagnostic(sample => process.stdout.write(JSON.stringify(sample) + "\n"));
  await writeFile(report, JSON.stringify(result, null, 2) + "\n", {flag: "wx", mode: 0o600});
  assert.equal(result.outcome, "confirmed", result.failureCode ?? "fixture_presentation_unconfirmed");
});
