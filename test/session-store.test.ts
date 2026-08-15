import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DriverFailure } from "../src/protocol.js";
import { FileSessionStateStore, sessionStateFileName } from "../src/session-store.js";

test("opaque session references resolve only through driver-owned storage", async () => {
  const root = await mkdtemp(join(tmpdir(), "browserdriver-session-"));
  try {
    const reference = "vault://member/session/opaque-reference";
    const fileName = sessionStateFileName(reference);
    assert.equal(fileName.includes("member"), false);
    await writeFile(join(root, fileName), '{"cookies":[],"origins":[]}', { mode: 0o600 });
    const store = new FileSessionStateStore(root);
    assert.deepEqual(await store.load(reference), { cookies: [], origins: [] });
    await assert.rejects(() => store.load("base64:eyJjb29raWVzIjpbXX0="), (error: unknown) =>
      error instanceof DriverFailure && error.code === "session_expired");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
