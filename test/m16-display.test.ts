import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import test from "node:test";

type Identity = { pid: number; start: string; uid: number };
const { xauthority, isPlannedDisplayStop, assertChromiumTmpdirBound } = createRequire(import.meta.url)("../../scripts/m16-display.cjs") as {
  xauthority(hostname: string, displayNumber: string, cookie: Buffer): Buffer;
  isPlannedDisplayStop(record: Identity & { purpose: string; signal: string; state: string; controllerSignal?: string }, display: Identity): boolean;
  assertChromiumTmpdirBound(tmpdir: string): void;
};

test("private Xauthority encoding is independently read by installed Xau without cookie output", () => {
  const encoded = xauthority("fixture-host", "116", Buffer.alloc(16, 1));
  const result = spawnSync("/usr/bin/python3.14", ["-c", `
import ctypes as c, sys
data = bytes.fromhex(sys.stdin.read())
class Xauth(c.Structure):
    _fields_ = [('family', c.c_ushort), ('address_length', c.c_ushort), ('address', c.c_void_p), ('number_length', c.c_ushort), ('number', c.c_void_p), ('name_length', c.c_ushort), ('name', c.c_void_p), ('data_length', c.c_ushort), ('data', c.c_void_p)]
libc = c.CDLL(None); libc.fmemopen.argtypes = [c.c_void_p, c.c_size_t, c.c_char_p]; libc.fmemopen.restype = c.c_void_p
libc.fclose.argtypes = [c.c_void_p]
xau = c.CDLL('libXau.so.6'); xau.XauReadAuth.argtypes = [c.c_void_p]; xau.XauReadAuth.restype = c.POINTER(Xauth); xau.XauDisposeAuth.argtypes = [c.POINTER(Xauth)]
buffer = c.create_string_buffer(data); stream = libc.fmemopen(buffer, len(data), b'rb'); record = xau.XauReadAuth(stream)
if not record: sys.exit(1)
a = record.contents
valid = a.family == 256 and c.string_at(a.address, a.address_length) == b'fixture-host' and c.string_at(a.number, a.number_length) == b'116' and c.string_at(a.name, a.name_length) == b'MIT-MAGIC-COOKIE-1' and a.data_length == 16 and c.string_at(a.data, a.data_length) == bytes([1]) * 16
xau.XauDisposeAuth(record); libc.fclose(stream)
print('verified' if valid else 'refused'); sys.exit(0 if valid else 1)
`], { input: encoded.toString("hex"), encoding: "utf8", env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" } });
  assert.equal(result.status, 0); assert.equal(result.stdout, "verified\n"); assert.equal(result.stderr, "");
});

test("Chromium singleton socket reserve refuses equality at108bytes and counts multibyte paths as UTF8", () => {
  for (const tmpdir of ["/dev/shm/bdm16-v4/tmp", `/${"a".repeat(42)}`, `/${"é".repeat(21)}`, `/${"😀".repeat(10)}ab`]) {
    assert.doesNotThrow(() => assertChromiumTmpdirBound(tmpdir));
  }
  for (const tmpdir of [`/${"a".repeat(43)}`, `/${"é".repeat(20)}abc`, `/${"😀".repeat(10)}abc`,
    "/dev/shm/kinet-stage12-leases-f8qot0xc/resources/browserdriver/m16-approved-fixture-20261010-v3/tmp"]) {
    assert.throws(() => assertChromiumTmpdirBound(tmpdir), { message: "M16 private temporary directory exceeds socket budget" });
  }
  // These strings have fewer than44 JS code units but exactly44 UTF8 bytes.
  assert.equal(`/${"é".repeat(20)}abc`.length < 44, true);
  assert.equal(`/${"😀".repeat(10)}abc`.length < 44, true);
});

test("only the declared normal display pidfd stop may qualify; browser and escalation signals refuse", () => {
  const display = { pid: 10, start: "100", uid: 1000 }, normal = { ...display, purpose: "normal-display-stop", signal: "SIGTERM", state: "sent" };
  assert.equal(isPlannedDisplayStop(normal, display), true);
  for (const change of [{ pid: 11 }, { start: "900" }, { uid: 0 }, { purpose: "timeout" }, { purpose: "cancel" },
    { signal: "SIGKILL" }, { state: "signal-refused" }, { controllerSignal: "SIGALRM" }]) {
    assert.equal(isPlannedDisplayStop({ ...normal, ...change }, display), false);
  }
});
