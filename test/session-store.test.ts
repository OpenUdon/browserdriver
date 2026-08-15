import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
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
