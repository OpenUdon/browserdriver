import assert from "node:assert/strict";
import fs, { chmod, mkdir, mkdtemp, rename, rm, symlink, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DriverFailure } from "../src/protocol.js";
import { FileSessionStateStore, sessionStateFileName, sessionStateMetadataFailure } from "../src/session-store.js";

test("opaque session references resolve only through driver-owned storage", async () => {
  const root = await mkdtemp(join(tmpdir(), "browserdriver-session-"));
  try {
    const reference = "vault://member/session/opaque-reference";
    const fileName = sessionStateFileName(reference);
    assert.equal(fileName.includes("member"), false);
    await writeFile(join(root, fileName), '{"cookies":[],"origins":[]}', { mode: 0o600 });
    const store = new FileSessionStateStore(root, () => undefined);
    assert.deepEqual(await store.load(reference), { cookies: [], origins: [] });
    await assert.rejects(() => store.load("base64:eyJjb29raWVzIjpbXX0="), (error: unknown) =>
      error instanceof DriverFailure && error.code === "session_expired");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a session root reached through a symlinked parent remains contained", async (t) => {
  if (process.platform === "win32") t.skip("symlink behavior is platform-specific");
  const root = await mkdtemp(join(tmpdir(), "browserdriver-session-parent-"));
  try {
    const actualParent = join(root, "actual");
    const sessions = join(actualParent, "sessions");
    const alias = join(root, "alias");
    await mkdir(sessions, { recursive: true });
    await symlink(actualParent, alias, "dir");
    const reference = "vault://member/session/canonical-parent";
    await writeFile(join(sessions, sessionStateFileName(reference)), '{"cookies":[]}', { mode: 0o600 });
    const store = new FileSessionStateStore(join(alias, "sessions"));
    assert.deepEqual(await store.load(reference), { cookies: [] });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a session state symlink cannot escape the canonical root", async (t) => {
  if (process.platform === "win32") t.skip("symlink behavior is platform-specific");
  const root = await mkdtemp(join(tmpdir(), "browserdriver-session-escape-"));
  try {
    const sessions = join(root, "sessions");
    await mkdir(sessions);
    const outside = join(root, "outside.json");
    await writeFile(outside, '{"cookies":[]}', { mode: 0o600 });
    const reference = "vault://member/session/escape";
    await symlink(outside, join(sessions, sessionStateFileName(reference)));
    let diagnostic = "";
    const store = new FileSessionStateStore(sessions, (message) => { diagnostic += message; });
    await assert.rejects(() => store.load(reference), (error: unknown) =>
      error instanceof DriverFailure && error.code === "session_expired");
    assert.match(diagnostic, /escapes the canonical root/u);
    assert.equal(diagnostic.includes(outside), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("session state rejects permissive file modes with a safe diagnostic", async (t) => {
  if (typeof process.getuid !== "function") t.skip("POSIX ownership checks are unavailable");
  const root = await mkdtemp(join(tmpdir(), "browserdriver-session-mode-"));
  try {
    const reference = "vault://member/session/permissive";
    const path = join(root, sessionStateFileName(reference));
    await writeFile(path, '{"cookies":[]}', { mode: 0o600 });
    await chmod(path, 0o644);
    let diagnostic = "";
    const store = new FileSessionStateStore(root, (message) => { diagnostic += message; });
    await assert.rejects(() => store.load(reference), (error: unknown) =>
      error instanceof DriverFailure && error.code === "session_expired");
    assert.equal(diagnostic, "browserdriver session store: state file mode 0644 is too permissive\n");
    assert.equal(diagnostic.includes(reference), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("session state metadata rejects a file owned by another user", () => {
  assert.equal(sessionStateMetadataFailure({
    isFile: () => true,
    size: 2,
    mode: 0o100600,
    uid: 1002,
  }, 1003), "state file owner does not match the driver user");
});

test("invalid, missing, and oversize legacy state refuses without exposing content or binding", async () => {
  const root = await mkdtemp(join(tmpdir(), "browserdriver-session-denial-"));
  const reference = "private-binding-canary", path = join(root, sessionStateFileName(reference));
  let diagnostic = "";
  const store = new FileSessionStateStore(root, value => { diagnostic += value; });
  try {
    for (const data of ["private-state-canary", "[]", "null", "x".repeat((1 << 20) + 1)]) {
      await writeFile(path, data, { mode: 0o600 });
      await assert.rejects(() => store.load(reference), (error: unknown) => error instanceof DriverFailure && error.code === "session_expired");
    }
    await assert.rejects(() => store.load("unknown-private-binding"), (error: unknown) => error instanceof DriverFailure && error.code === "session_expired");
    assert.ok(!diagnostic.includes("canary")); assert.ok(!diagnostic.includes(reference)); assert.ok(!diagnostic.includes(root));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("legacy state reads are bounded and reject growth, replacement, mode and root races", async (t) => {
  for (const race of ["growth", "replacement", "mode", "root"]) {
    const base = await mkdtemp(join(tmpdir(), "browserdriver-session-race-")), root = join(base, "root"), moved = join(base, "previous");
    await mkdir(root, { mode: 0o700 });
    const binding = "private-race-binding", path = join(root, sessionStateFileName(binding));
    await writeFile(path, '{"cookies":[],"origins":[]}', { mode: 0o600 });
    const originalOpen = fs.open;
    let calls = 0, received = 0;
    t.mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
      const handle = await originalOpen(...args), read = handle.read.bind(handle);
      if (String(args[0]) !== path) return handle;
      t.mock.method(handle, "readFile", async () => assert.fail("unbounded readFile must not run"));
      // Observe real filesystem growth/substitution between bounded reads.
      t.mock.method(handle, "read", async (...readArgs: [Buffer, number, number, number]) => {
        const result = await (read as (buffer: Buffer, offset: number, length: number, position: number) => Promise<{ bytesRead: number; buffer: Buffer }>)(...readArgs);
        received += result.bytesRead;
        if (++calls === 1) {
          if (race === "growth") await writeFile(path, "x".repeat((1 << 20) + 4096), { mode: 0o600 });
          if (race === "replacement") { await rename(path, join(root, "old")); await writeFile(path, '{"cookies":[]}', { mode: 0o600 }); }
          if (race === "mode") await chmod(path, 0o644);
          if (race === "root") { await rename(root, moved); await mkdir(root, { mode: 0o700 }); await writeFile(path, '{"cookies":[]}', { mode: 0o600 }); }
        }
        return result;
      });
      return handle;
    });
    syncBuiltinESMExports();
    let diagnostic = "";
    try {
      await assert.rejects(() => new FileSessionStateStore(root, value => { diagnostic += value; }).load(binding),
        (error: unknown) => error instanceof DriverFailure && error.code === "session_expired");
      assert.ok(received <= (1 << 20) + 1); assert.ok(calls > 0);
      assert.ok(!diagnostic.includes(binding)); assert.ok(!diagnostic.includes(path));
    } finally { t.mock.restoreAll(); syncBuiltinESMExports(); await rm(base, { recursive: true, force: true }); }
  }
});
