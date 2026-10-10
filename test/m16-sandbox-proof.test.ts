import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

type Identity = { pid: number; start: string; uid: number };
type Link = Identity & { parentIdentity?: Identity };
type Proof = {
  registerMain(identity: Identity): void; positiveRenderer(identity: Identity, lineage: Map<string, Link>): string | undefined;
  assign(phase: string, identity: Identity): boolean; complete(): boolean;
  eligibleRoot(phase: string, worker: Identity, lineage: Map<string, Link>): Identity | undefined;
};
const { inspectRenderer, LaunchSandboxProof } = createRequire(import.meta.url)("../../scripts/m16-sandbox-proof.cjs") as {
  inspectRenderer(identity: Identity, readIdentity: (pid: number) => Promise<Identity>, readStatus: (pid: number) => Promise<string>, readNamespace: (pid: number) => Promise<string>, launcherNamespace: string): Promise<{ state: string }>;
  LaunchSandboxProof: new () => Proof;
};
const key = (value: Identity): string => `${value.pid}:${value.start}:${value.uid}`;
const first = { pid: 10, start: "100", uid: 1000 }, second = { pid: 20, start: "200", uid: 1000 };
const renderer = { pid: 11, start: "101", uid: 1000 };

test("two exact main launches each require their own positive renderer proof and distinct phase", () => {
  const proof = new LaunchSandboxProof(), otherRenderer = { pid: 21, start: "201", uid: 1000 };
  proof.registerMain(first); proof.registerMain(second);
  const lineage = new Map([[key(renderer), { ...renderer, parentIdentity: first }], [key(otherRenderer), { ...otherRenderer, parentIdentity: second }]]);
  assert.equal(proof.positiveRenderer(renderer, lineage), key(first)); assert.equal(proof.assign("start", first), true);
  assert.equal(proof.complete(), false); assert.equal(proof.assign("reuse", first), false); assert.equal(proof.assign("reuse", second), false);
  assert.equal(proof.positiveRenderer(otherRenderer, lineage), key(second)); assert.equal(proof.assign("reuse", second), true);
  assert.equal(proof.complete(), true);
});

test("first-only positives, unproven ancestry and a reused main identity cannot cover the second launch", () => {
  const proof = new LaunchSandboxProof(); proof.registerMain(first); proof.registerMain(second);
  const oldRoot = { ...first, start: "old" }, lineage = new Map([[key(renderer), { ...renderer, parentIdentity: oldRoot }]]);
  assert.equal(proof.positiveRenderer(renderer, lineage), undefined);
  lineage.set(key(renderer), { ...renderer, parentIdentity: first });
  proof.positiveRenderer(renderer, lineage); proof.assign("start", first);
  assert.equal(proof.complete(), false); assert.equal(proof.assign("reuse", second), false);
});

test("phase acknowledgement follows exact fixture-worker ancestry and never reuses an assigned main", () => {
  const proof = new LaunchSandboxProof(), worker = { pid: 1, start: "10", uid: 1000 }, otherRenderer = { pid: 21, start: "201", uid: 1000 };
  proof.registerMain(first); proof.registerMain(second);
  const lineage = new Map([[key(first), { ...first, parentIdentity: worker }], [key(second), { ...second, parentIdentity: worker }],
    [key(renderer), { ...renderer, parentIdentity: first }], [key(otherRenderer), { ...otherRenderer, parentIdentity: second }]]);
  proof.positiveRenderer(renderer, lineage);
  assert.deepEqual(proof.eligibleRoot("start", worker, lineage), first); proof.assign("start", first);
  assert.equal(proof.eligibleRoot("reuse", worker, lineage), undefined);
  proof.positiveRenderer(otherRenderer, lineage);
  assert.deepEqual(proof.eligibleRoot("reuse", worker, lineage), second);
  assert.equal(proof.eligibleRoot("reuse", { ...worker, start: "reused" }, lineage), undefined);
});

test("live EACCES/EIO inspection refuses; only absence or proved identity change is gone", async () => {
  const goodStatus = async () => "Seccomp:\t2\nNoNewPrivs:\t1\n", namespace = async () => "user:[2]";
  const failure = (code: string) => async (): Promise<never> => { throw Object.assign(new Error("private inspection failure"), { code }); };
  for (const code of ["EACCES", "EIO"]) {
    assert.equal((await inspectRenderer(renderer, failure(code), goodStatus, namespace, "user:[1]")).state, "uncertain");
    assert.equal((await inspectRenderer(renderer, async () => renderer, failure(code), namespace, "user:[1]")).state, "uncertain");
    assert.equal((await inspectRenderer(renderer, async () => renderer, goodStatus, failure(code), "user:[1]")).state, "uncertain");
  }
  for (const code of ["ENOENT", "ESRCH"]) assert.equal((await inspectRenderer(renderer, failure(code), goodStatus, namespace, "user:[1]")).state, "gone");
  assert.equal((await inspectRenderer(renderer, async () => ({ ...renderer, start: "reused" }), goodStatus, namespace, "user:[1]")).state, "identity-changed");
  assert.equal((await inspectRenderer(renderer, async () => renderer, goodStatus, namespace, "user:[1]")).state, "positive");
  assert.equal((await inspectRenderer(renderer, async () => renderer, goodStatus, namespace, "user:[2]")).state, "violation");
});
