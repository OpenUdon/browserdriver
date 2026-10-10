import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Duplex } from "node:stream";
import test from "node:test";

const { SupervisorClient, validateCustody, retainAdoptions, reconcileWithAdoptionRefresh, verifyOutputDirectory, holdOutputDirectory } = createRequire(import.meta.url)("../../scripts/m16-supervisor-client.cjs");
const { publishPacket } = createRequire(import.meta.url)("../../scripts/m16-packet.cjs");
const identity = (pid: number, start = String(pid), uid = 1000) => ({ pid, start, uid });
const root = identity(10), supervisor = identity(9);
const record = (pid: number, reaped = false) => ({ identity: identity(pid), parentIdentity: supervisor, proof: "kernel-child", wait: reaped ? { code: "exited", status: 0 } : null, reaped });
const custody = (children = [record(10), record(11)]) => ({ version: "browserdriver.m16-supervisor.v1", supervisor, controller: root,
  subreaperVerified: true, gap: false, children, descendantsSettled: children.every(value => value.reaped || value.identity.pid === 10), echild: false, runDeadlineNs: "99999999999999999999", outputCustody: null });

test("kernel adoption retains positive custody without making supervisor/controller signal targets", () => {
  const value = validateCustody(custody(), root);
  const lineage = new Map();
  retainAdoptions(value, lineage, root, new Set());
  assert.equal(lineage.size, 1); assert.ok(lineage.has("11:11:1000")); assert.ok(!lineage.has("10:10:1000")); assert.ok(!lineage.has("9:9:1000"));
  const existing = { ...identity(11), parentIdentity: identity(20) }; lineage.set("11:11:1000", existing);
  retainAdoptions(value, lineage, root, new Set()); assert.equal(lineage.get("11:11:1000"), existing);
  assert.throws(() => retainAdoptions(value, new Map(), root, new Set(["11:11:1000"])));
});

test("adoption between inventories gets one bounded exact refresh; foreign markers stay unowned", async () => {
  const process = { ...identity(11), parent: 9, parentIdentity: supervisor, cmd: Buffer.from("/private/output") };
  let refreshes = 0;
  const proof = await reconcileWithAdoptionRefresh([process], undefined, new Map(), new Set(), "/private/output", root,
    async () => { refreshes += 1; return validateCustody(custody(), root); });
  assert.equal(refreshes, 1); assert.deepEqual(proof.potential, []); assert.equal(proof.owned[0].pid, 11);
  const foreign = await reconcileWithAdoptionRefresh([{ ...process, start: "99" }], undefined, new Map(), new Set(), "/private/output", root,
    async () => validateCustody(custody(), root));
  assert.deepEqual(foreign.owned, []); assert.equal(foreign.potential.length, 1);
  await assert.rejects(reconcileWithAdoptionRefresh([process], undefined, new Map(), new Set(), "/private/output", root,
    async () => ({ ...custody(), gap: true })));
});

test("replaced parent, root, UID, duplicate/retracted/reused exit evidence and false settlement refuse", () => {
  const valid = custody();
  for (const value of [ { ...valid, extra: true }, { ...valid, supervisor: identity(9, "99") }, { ...valid, controller: identity(10, "99") },
    { ...valid, children: [record(10), { ...record(11), parentIdentity: identity(9, "99") }] },
    { ...valid, children: [record(10), record(11), record(11)] }, { ...valid, descendantsSettled: true }, { ...valid, echild: true },
    { ...valid, children: [record(10), record(11), { ...record(11), identity: identity(11, "99") }] },
    { ...valid, children: [record(10), { ...record(11), reaped: true }] } ]) assert.throws(() => validateCustody(value, root, valid));
  const reaped = custody([record(10), record(11, true)]);
  validateCustody(reaped, root, valid);
  assert.throws(() => validateCustody(valid, root, reaped));
  assert.throws(() => validateCustody(custody([record(10)]), root, reaped));
  assert.throws(() => validateCustody({ ...reaped, children: [record(10), { ...record(11, true), wait: { code: "exited", status: 7 } }] }, root, reaped));
});

test("persistent subreaper proves synthetic rapid reparenting, zombies, crash and IPC failure settlement", { timeout: 20000 }, () => {
  const fixture = fileURLToPath(new URL("../../test/m16-supervisor-fixtures.py", import.meta.url));
  const result = spawnSync("/usr/bin/python3.14", ["-I", "-S", fixture], { encoding: "utf8", env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" } });
  assert.equal(result.status, 0, result.stderr); assert.equal(result.signal, null);
});

class FixtureSocket extends Duplex {
  constructor(private reply: (request: Record<string, unknown>) => string | null) { super(); }
  override _read() {}
  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    const response = this.reply(JSON.parse(chunk.toString("utf8")));
    queueMicrotask(() => { this.push(response === null ? null : Buffer.from(response)); }); callback();
  }
}

test("private inherited IPC refuses replay, nonce mismatch, duplicate keys, excess/truncated frames and expired budget", async () => {
  const nonce = "a".repeat(64);
  const response = (request: Record<string, unknown>) => ({ version: request.version, nonce, sequence: request.sequence,
    operation: request.operation, custody: custody() });
  const socket = new FixtureSocket(request => `${JSON.stringify(response(request))}\n`);
  const client = new SupervisorClient(root, nonce, socket);
  assert.deepEqual(await client.request(), custody()); client.close(); socket.destroy();
  for (const reply of [
    (request: Record<string, unknown>) => `${JSON.stringify({ ...response(request), nonce: "b".repeat(64) })}\n`,
    (request: Record<string, unknown>) => `${JSON.stringify({ ...response(request), sequence: 0 })}\n`,
    (request: Record<string, unknown>) => `${JSON.stringify(response(request)).replace('"nonce":', '"nonce":"duplicate","nonce":')}\n`,
    () => "x".repeat(131073), () => null,
    (request: Record<string, unknown>) => `${JSON.stringify(response(request))}\n{}\n`,
  ]) {
    const badSocket = new FixtureSocket(reply), bad = new SupervisorClient(root, nonce, badSocket);
    await assert.rejects(bad.request()); badSocket.destroy();
  }
  const expiredSocket = new FixtureSocket(() => { assert.fail("expired request wrote IPC"); });
  const expired = new SupervisorClient(root, nonce, expiredSocket);
  assert.throws(() => expired.request("snapshot", 0n)); expiredSocket.destroy();
});

test("receive capacity is checked before concatenation and failure drops later chunks", async () => {
  const socket = new FixtureSocket(() => "x".repeat(65536));
  const client = new SupervisorClient(root, "a".repeat(64), socket);
  const pending = client.request();
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(client.buffer.length, 65536);
  socket.emit("data", Buffer.alloc(65537));
  await assert.rejects(pending); assert.equal(client.buffer.length, 0); assert.equal(socket.destroyed, true);
  for (let index = 0; index < 4; index += 1) socket.emit("data", Buffer.alloc(65536));
  assert.equal(client.buffer.length, 0); assert.throws(() => client.request());
});

test("Node accepts only the exact parent-created private result directory", async () => {
  const parent = await mkdtemp(join(tmpdir(), "m16-result-custody-")), path = join(parent, "owned");
  try {
    await mkdir(path, { mode: 0o700 });
    const info = await lstat(path, { bigint: true });
    const proof = { device: info.dev.toString(), inode: info.ino.toString(), uid: Number(info.uid), gid: Number(info.gid), mode: 0o700 };
    await verifyOutputDirectory(path, proof);
    await assert.rejects(verifyOutputDirectory(path, null));
    await assert.rejects(verifyOutputDirectory(path, { ...proof, inode: "0" }));
    await assert.rejects(verifyOutputDirectory(path, { ...proof, uid: proof.uid + 1 }));
    const initial = { ...custody(), outputCustody: proof };
    validateCustody(initial, root);
    assert.throws(() => validateCustody({ ...initial, outputCustody: { ...proof, inode: "0" } }, root, initial));
    await rename(path, join(parent, "retained")); await mkdir(path, { mode: 0o700 });
    await assert.rejects(verifyOutputDirectory(path, proof));
  } finally { await rm(parent, { recursive: true }); }
});

test("replacement after validation cannot redirect owned mkdir/write/packet/removal into foreign staging", async () => {
  const parent = await mkdtemp(join(tmpdir(), "m16-root-operation-")), path = join(parent, "owned"), retained = join(parent, "retained");
  let held: { anchor: string; verifyHeld(): Promise<void>; verifyCurrent(): Promise<void>; close(): Promise<void> } | undefined;
  try {
    await mkdir(path, { mode: 0o700 });
    const info = await lstat(path, { bigint: true });
    held = await holdOutputDirectory(path, { device: info.dev.toString(), inode: info.ino.toString(), uid: Number(info.uid), gid: Number(info.gid), mode: 0o700 });
    assert.ok(held);
    for (const name of ["home", "tmp", "tmp/sandbox-proofs", "tmp/sandbox-proofs/acks"]) await mkdir(`${held.anchor}/${name}`, { mode: 0o700 });
    await writeFile(`${held.anchor}/home/owned`, "owned", { flag: "wx", mode: 0o600 });
    await held.verifyCurrent();
    // Replace precisely between the custody check and asynchronous operations.
    await rename(path, retained); await mkdir(path, { mode: 0o700 });
    await mkdir(join(path, "home"), { mode: 0o700 }); await mkdir(join(path, "tmp"), { mode: 0o700 });
    await writeFile(join(path, "home", "foreign"), "preserve", { mode: 0o600 });
    await writeFile(join(path, "tmp", "foreign"), "preserve", { mode: 0o600 });
    await mkdir(`${held.anchor}/created-after-check`, { mode: 0o700 });
    await writeFile(`${held.anchor}/qualification-node.json`, "owned-report", { flag: "wx", mode: 0o600 });
    await publishPacket(`${held.anchor}/tmp/sandbox-proofs/acks/start.json`, { fixed: true }, held);
    await assert.rejects(publishPacket(`${held.anchor}/created-after-check/reuse.json`, { fixed: true }, held));
    await rm(`${held.anchor}/home`, { recursive: true }); await rm(`${held.anchor}/tmp`, { recursive: true });
    assert.equal(await readFile(join(path, "home", "foreign"), "utf8"), "preserve");
    assert.equal(await readFile(join(path, "tmp", "foreign"), "utf8"), "preserve");
    assert.equal(await readFile(join(retained, "qualification-node.json"), "utf8"), "owned-report");
    await assert.rejects(lstat(join(path, "qualification-node.json"))); await assert.rejects(lstat(join(path, "created-after-check")));
    await held.verifyHeld(); await assert.rejects(held.verifyCurrent());
  } finally { await held?.close(); await rm(parent, { recursive: true }); }
});
