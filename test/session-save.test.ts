import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { chmod, link, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile, type FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncBuiltinESMExports } from "node:module";
import test from "node:test";
import {
  assertSessionSaveCurrent, defaultSessionMaxAgeSeconds, maxSessionCandidateBytes, maxSessionSavePlanBytes,
  parseSessionSavePlan, sessionCandidateFileName, sessionCandidateStore, sessionSaveConfiguration, sessionSavePlan,
} from "../src/session-save.js";
import { DriverFailure } from "../src/protocol.js";
import { FileSessionStateStore, sessionStateFileName } from "../src/session-store.js";

function input(now = Date.now()) {
  return { version: "browserdriver.session-save-plan.v1", launchNonce: "fixture-launch",
    admittedDeadline: new Date(now + 60_000).toISOString(), permissions: [{ permissionId: "fixture-permission",
      authenticate: { version: "udon.browser-driver.v2", operationId: "fixture-operation", sourceDigest: `sha256:${"a".repeat(64)}`,
        flow: "login", session: "member", sessionBinding: null }, authenticationRequestSHA256: "b".repeat(64),
      saveBinding: "private-opaque-fixture", bindingSHA256: "c".repeat(64), generation: 3,
      createdAt: new Date(now - 1_000).toISOString(), expiresAt: new Date(now - 1_000 + defaultSessionMaxAgeSeconds * 1_000).toISOString(),
    }] };
}
const bytes = (value: unknown): Buffer => Buffer.from(JSON.stringify(value));
const parse = (value = input()) => parseSessionSavePlan(bytes(value));

test("private save plans retain original lifetime, default age and deeply frozen records", () => {
  const value = input(), plan = parse(value), permission = plan.permissions[0]!;
  assert.equal(permission.maxAgeSeconds, 604_800);
  assert.equal(permission.createdAt, value.permissions[0]!.createdAt);
  assert.equal(permission.expiresAt, value.permissions[0]!.expiresAt);
  assert.ok([plan, plan.permissions, permission, permission.authenticate].every(Object.isFrozen));
  assert.throws(() => { (permission as unknown as { generation: number }).generation = 4; });
  assertSessionSaveCurrent(plan, permission);
});

test("strict plans refuse duplicate keys, extra fields, nulls, Unicode, depth and size", () => {
  const valid = JSON.stringify(input());
  for (const text of [valid.replace('"permissions":', '"launchNonce":"duplicate","permissions":'),
    valid.replace('"generation":3', '"generation":3,"generation":3'), valid.replace('"generation":3', '"generation":3,"extra":true'),
    valid.replace('"launchNonce":"fixture-launch"', '"launchNonce":null'), valid.replace('fixture-launch', '\\ud800'),
    valid.replace('"launchNonce":"fixture-launch"', '"launchNonce":"fixture-launch","deep":' + '['.repeat(34) + '0' + ']'.repeat(34)),
    valid + " garbage", "\ufeff" + valid]) assert.throws(() => parseSessionSavePlan(Buffer.from(text)));
  assert.throws(() => parseSessionSavePlan(Buffer.from([0xff, 0xff])));
  assert.throws(() => parseSessionSavePlan(Buffer.alloc(maxSessionSavePlanBytes + 1, 32)));
});

test("strict plans bound identity, generations, permission inventory and original expiry", () => {
  const mutate = (change: (value: ReturnType<typeof input>) => void): void => {
    const value = input(); change(value); assert.throws(() => parse(value));
  };
  mutate(value => { value.permissions[0]!.generation = Number.MAX_SAFE_INTEGER + 1; });
  mutate(value => { value.permissions[0]!.generation = 0; });
  mutate(value => { value.permissions[0]!.bindingSHA256 = "ABC"; });
  mutate(value => { value.permissions[0]!.expiresAt = value.permissions[0]!.createdAt; });
  mutate(value => { value.permissions[0]!.createdAt = new Date(Date.now() + 2_000).toISOString(); });
  mutate(value => { value.admittedDeadline = new Date(Date.now() - 1).toISOString(); });
  mutate(value => { value.permissions.push(value.permissions[0]!); });
  mutate(value => { value.permissions = Array.from({ length: 101 }, () => value.permissions[0]!); });
  mutate(value => { value.permissions[0]!.authenticate.version = "udon.browser-driver.v6"; });
  for (const maxAgeSeconds of [0, 2_592_001, 0.5, null]) {
    const value = input(); assert.throws(() => parseSessionSavePlan(bytes({ ...value, permissions: [{ ...value.permissions[0], maxAgeSeconds }] })));
  }
  const value = input();
  const custom = { ...value.permissions[0], maxAgeSeconds: 60,
    expiresAt: new Date(Date.parse(value.permissions[0]!.createdAt) + 60_000).toISOString() };
  assert.equal(parseSessionSavePlan(bytes({ ...value, permissions: [custom] })).permissions[0]!.maxAgeSeconds, 60);
  const nano = input();
  nano.admittedDeadline = nano.admittedDeadline.replace(/\.\d{3}Z/u, ".123456789Z");
  assert.ok(parse(nano));
});

test("each permission ID, authentication tuple and save binding is independently unique", () => {
  for (const duplicate of ["id", "tuple", "binding"]) {
    const value = input();
    const other = structuredClone(value.permissions[0]!);
    other.permissionId = "second"; other.saveBinding = "second"; other.authenticate.operationId = "second";
    if (duplicate === "id") other.permissionId = value.permissions[0]!.permissionId;
    if (duplicate === "tuple") other.authenticate = structuredClone(value.permissions[0]!.authenticate);
    if (duplicate === "binding") other.saveBinding = value.permissions[0]!.saveBinding;
    value.permissions.push(other);
    assert.throws(() => parse(value));
  }
});

test("absent configuration performs no I/O; a partial pair refuses before launch", async () => {
  assert.equal(await sessionSaveConfiguration(), undefined);
  await assert.rejects(() => sessionSaveConfiguration("/absent-plan"));
  await assert.rejects(() => sessionSaveConfiguration(undefined, "/absent-root"));
});

test("private plan reads pin exact bytes and refuse unsafe file custody", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "browserdriver-m16-plan-"));
  try {
    const path = join(root, "plan.json"), data = bytes(input());
    await writeFile(path, data, { mode: 0o600 });
    const loaded = await sessionSavePlan(path);
    assert.equal(loaded.planSHA256, createHash("sha256").update(data).digest("hex"));
    await chmod(path, 0o640);
    await assert.rejects(() => sessionSavePlan(path));
    await chmod(path, 0o600);
    const alias = join(root, "alias"); await symlink(path, alias);
    await assert.rejects(() => sessionSavePlan(alias));
    await link(path, join(root, "extra-link"));
    await assert.rejects(() => sessionSavePlan(path));
    await rm(join(root, "extra-link"));
    const uid = process.getuid!(); t.mock.method(process as { getuid(): number }, "getuid", () => uid + 1);
    await assert.rejects(() => sessionSavePlan(path)); t.mock.restoreAll();
    await chmod(root, 0o755);
    await assert.rejects(() => sessionSavePlan(path));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("staging requires a fresh stable owner-only root disjoint from legacy load", async (t) => {
  const base = await mkdtemp(join(tmpdir(), "browserdriver-m16-root-")), plan = parse();
  const root = join(base, "candidate"), load = join(base, "load");
  try {
    await mkdir(root, { mode: 0o700 }); await mkdir(load, { mode: 0o700 });
    const store = await sessionCandidateStore(root, plan, load); await store.close();
    await assert.rejects(() => sessionCandidateStore(root, plan, root));
    await assert.rejects(() => sessionCandidateStore(root, plan, base));
    const child = join(root, "child"); await mkdir(child, { mode: 0o700 });
    await assert.rejects(() => sessionCandidateStore(root, plan, child)); await rm(child, { recursive: true });
    await symlink(root, join(base, "alias"));
    await assert.rejects(() => sessionCandidateStore(join(base, "alias"), plan));
    await chmod(root, 0o755); await assert.rejects(() => sessionCandidateStore(root, plan)); await chmod(root, 0o700);
    const uid = process.getuid!(); t.mock.method(process as { getuid(): number }, "getuid", () => uid + 1);
    await assert.rejects(() => sessionCandidateStore(root, plan)); t.mock.restoreAll();
    await writeFile(join(root, "abandoned.tmp"), "unaccepted");
    await assert.rejects(() => sessionCandidateStore(root, plan));
  } finally { await rm(base, { recursive: true, force: true }); }
});

test("candidate publication settles complete exclusive0600 single-link bytes before Join", async () => {
  const root = await mkdtemp(join(tmpdir(), "browserdriver-m16-write-")), plan = parse(), permission = plan.permissions[0]!;
  const store = await sessionCandidateStore(root, plan);
  try {
    const capturedAt = new Date().toISOString(), storageState = { cookies: [{ name: "canary", value: "private-value" }], origins: [] };
    await store.write(permission, "d".repeat(64), capturedAt, storageState);
    await Promise.all([store.close(), store.close()]);
    const name = sessionCandidateFileName(permission.saveBinding), path = join(root, name), info = await lstat(path);
    assert.deepEqual(await readdir(root), [name]); assert.equal(info.mode & 0o777, 0o600); assert.equal(info.nlink, 1);
    assert.ok(name.endsWith(".candidate.json")); assert.ok(!name.includes(permission.saveBinding));
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), {
      version: "browserdriver.session-candidate.v1", launchNonce: plan.launchNonce, permissionId: permission.permissionId,
      planSHA256: "d".repeat(64), bindingSHA256: permission.bindingSHA256, generation: permission.generation,
      createdAt: permission.createdAt, expiresAt: permission.expiresAt, capturedAt, storageState,
    });
    await assert.rejects(() => store.write(permission, "d".repeat(64), capturedAt, storageState));
  } finally { await store.close(); await rm(root, { recursive: true, force: true }); }
});

test("existing files and symlinks never get replaced; oversize saves leave no temporary", async () => {
  for (const kind of ["existing", "symlink", "oversize", "unknown"]) {
    const root = await mkdtemp(join(tmpdir(), "browserdriver-m16-denial-")), plan = parse(), permission = plan.permissions[0]!;
    const store = await sessionCandidateStore(root, plan), name = sessionCandidateFileName(permission.saveBinding);
    try {
      if (kind === "existing") await writeFile(join(root, name), "existing", { mode: 0o600 });
      if (kind === "symlink") await symlink("/absent-private-state", join(root, name));
      await assert.rejects(() => store.write(kind === "unknown" ? { ...permission } : permission, "d".repeat(64), new Date().toISOString(),
        { cookies: kind === "oversize" ? "x".repeat(maxSessionCandidateBytes) : [] }));
      if (kind === "existing") assert.equal(await readFile(join(root, name), "utf8"), "existing");
      if (kind === "symlink") assert.ok((await lstat(join(root, name))).isSymbolicLink());
      assert.deepEqual(await readdir(root), kind === "existing" || kind === "symlink" ? [name] : []);
    } finally { await store.close(); await rm(root, { recursive: true, force: true }); }
  }
});

test("replaced staging paths refuse writes to either new root or old pinned directory", async () => {
  const base = await mkdtemp(join(tmpdir(), "browserdriver-m16-replace-")), root = join(base, "root"), previous = join(base, "previous");
  await mkdir(root, { mode: 0o700 });
  const plan = parse(), store = await sessionCandidateStore(root, plan);
  try {
    await rename(root, previous); await mkdir(root, { mode: 0o700 });
    await assert.rejects(() => store.write(plan.permissions[0]!, "d".repeat(64), new Date().toISOString(), { cookies: [] }));
    assert.deepEqual(await readdir(root), []); assert.deepEqual(await readdir(previous), []);
  } finally { await store.close(); await rm(base, { recursive: true, force: true }); }
});

test("directory-sync failure and an extra-link race leave no accepted candidate", async () => {
  for (const kind of ["sync", "extra-link", "deadline"]) {
    const root = await mkdtemp(join(tmpdir(), "browserdriver-m16-settle-")), plan = parse(), permission = plan.permissions[0]!;
    const store = await sessionCandidateStore(root, plan), directory = (store as unknown as { directory: FileHandle }).directory;
    const sync = directory.sync.bind(directory), now = Date.now;
    let calls = 0;
    directory.sync = async () => {
      calls += 1;
      if (calls === 1) {
        const name = sessionCandidateFileName(permission.saveBinding);
        assert.deepEqual(await readdir(root), [name]);
        assert.deepEqual(JSON.parse(await readFile(join(root, name), "utf8")).storageState, { cookies: [] });
        if (kind === "sync") throw new Error("private filesystem canary");
        if (kind === "extra-link") await link(join(root, name), join(root, "crash-extra.tmp"));
        if (kind === "deadline") Date.now = () => Date.parse(plan.admittedDeadline);
      }
      await sync();
    };
    try {
      await assert.rejects(() => store.write(permission, "d".repeat(64), new Date().toISOString(), { cookies: [] }));
      assert.deepEqual(await readdir(root), kind === "extra-link" ? ["crash-extra.tmp"] : []);
    } finally { Date.now = now; await store.close(); await rm(root, { recursive: true, force: true }); }
  }
});

test("failures before link and during temporary unlink settle without partial candidates", async (t) => {
  for (const kind of ["before-link", "temporary-unlink"]) {
    const root = await mkdtemp(join(tmpdir(), "browserdriver-m16-filesystem-")), plan = parse(), permission = plan.permissions[0]!;
    const store = await sessionCandidateStore(root, plan);
    try {
      if (kind === "before-link") t.mock.method(fs, "link", async () => { throw new Error("private link canary"); });
      else {
        const original = fs.unlink; let calls = 0;
        t.mock.method(fs, "unlink", async (path: Parameters<typeof fs.unlink>[0]) => {
          if (++calls === 1) throw new Error("private unlink canary");
          return original(path);
        });
      }
      syncBuiltinESMExports();
      await assert.rejects(() => store.write(permission, "d".repeat(64), new Date().toISOString(), { cookies: [] }));
      assert.deepEqual(await readdir(root), []);
      await store.close();
    } finally { t.mock.restoreAll(); syncBuiltinESMExports(); await store.close(); await rm(root, { recursive: true, force: true }); }
  }
});

test("cleanup failure invalidates remaining bytes and makes Join close fail observably", async (t) => {
  for (const kind of ["unlink", "invalidation"]) {
    const root = await mkdtemp(join(tmpdir(), "browserdriver-m16-cleanup-")), plan = parse(), permission = plan.permissions[0]!;
    const store = await sessionCandidateStore(root, plan), directory = (store as unknown as { directory: FileHandle }).directory;
    try {
      // Failure after atomic publication, followed by denied removal. In the
      // second case invalidation itself also fails; nonzero teardown is required.
      const sync = directory.sync.bind(directory); let calls = 0;
      directory.sync = async () => { if (++calls === 1) throw new Error("private sync canary"); await sync(); };
      t.mock.method(fs, "unlink", async () => { throw new Error("private erasure canary"); });
      if (kind === "invalidation") {
        const original = fs.open;
        t.mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
          const handle = await original(...args);
          t.mock.method(handle, "truncate", async () => { throw new Error("private invalidation canary"); });
          return handle;
        });
      }
      syncBuiltinESMExports();
      await assert.rejects(() => store.write(permission, "d".repeat(64), new Date().toISOString(), { cookies: [] }));
      await assert.rejects(() => store.close(), { message: "invalid private session save configuration" });
      await assert.rejects(() => store.write(permission, "d".repeat(64), new Date().toISOString(), { cookies: [] }));
      const candidate = join(root, sessionCandidateFileName(permission.saveBinding));
      if (kind === "unlink") assert.equal((await readFile(candidate)).length, 0);
      else assert.equal(JSON.parse(await readFile(candidate, "utf8")).version, "browserdriver.session-candidate.v1");
    } finally { t.mock.restoreAll(); syncBuiltinESMExports(); await rm(root, { recursive: true, force: true }); }
  }
});

test("raw legacy reuse remains separate from candidate envelopes and retains original lifetime", async () => {
  const base = await mkdtemp(join(tmpdir(), "browserdriver-m16-reuse-"));
  const candidateRoot = join(base, "candidate"), loadRoot = join(base, "load");
  await mkdir(candidateRoot, { mode: 0o700 }); await mkdir(loadRoot, { mode: 0o700 });
  const value = input(), original = value.permissions[0]!;
  original.createdAt = new Date(Date.now() - 3 * 86_400_000).toISOString();
  original.expiresAt = new Date(Date.parse(original.createdAt) + 604_800_000).toISOString();
  const plan = parse(value), permission = plan.permissions[0]!, store = await sessionCandidateStore(candidateRoot, plan, loadRoot);
  try {
    const state = { cookies: [], origins: [{ origin: "https://fixture.invalid", localStorage: [{ name: "private", value: "canary" }] }] };
    await store.write(permission, "d".repeat(64), new Date().toISOString(), state); await store.close();
    const candidate = JSON.parse(await readFile(join(candidateRoot, sessionCandidateFileName(permission.saveBinding)), "utf8"));
    assert.equal(candidate.createdAt, original.createdAt); assert.equal(candidate.expiresAt, original.expiresAt);
    assert.equal(candidate.generation, original.generation);
    // Merely directing the old loader at candidate staging cannot load its
    // envelope; only independently revalidated raw state may be staged by host.
    const wrongStore = new FileSessionStateStore(candidateRoot, () => undefined);
    await assert.rejects(() => wrongStore.load(permission.saveBinding), (error: unknown) => error instanceof DriverFailure && error.code === "session_expired");
    await writeFile(join(loadRoot, sessionStateFileName(permission.saveBinding)), JSON.stringify(candidate.storageState), { mode: 0o600 });
    assert.deepEqual(await new FileSessionStateStore(loadRoot, () => undefined).load(permission.saveBinding), state);
    assert.deepEqual(await readdir(candidateRoot), [sessionCandidateFileName(permission.saveBinding)]);
    assert.deepEqual(await readdir(loadRoot), [sessionStateFileName(permission.saveBinding)]);
  } finally { await store.close(); await rm(base, { recursive: true, force: true }); }
});

test("original deadline and expiry refuse equality without renewing old creation", () => {
  const now = Date.now(), value = input(now), permission = value.permissions[0]!;
  Object.assign(permission, { maxAgeSeconds: 10, expiresAt: new Date(Date.parse(permission.createdAt) + 10_000).toISOString() });
  const plan = parseSessionSavePlan(bytes(value), now);
  assertSessionSaveCurrent(plan, plan.permissions[0]!, Date.parse(permission.expiresAt) - 1);
  assert.throws(() => assertSessionSaveCurrent(plan, plan.permissions[0]!, Date.parse(permission.expiresAt)));
  assert.throws(() => parseSessionSavePlan(bytes(value), Date.parse(permission.expiresAt)));
  assert.throws(() => assertSessionSaveCurrent(plan, plan.permissions[0]!, Date.parse(permission.createdAt) - 1));
  assert.throws(() => assertSessionSaveCurrent(plan, plan.permissions[0]!, Date.parse(value.admittedDeadline)));
  assert.equal(plan.permissions[0]!.createdAt, permission.createdAt);
});

test("a replaced published inode is preserved as foreign and taints joined candidate custody", async () => {
  const root = await mkdtemp(join(tmpdir(), "browserdriver-m16-foreign-candidate-")), plan = parse(), permission = plan.permissions[0]!;
  const store = await sessionCandidateStore(root, plan), directory = (store as unknown as { directory: FileHandle }).directory;
  const sync = directory.sync.bind(directory), name = sessionCandidateFileName(permission.saveBinding);
  let calls = 0, replacement: Buffer | undefined;
  directory.sync = async () => {
    if (++calls === 1) {
      const path = join(root, name); replacement = await readFile(path);
      await fs.unlink(path); await writeFile(path, replacement, { mode: 0o600 });
    }
    await sync();
  };
  try {
    await assert.rejects(() => store.write(permission, "d".repeat(64), new Date().toISOString(), { cookies: [] }));
    assert.deepEqual(await readFile(join(root, name)), replacement);
    await assert.rejects(() => store.close(), { message: "invalid private session save configuration" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("exclusive-open collisions never own or unlink the existing temporary path", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "browserdriver-m16-collision-")), plan = parse(), store = await sessionCandidateStore(root, plan);
  const originalOpen = fs.open, originalUnlink = fs.unlink;
  let collidedPath = "", deletions = 0;
  t.mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
    if (String(args[0]).endsWith(".tmp")) {
      collidedPath = String(args[0]);
      const foreign = await originalOpen(args[0], "wx", 0o600); await foreign.writeFile("foreign-temporary-canary"); await foreign.close();
      throw Object.assign(new Error("exclusive collision"), { code: "EEXIST" });
    }
    return originalOpen(...args);
  });
  t.mock.method(fs, "unlink", async (path: Parameters<typeof fs.unlink>[0]) => { deletions += 1; return originalUnlink(path); });
  syncBuiltinESMExports();
  try {
    await assert.rejects(() => store.write(plan.permissions[0]!, "d".repeat(64), new Date().toISOString(), { cookies: [] }));
    assert.equal(deletions, 0); assert.equal(await readFile(collidedPath, "utf8"), "foreign-temporary-canary");
    await store.close();
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); await rm(root, { recursive: true, force: true }); }
});

test("temporary substitution before link or removal preserves foreign bytes and taints close", async (t) => {
  for (const phase of ["before-link", "before-removal"]) {
    const root = await mkdtemp(join(tmpdir(), "browserdriver-m16-temp-swap-")), plan = parse(), store = await sessionCandidateStore(root, plan);
    const originalOpen = fs.open, originalLink = fs.link, originalUnlink = fs.unlink;
    let replacedPath = "", invalidatedOwnedInode = false;
    const substitute = async (path: string) => {
      replacedPath = path; await originalUnlink(path);
      await writeFile(path, "foreign-replacement-canary", { mode: 0o600 });
    };
    if (phase === "before-link") {
      t.mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
        const handle = await originalOpen(...args);
        if (String(args[0]).endsWith(".tmp")) {
          const sync = handle.sync.bind(handle); let calls = 0;
          t.mock.method(handle, "sync", async () => {
            await sync();
            if (++calls === 1) await substitute(String(args[0]));
            else { assert.equal((await handle.stat()).size, 0); invalidatedOwnedInode = true; }
          });
        }
        return handle;
      });
    } else t.mock.method(fs, "link", async (...args: Parameters<typeof fs.link>) => { await originalLink(...args); await substitute(String(args[0])); });
    syncBuiltinESMExports();
    try {
      await assert.rejects(() => store.write(plan.permissions[0]!, "d".repeat(64), new Date().toISOString(), { cookies: [] }));
      assert.equal(await readFile(replacedPath, "utf8"), "foreign-replacement-canary");
      if (phase === "before-link") assert.equal(invalidatedOwnedInode, true);
      assert.ok(!(await readdir(root)).some(path => path.endsWith(".candidate.json")));
      await assert.rejects(() => store.close(), { message: "invalid private session save configuration" });
    } finally { t.mock.restoreAll(); syncBuiltinESMExports(); await rm(root, { recursive: true, force: true }); }
  }
});
