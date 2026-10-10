import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import http from "node:http";
import https from "node:https";

const require = createRequire(import.meta.url);
const policy = require("../../scripts/m16-audit-boundary.cjs") as {
  expected: Record<string, readonly string[]>; matchesBody(value: unknown): boolean; permitsMetadata(url: string, present: boolean): boolean;
};

test("native npm audit virtual-lock payload contains exact complete production inventory", async (t) => {
  t.mock.method(http, "request", () => { throw new Error("offline inventory refuses network"); });
  t.mock.method(https, "request", () => { throw new Error("offline inventory refuses network"); });
  const base = "/home/peter/.nvm/versions/node/v24.14.1/lib/node_modules/npm/node_modules";
  const Arborist = require(`${base}/@npmcli/arborist`) as new (options: object) => { loadVirtual(): Promise<unknown> };
  const AuditReport = require(`${base}/@npmcli/arborist/lib/audit-report.js`) as new (tree: unknown, options: object) => { prepareBulkData(): object };
  // No audit() call: loadVirtual + prepareBulkData only, matching audit's own
  // tree choice while keeping every transport unavailable.
  const tree = await new Arborist({ path: process.cwd(), offline: true }).loadVirtual();
  const body = new AuditReport(tree, { omit: ["dev"], offline: true }).prepareBulkData();
  assert.deepEqual(body, { fsevents: ["2.3.2"], playwright: ["1.62.1"], "playwright-core": ["1.62.1"] });
  assert.equal(policy.matchesBody(body), true); assert.deepEqual(body, policy.expected);
});

test("audit boundary includes fsevents only at exact locked version and conditional approved endpoint", () => {
  const expected = structuredClone(policy.expected);
  assert.equal(policy.matchesBody({ ...expected, fsevents: ["2.3.3"] }), false);
  assert.equal(policy.matchesBody({ playwright: ["1.62.1"], "playwright-core": ["1.62.1"] }), false);
  assert.equal(policy.matchesBody({ ...expected, privatePackage: ["1"] }), false);
  assert.equal(policy.permitsMetadata("https://registry.npmjs.org/fsevents", false), false);
  assert.equal(policy.permitsMetadata("https://registry.npmjs.org/fsevents", true), true);
  assert.equal(policy.permitsMetadata("https://registry.npmjs.org/fsevents/-/fsevents-2.3.2.tgz", true), false);
  assert.equal(policy.permitsMetadata("https://unapproved.invalid/fsevents", true), false);
});
