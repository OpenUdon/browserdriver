import assert from "node:assert/strict";
import fs, { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";

const { publishPacket } = createRequire(import.meta.url)("../../scripts/m16-packet.cjs") as { publishPacket(path: string, packet: object): Promise<void> };

test("delayed request and ACK writers expose only complete fsynced final JSON", async (t) => {
  for (const direction of ["requests", "acks"]) {
    const base = await mkdtemp(join(tmpdir(), "m16-packet-delay-")), root = join(base, direction), final = join(root, "start.json");
    await mkdir(root, { mode: 0o700 });
    const packet = { version: `fixture-${direction}`, phase: "start", worker: { pid: 1, start: "10", uid: 1000 } };
    let release!: () => void, started!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; }), partial = new Promise<void>(resolve => { started = resolve; });
    const originalOpen = fs.open;
    t.mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
      const handle = await originalOpen(...args);
      if (String(args[0]).endsWith(".tmp")) t.mock.method(handle, "writeFile", async (data: Uint8Array) => {
        const bytes = Buffer.from(data), middle = Math.floor(bytes.length / 2);
        await handle.write(bytes.subarray(0, middle)); started(); await hold;
        await handle.write(bytes.subarray(middle));
      });
      return handle;
    });
    const publishing = publishPacket(final, packet);
    try {
      await partial;
      for (let attempt = 0; attempt < 3; attempt += 1) await assert.rejects(() => readFile(final), { code: "ENOENT" });
      const entries = await readdir(root); assert.equal(entries.length, 1); assert.ok(entries[0]!.endsWith(".tmp"));
      const incomplete = await readFile(join(root, entries[0]!), "utf8");
      assert.throws(() => JSON.parse(incomplete));
      release(); await publishing;
      assert.deepEqual(JSON.parse(await readFile(final, "utf8")), packet);
      assert.deepEqual(await readdir(root), ["start.json"]);
      const info = await lstat(final); assert.equal(info.mode & 0o777, 0o600); assert.equal(info.nlink, 1);
    } finally { release(); await publishing.catch(() => undefined); t.mock.restoreAll(); await rm(base, { recursive: true, force: true }); }
  }
});

test("final collisions and failed exclusive temp opens preserve foreign packet bytes", async (t) => {
  for (const collision of ["final", "temp"]) {
    const root = await mkdtemp(join(tmpdir(), "m16-packet-collision-")), final = join(root, "start.json");
    const originalOpen = fs.open, originalUnlink = fs.unlink;
    let foreign = final, foreignDeletes = 0;
    if (collision === "final") await writeFile(final, "foreign-packet", { mode: 0o600 });
    else t.mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
      if (String(args[0]).endsWith(".tmp")) {
        foreign = join(root, basename(String(args[0])));
        const file = await originalOpen(args[0], "wx", 0o600); await file.writeFile("foreign-packet"); await file.close();
        throw Object.assign(new Error("exclusive collision"), { code: "EEXIST" });
      }
      return originalOpen(...args);
    });
    t.mock.method(fs, "unlink", async (path: Parameters<typeof fs.unlink>[0]) => {
      if (basename(String(path)) === basename(foreign)) foreignDeletes += 1;
      return originalUnlink(path);
    });
    try {
      await assert.rejects(() => publishPacket(final, { phase: "start" }), { message: "private qualification packet publication failed" });
      assert.equal(await readFile(foreign, "utf8"), "foreign-packet"); assert.equal(foreignDeletes, 0);
      assert.deepEqual(await readdir(root), [basename(foreign)]);
    } finally { t.mock.restoreAll(); await rm(root, { recursive: true, force: true }); }
  }
});

test("substituted temporary packets are preserved; failed writer invalidates only its owned inode", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "m16-packet-swap-")), final = join(root, "reuse.json"), originalOpen = fs.open;
  let foreign = "", invalidated = false;
  t.mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
    const file = await originalOpen(...args);
    if (String(args[0]).endsWith(".tmp")) {
      const sync = file.sync.bind(file); let calls = 0;
      t.mock.method(file, "sync", async () => {
        await sync();
        if (++calls === 1) {
          foreign = join(root, basename(String(args[0]))); await fs.unlink(args[0]); await writeFile(foreign, "foreign-replacement", { mode: 0o600 });
        } else { assert.equal((await file.stat()).size, 0); invalidated = true; }
      });
    }
    return file;
  });
  try {
    await assert.rejects(() => publishPacket(final, { phase: "reuse" }), { message: "private qualification packet publication failed" });
    assert.equal(await readFile(foreign, "utf8"), "foreign-replacement"); assert.equal(invalidated, true);
    await assert.rejects(() => readFile(final), { code: "ENOENT" });
  } finally { t.mock.restoreAll(); await rm(root, { recursive: true, force: true }); }
});
