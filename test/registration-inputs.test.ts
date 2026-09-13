import assert from "node:assert/strict";
import test from "node:test";
import { validateRegistrationMessage } from "../src/registration.js";
import { inputIdentity, validateRegistrationInput } from "../src/registration-inputs.js";
import { DriverFailure, parseInput, type RegisterMessage } from "../src/protocol.js";
import { readRegistrationCheckpointResponse, readRegistrationInputResponse } from "../src/driver.js";
import { inputRequest, revisedInput } from "./registration-input-fixture.js";

test("v5 accepts typed registration and refuses legacy or malformed definitions before browser work", () => {
  assert.equal(validateRegistrationMessage(inputRequest()).sequence.length, 17);
  const cases: Record<string, (r: RegisterMessage) => void> = {
    legacy: r => { r.version = "udon.browser-driver.v4"; },
    oldProfile: r => { r.profile.profile = "uws.browser-registration.1.0"; },
    environmentMix: r => { r.credentialEnvironment = { member_id: "PRIVATE" }; },
    missingSnapshot: r => { delete r.input; },
    wrongSnapshot: r => { r.input!.profileSha256 = "b".repeat(64); },
    wrongFlow: r => { r.input!.registrationType = "other"; },
    missingRequired: r => { r.input!.values.name = null; },
    falseRequired: r => { r.input!.values.name = false; },
    fraction: r => { r.input!.values.quantity = 0.5; },
    outOfBounds: r => { r.input!.values.ratio = 1.01; },
    arbitraryChoice: r => { r.input!.values.kind = "private-choice"; },
    undeclared: r => { r.input!.values.unreviewed = "value"; },
    duplicateSlot: r => { r.profile.inputSlots!.identifier = r.profile.inputSlots!.name!; },
    recursiveCondition: r => { r.profile.inputSlots!.company!.requiredWhen!.slot = "company"; },
    privateCondition: r => { r.profile.inputSlots!.company!.requiredWhen!.slot = "identifier"; },
    conditionNotChoice: r => { r.profile.inputSlots!.company!.requiredWhen!.equals = "unknown"; },
    invalidEnum: r => { r.profile.inputSlots!.ratio!.enum = [false]; },
    invalidBounds: r => { r.profile.inputSlots!.name!.minimum = 1; },
    unapprovedFill: r => { r.profile.flows.member!.sequence.splice(0, 1); },
    afterSubmit: r => { r.profile.flows.member!.sequence.push({ input_checkpoint: { id: "late", slots: ["name"] } }); },
    unappliedCondition: r => { r.profile.flows.member!.sequence[11] = { input_checkpoint: { id: "details", slots: ["kind", "phone", "updates"] } }; },
    unknownMacro: r => { (r.profile.flows.member!.sequence as unknown[])[6] = { upload: "private" }; },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const request = inputRequest(); mutate(request);
    assert.throws(() => validateRegistrationMessage(request), DriverFailure, name);
  }
  for (const version of ["udon.browser-driver.v2", "udon.browser-driver.v3", "udon.browser-driver.v4"]) {
    assert.throws(() => validateRegistrationMessage({ ...inputRequest(), version } as RegisterMessage), DriverFailure);
  }
  assert.throws(() => parseInput(JSON.stringify({ ...inputRequest(), credentialEnvironment: {} })), DriverFailure);
});

test("input revisions preserve bound identity, checkpoint scope and private snapshot identity", () => {
  const request = inputRequest(), before = request.input!, current = revisedInput(request);
  assert.equal(validateRegistrationInput(request, current, "details", before).values.updates, false);
  for (const [name, mutate] of Object.entries({
    stale: (r: typeof current) => { r.revision = 1; },
    identifier: (r: typeof current) => { r.values.identifier = "different@example.invalid"; },
    password: (r: typeof current) => { r.values.password = "changed"; },
    outside: (r: typeof current) => { r.values.name = "changed"; },
  })) {
    const changed = structuredClone(current); mutate(changed);
    assert.throws(() => validateRegistrationInput(request, changed, "details", before), DriverFailure, name);
  }
  assert.throws(() => validateRegistrationInput(request, current, "details"), DriverFailure);
  const accepted = validateRegistrationInput(request, current, "details", before);
  const identity = inputIdentity(accepted);
  current.values.password = "changed-after-acceptance";
  assert.deepEqual(inputIdentity(accepted), identity);
  assert.notDeepEqual(inputIdentity(current), identity);
  assert.deepEqual(inputIdentity({ ...accepted, values: Object.fromEntries(Object.entries(accepted.values).reverse()) }), identity);
});

test("own-property lookup keeps constructor-named required inputs required", () => {
  const request = inputRequest();
  Object.defineProperty(request.profile.inputSlots!, "constructor", { value: request.profile.inputSlots!.name!, enumerable: true });
  const first = request.profile.flows.member!.sequence[0]!;
  assert.ok("input_checkpoint" in first); first.input_checkpoint.slots.push("constructor");
  request.profile.flows.member!.sequence.splice(11, 0, { fill_input: { slot: "constructor", locator: { role: "textbox", name: "Constructor" }, control: "fill" } });
  assert.throws(() => validateRegistrationMessage(request), DriverFailure);
  Object.defineProperty(request.input!.values, "constructor", { value: "synthetic value", enumerable: true });
  assert.doesNotThrow(() => validateRegistrationMessage(request));
});

test("private checkpoint responses reject substitution and explicit Stop denies input", async () => {
  const request = inputRequest(), binding = inputIdentity(request.input!);
  const line = (value: object) => ({ next: async () => ({ done: false as const, value: JSON.stringify(value) }) });
  const response = { version: request.version, type: "registration_checkpoint_response", requestId: request.requestId, checkpointId: "submit", decision: "continue", ...binding };
  await readRegistrationCheckpointResponse(line(response), request.requestId, "submit", 100, request.version, binding);
  for (const changed of [{ ...response, inputSha256: "b".repeat(64) }, { ...response, inputRevision: 2 }, { ...response, version: "udon.browser-driver.v4" }]) {
    await assert.rejects(() => readRegistrationCheckpointResponse(line(changed), request.requestId, "submit", 100, request.version, binding), DriverFailure);
  }
  await assert.rejects(() => readRegistrationInputResponse(line({ version: request.version, type: "registration_input_response", requestId: request.requestId, checkpointId: "details", decision: "stop" }), request, "details", 100, request.input!), (error: unknown) => error instanceof DriverFailure && error.code === "registration_checkpoint_denied");
  const accepted = await readRegistrationInputResponse(line({ version: request.version, type: "registration_input_response", requestId: request.requestId, checkpointId: "details", decision: "apply", input: revisedInput(request) }), request, "details", 100, request.input!);
  assert.equal(accepted.revision, 2);
});


test("an elapsed advertised deadline cannot accept a queued checkpoint answer", async () => {
  const request = inputRequest();
  let reads = 0;
  const source = { next: async () => { reads++; return { done: true as const, value: undefined }; } };
  const timedOut = (error: unknown) => error instanceof DriverFailure && error.code === "registration_checkpoint_timeout";
  await assert.rejects(() => readRegistrationCheckpointResponse(source, request.requestId, "checkpoint", 120_000, request.version, undefined, Date.now() - 1), timedOut);
  await assert.rejects(() => readRegistrationInputResponse(source, request, "details", 120_000, request.input!, Date.now() - 1), timedOut);
  assert.equal(reads, 0);
});


test("checkpoint response parsing cannot accept a reply after its deadline", async () => {
  const request = inputRequest();
  const source = { next: async () => {
    await new Promise(resolve => setTimeout(resolve, 15));
    return { done: false as const, value: JSON.stringify({version:request.version,type:"registration_checkpoint_response",requestId:request.requestId,checkpointId:"checkpoint",decision:"continue"}) };
  } };
  await assert.rejects(() => readRegistrationCheckpointResponse(source, request.requestId, "checkpoint", 120_000, request.version, undefined, Date.now() + 5),
    (error: unknown) => error instanceof DriverFailure && error.code === "registration_checkpoint_timeout");
});
