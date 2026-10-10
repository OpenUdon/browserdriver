import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { open, readFile } from "node:fs/promises";
import test from "node:test";

type Diagnostic = { version: string; inputState: string; category: string; termination: { state: string; exitCode: number | null; signal: string | null }; features: string[] };
const { classifyLaunchFailure, reduceLaunchFailure, isClosedLaunchFailure } = createRequire(import.meta.url)("../../scripts/m16-launch-diagnostics.cjs") as {
  classifyLaunchFailure(error: unknown): string; reduceLaunchFailure(error: unknown): Diagnostic; isClosedLaunchFailure(value: unknown): boolean;
};
test("synthetic launch diagnostics retain only closed categories without private exception prose", () => {
  for (const [message, expected] of [
    ["No usable sandbox private-cookie-canary", "sandbox_refused"],
    ["Authorization required secret-display-canary", "display_auth_refused"],
    ["error while loading shared libraries private-path-canary", "host_dependency_missing"],
    ["Executable doesn't exist secret-file-canary", "executable_unavailable"],
    ["Cannot allocate memory private-process-canary", "host_resource_unavailable"],
    ["Timeout 30000ms exceeded credential-canary", "launch_timeout"],
    ["Target page, context or browser has been closed value-canary", "closed_before_connection"],
    ["unclassified private-canary", "unknown_launch_failure"],
  ]) assert.equal(classifyLaunchFailure(new Error(message)), expected);
  assert.equal(classifyLaunchFailure({ get message() { throw new Error("getter-canary"); } }), "unknown_launch_failure");
  assert.equal(classifyLaunchFailure({ message: "x".repeat(65537) }), "unknown_launch_failure");
});

const generic = "browserType.launch: Target page, context or browser has been closed private-value-canary";
const terminated = (exitCode: string, signal: string, pid = "567") => `[pid=${pid}] <process did exit: exitCode=${exitCode}, signal=${signal}>`;
const reduce = (...lines: string[]) => {
  const result = reduceLaunchFailure(new Error(lines.join("\n")));
  assert.equal(isClosedLaunchFailure(result), true);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) < 2048);
  assert.ok(!JSON.stringify(result).includes("canary"));
  assert.ok(!JSON.stringify(result).includes("567"));
  return result;
};

test("generic Playwright close prefix preserves closed fatal features and exact termination despite duplicated call log", () => {
  const event = terminated("null", "SIGTRAP");
  const result = reduce(generic, "Browser logs:", "<launching> /private-canary/chrome --profile=private-value-canary",
    "[pid=567][err] chrome_crashpad_handler: --database is required private-cookie-canary", event,
    "Call log:", `  - ${event}`);
  assert.deepEqual(result.termination, { state: "signaled", exitCode: null, signal: "SIGTRAP" });
  assert.deepEqual(result.features, ["crashpad_database_required", "crashpad_handler_marker"]);
  assert.equal(result.category, "closed_before_connection");
  assert.deepEqual(reduce(generic, terminated("21", "null")).termination, { state: "exited", exitCode: 21, signal: null });
  assert.deepEqual(reduce(generic, terminated("0", "null")).termination, { state: "exited", exitCode: 0, signal: null });
  assert.deepEqual(reduce(generic, terminated("255", "null")).termination, { state: "exited", exitCode: 255, signal: null });
});

test("fatal feature masking exposes every fixed ID while command and cleanup decoys are ignored", () => {
  for (const [text, id] of [
    ["ProcessSingleton profile-private-canary", "profile_singleton_marker"],
    ["ENOENT mkdtemp /private-path-canary", "temp_directory_operation"],
    ["ENOSPC No space left on device quota-private-canary", "disk_space_marker"],
    ["EDQUOT Disk quota exceeded quota-private-canary", "disk_quota_marker"],
    ["Resource temporarily unavailable pthread_create private-canary", "memory_thread_marker"],
    ["No usable sandbox! private-canary", "sandbox_marker"],
    ["Failed to move to new namespace: Operation not permitted private-canary", "namespace_marker"],
    ["Missing X server or $DISPLAY private-canary", "display_marker"],
    ["Host system is missing dependencies private-canary", "dependency_marker"],
    ["Executable doesn't exist at /private-canary", "executable_marker"],
    ["Permission denied private-canary", "permission_marker"],
  ]) assert.ok(reduce(generic, `[pid=567][err] ${text}`).features.includes(id!));
  const decoy = reduce(generic, "<launching> /private-canary/chrome --note=crashpad_handler --database is required ProcessSingleton",
    "[pid=567] exception while removing /private-canary/No usable sandbox: Permission denied");
  assert.deepEqual(decoy.features, []);
  assert.equal(decoy.category, "closed_before_connection");
});

test("conflicting processes, malformed and truncated exit records retain uncertainty without partial values", () => {
  for (const [records, expected] of [
    [[terminated("21", "null"), terminated("22", "null")], "ambiguous"],
    [[terminated("21", "null"), terminated("21", "null", "568")], "ambiguous"],
    [[terminated("256", "null")], "malformed"],
    [[terminated("-1", "null")], "malformed"],
    [[terminated("01", "null")], "malformed"],
    [[terminated("null", "SIGPRIVATECANARY")], "malformed"],
    [[terminated("1", "SIGTRAP")], "malformed"],
    [[terminated("null", "null")], "malformed"],
    [[terminated("1", "null", "N/A")], "malformed"],
    [[terminated("1", "null", "private-canary")], "malformed"],
    [[terminated("1", "null", "0")], "malformed"],
    [["[pid=567] <process did exit: exitCode=null, signal=SIGTR"], "truncated"],
    [["[pid=567] <process did ex"], "truncated"],
    [[terminated("21", "null"), "[pid=567] <process did exit: exitCode="], "truncated"],
    [[terminated("21", "null"), terminated("256", "null")], "malformed"],
  ] as const) assert.deepEqual(reduce(generic, ...records).termination, { state: expected, exitCode: null, signal: null });
  assert.deepEqual(reduce(generic).termination, { state: "absent", exitCode: null, signal: null });
});

test("unavailable, malformed and oversize inputs never retain a parsed prefix or hash", () => {
  for (const [error, expected] of [
    [undefined, "unavailable"],
    [{ message: 5 }, "unavailable"],
    [{ get message() { throw new Error("private-canary"); } }, "unavailable"],
    [{ message: `private-canary\0${terminated("21", "null")}` }, "malformed"],
    [{ message: "private-canary\ud800" }, "malformed"],
    [{ message: `${generic}\n${terminated("21", "null")}\n${"x".repeat(65536)}` }, "oversize"],
    [{ message: `${generic}\n${"x".repeat(8193)}` }, "oversize"],
    [{ message: `${generic}\n${"\n".repeat(1024)}` }, "oversize"],
  ] as const) {
    const result = reduceLaunchFailure(error);
    assert.equal(isClosedLaunchFailure(result), true);
    assert.equal(result.inputState, expected);
    assert.equal(result.category, "unknown_launch_failure");
    assert.deepEqual(result.termination, { state: "absent", exitCode: null, signal: null });
    assert.deepEqual(result.features, []);
    assert.ok(!JSON.stringify(result).includes("canary"));
    assert.ok(!Object.keys(result).some(key => /hash|sha|message|stack|path|command/iu.test(key)));
  }
});

test("closed diagnostic schema rejects arbitrary fields, signals, feature IDs and inconsistent states", () => {
  const valid = reduce(generic, "[pid=567][err] No usable sandbox", terminated("null", "SIGABRT"));
  for (const invalid of [
    { ...valid, category: "private-canary" }, { ...valid, message: "private-canary" },
    { ...valid, version: "private-canary" }, { ...valid, inputState: "private-canary" },
    { ...valid, features: ["private-canary"] }, { ...valid, features: ["sandbox_marker", "sandbox_marker"] },
    { ...valid, features: ["sandbox_marker", "namespace_marker"] },
    { ...valid, termination: { ...valid.termination, signal: "SIGPRIVATECANARY" } },
    { ...valid, termination: { ...valid.termination, exitCode: 1 } },
    { ...valid, termination: { state: "exited", exitCode: 256, signal: null } },
    { ...valid, termination: { state: "exited", exitCode: 1.5, signal: null } },
    { ...valid, termination: { state: "absent", exitCode: 1, signal: null } },
    { ...valid, termination: { ...valid.termination, message: "private-canary" } },
    { ...valid, inputState: "oversize" }, { ...valid, features: null },
    Object.assign(Object.create({ toJSON: () => ({ message: "private-canary" }) }), valid),
    { ...valid, get category() { return "sandbox_refused"; } },
    { ...valid, features: Object.assign([...valid.features], { toJSON: () => "private-canary" }) },
  ]) assert.equal(isClosedLaunchFailure(invalid), false);
});

test("closed feature IDs and termination grammar are grounded in exact local installed sources without executing them", async () => {
  const tokens: Record<string, string> = {
    termination_record: "<process did exit: exitCode=${exitCode}, signal=${signal}>",
    crashpad_database_required: "--database is required", crashpad_handler_marker: "crashpad_handler",
    profile_singleton_marker: "ProcessSingleton", temp_directory_operation: "mkdtemp",
    disk_space_marker: "No space left on device", disk_quota_marker: "Disk quota exceeded",
    memory_thread_marker: "Resource temporarily unavailable", sandbox_marker: "No usable sandbox",
    namespace_marker: "Failed to move to new namespace", display_marker: "Missing X server",
    dependency_marker: "Host system is missing dependencies", executable_marker: "Executable doesn't exist",
    permission_marker: "Operation not permitted",
  };
  const grounding = JSON.parse(await readFile("docs/m16-launch-diagnostic-sources-v3.json", "utf8"));
  assert.equal(grounding.staticSourceOnly, true); assert.equal(grounding.notFailureCauseProof, true);
  assert.deepEqual(grounding.markers.map((entry: { id: string }) => entry.id).sort(), Object.keys(tokens).sort());
  for (const entry of grounding.markers) {
    assert.match(entry.sourceSHA256, /^[a-f0-9]{64}$/u);
    const token = Buffer.from(tokens[entry.id]!); assert.equal(entry.bytes, token.length);
    const file = await open(entry.source, "r");
    try {
      const bytes = Buffer.alloc(entry.bytes), read = await file.read(bytes, 0, bytes.length, entry.offset);
      assert.equal(read.bytesRead, bytes.length); assert.deepEqual(bytes, token);
    } finally { await file.close(); }
  }
});
