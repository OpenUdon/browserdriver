import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

type Identity = { pid: number; start: string; uid: number };
type Observation = Identity & { parent: number; cmd: Buffer; parentIdentity?: Identity };
const { reconcileProcessCustody, processIdentityKey, observeProcessWithParent } = createRequire(import.meta.url)("../../scripts/m16-process-custody.cjs") as {
  processIdentityKey(identity: Identity): string;
  reconcileProcessCustody(processes: Observation[], launch: Identity | undefined, lineage: Map<string, Identity>, baseline: Set<string>, output: string):
    { owned: Observation[]; potential: Identity[]; ambiguous: boolean };
  observeProcessWithParent(pid: number, read: (pid: number) => Promise<Observation>): Promise<Observation | undefined>;
};
const item = (pid: number, parent: number, start: string, cmd = "worker", uid = 1000): Observation => ({ pid, parent, start, uid, cmd: Buffer.from(cmd) });

test("qualification process custody retains positive descendant lineage across reparenting", () => {
  const launch = item(10, 1, "100"), lineage = new Map([[processIdentityKey(launch), launch]]), baseline = new Set<string>();
  const first = reconcileProcessCustody([launch, { ...item(11, 10, "101"), parentIdentity: launch },
    { ...item(12, 11, "102"), parentIdentity: item(11, 10, "101") }], launch, lineage, baseline, "/private/output");
  assert.deepEqual(first.owned.map(value => value.pid), [10, 11, 12]);
  const settledParent = reconcileProcessCustody([item(12, 1, "102")], launch, lineage, baseline, "/private/output");
  assert.deepEqual(settledParent.owned.map(value => value.pid), [12]);
});

test("parent PID reuse during inventory never grants unrelated child lineage", async () => {
  const launch = item(10, 1, "100"), lineage = new Map([[processIdentityKey(launch), launch]]);
  let parentReused = false;
  const child = await observeProcessWithParent(20, async pid => {
    if (pid === 20) { parentReused = true; return item(20, 10, "901"); }
    if (pid === 10) return parentReused ? item(10, 1, "900") : launch;
    throw new Error("unavailable");
  });
  assert.ok(child); assert.equal(child.parentIdentity!.start, "900");
  const proof = reconcileProcessCustody([launch, child], launch, lineage, new Set(), "/private/output");
  assert.deepEqual(proof.owned.map(value => value.pid), [10]);
  assert.ok(!lineage.has(processIdentityKey(child)));
});

test("changing parent or child identity inside a bracket supplies no descent proof", async () => {
  const launch = item(10, 1, "100");
  let parentReads = 0;
  const changingParent = await observeProcessWithParent(20, async pid => pid === 20 ? item(20, 10, "200") :
    ++parentReads === 1 ? launch : item(10, 1, "900"));
  assert.ok(changingParent); assert.equal(changingParent.parentIdentity, undefined);
  const proof = reconcileProcessCustody([launch, changingParent], launch, new Map(), new Set(), "/private/output");
  assert.deepEqual(proof.owned.map(value => value.pid), [10]);
  let childReads = 0;
  const changingChild = await observeProcessWithParent(20, async pid => pid === 10 ? launch :
    ++childReads === 1 ? item(20, 10, "200") : item(20, 10, "999"));
  assert.equal(changingChild, undefined);
});

test("marker-only human/foreign log readers are potential gaps and never signal targets", () => {
  const launch = item(10, 1, "100"), lineage = new Map([[processIdentityKey(launch), launch]]), output = "/private/output";
  const proof = reconcileProcessCustody([launch, item(20, 1, "200", `tail ${output}/fixture.log`),
    item(21, 20, "201", `reader ${output}`, 0)], launch, lineage, new Set(), output);
  assert.deepEqual(proof.owned.map(value => value.pid), [10]);
  assert.deepEqual(proof.potential.map(value => value.pid), [20, 21]);
  assert.ok(!lineage.has(processIdentityKey(item(20, 1, "200"))));
  const missing = reconcileProcessCustody([item(30, 1, "300", output)], undefined, new Map(), new Set(), output);
  assert.deepEqual(missing.owned, []); assert.equal(missing.potential.length, 1);
});

test("reused root and descendant PIDs never recreate ownership or spread to new children", () => {
  const launch = item(10, 1, "100"), lineage = new Map([[processIdentityKey(launch), launch],
    [processIdentityKey(item(11, 10, "101")), item(11, 10, "101")]]);
  const proof = reconcileProcessCustody([item(10, 1, "900"), item(11, 10, "901"), item(12, 11, "902")], launch, lineage, new Set(), "/private/output");
  assert.deepEqual(proof.owned, []);
  const wrongOwner = reconcileProcessCustody([item(10, 1, "100", "worker", 0)], launch, lineage, new Set(), "/private/output");
  assert.deepEqual(wrongOwner.owned, []);
});

test("preexisting identities and ambiguous process inventories cannot establish descendants", () => {
  const launch = item(10, 1, "100"), previous = item(11, 10, "101"), baseline = new Set([processIdentityKey(previous)]);
  const lineage = new Map([[processIdentityKey(launch), launch]]);
  assert.deepEqual(reconcileProcessCustody([launch, previous], launch, lineage, baseline, "/private/output").owned.map(value => value.pid), [10]);
  const ambiguous = reconcileProcessCustody([launch, { ...launch }], launch, lineage, baseline, "/private/output");
  assert.equal(ambiguous.ambiguous, true); assert.deepEqual(ambiguous.owned, []);
});
