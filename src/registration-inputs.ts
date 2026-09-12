import { createHash } from "node:crypto";
import {
  DriverFailure, type RegisterMessage, type RegistrationFlow, type RegistrationInput,
  type RegistrationInputSlot, type RegistrationScalar,
} from "./protocol.js";

const own = (value: object, key: string): boolean => Object.hasOwn(value, key);
const slotValue = (values: Record<string, RegistrationScalar>, key: string): RegistrationScalar => own(values, key) ? values[key] ?? null : null;
function bad(): never { throw new DriverFailure("invalid_response"); }
const id = (value: unknown): void => { if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,127}$/u.test(value)) bad(); };
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) bad();
  return value as Record<string, unknown>;
}
function closed(value: Record<string, unknown>, allowed: string[], required: string[] = allowed): void {
  if (Object.keys(value).some(key => !allowed.includes(key)) || required.some(key => !own(value, key))) bad();
}
function scalar(kind: string, value: unknown): boolean {
  if (kind === "string") return typeof value === "string" && [...value].length <= 4096;
  if (kind === "boolean") return typeof value === "boolean";
  return (kind === "number" || kind === "integer") && typeof value === "number" && Number.isFinite(value) &&
    Math.abs(value) <= Number.MAX_SAFE_INTEGER && (kind !== "integer" || Number.isInteger(value));
}
function fieldValue(field: RegistrationInputSlot, value: unknown, checkEnum = true): boolean {
  if (!scalar(field.type, value) || checkEnum && field.enum && !field.enum.includes(value as never)) return false;
  if (typeof value === "string" && (field.minLength !== undefined && [...value].length < field.minLength || field.maxLength !== undefined && [...value].length > field.maxLength)) return false;
  if (typeof value === "number" && (field.minimum !== undefined && value < field.minimum || field.maximum !== undefined && value > field.maximum)) return false;
  return true;
}

export function validateInputDefinitions(profile: Record<string, unknown>): void {
  const fields = object(profile.inputSlots), credentials = object(profile.credentialSlots);
  if (Object.keys(fields).length < 1 || Object.keys(fields).length + Object.keys(credentials).length > 64) bad();
  for (const [name, raw] of Object.entries(fields)) {
    id(name);
    if (own(credentials, name)) bad();
    const field = object(raw);
    closed(field, ["type", "label", "required", "requiredWhen", "enum", "minLength", "maxLength", "minimum", "maximum"], ["type", "label"]);
    if (!["string", "boolean", "integer", "number"].includes(String(field.type)) || typeof field.label !== "string" || [...field.label].length < 1 || [...field.label].length > 256 || own(field, "required") === own(field, "requiredWhen")) bad();
    if (own(field, "required") && typeof field.required !== "boolean") bad();
    for (const key of ["minLength", "maxLength"]) if (own(field, key) && (field.type !== "string" || !Number.isInteger(field[key]) || Number(field[key]) < 0 || Number(field[key]) > 4096)) bad();
    for (const key of ["minimum", "maximum"]) if (own(field, key) && (!["number", "integer"].includes(String(field.type)) || !scalar("number", field[key]))) bad();
    if (field.minLength !== undefined && field.maxLength !== undefined && Number(field.minLength) > Number(field.maxLength) || field.minimum !== undefined && field.maximum !== undefined && Number(field.minimum) > Number(field.maximum)) bad();
    if (own(field, "enum")) {
      if (!Array.isArray(field.enum) || field.enum.length < 1 || field.enum.length > 64 || new Set(field.enum).size !== field.enum.length) bad();
      for (const value of field.enum) if (!fieldValue(field as unknown as RegistrationInputSlot, value, false)) bad();
    }
    if (own(field, "requiredWhen")) {
      const condition = object(field.requiredWhen);
      closed(condition, ["slot", "equals"]);
      id(condition.slot);
      if (condition.slot === name || !own(fields, String(condition.slot))) bad();
      const parent = object(fields[String(condition.slot)]);
      if (parent.required !== true || own(parent, "requiredWhen") || !Array.isArray(parent.enum) || !parent.enum.includes(condition.equals)) bad();
    }
  }
}

export function validateInputSequence(profile: Record<string, unknown>, rawFlow: Record<string, unknown>): void {
  const fields = object(profile.inputSlots), credentials = object(profile.credentialSlots);
  const flow = rawFlow as unknown as RegistrationFlow;
  if (!flow.sequence[0] || !("input_checkpoint" in flow.sequence[0])) bad();
  const loaded = new Set<string>(), pending = new Set<string>(), used = new Set<string>(), checkpoints = new Set<string>();
  let submitted = false;
  for (const step of flow.sequence) {
    if ("input_checkpoint" in step) {
      const cp = step.input_checkpoint;
      if (submitted || checkpoints.has(cp.id) || pending.size) bad();
      checkpoints.add(cp.id);
      for (const slot of cp.slots) {
        if (!own(fields, slot) && !own(credentials, slot)) bad();
        loaded.add(slot); pending.add(slot);
      }
      for (const slot of loaded) {
        const condition = (own(fields, slot) ? fields[slot] as RegistrationInputSlot : undefined)?.requiredWhen;
        if (condition && (!loaded.has(condition.slot) || pending.has(condition.slot) && !pending.has(slot))) bad();
      }
    }
    const fill = "fill_input" in step ? step.fill_input : "type_credential" in step ? step.type_credential : undefined;
    if (fill) {
      if (submitted || !loaded.has(fill.slot)) bad();
      used.add(fill.slot); pending.delete(fill.slot);
      if ("fill_input" in step) {
        if (!own(fields, fill.slot)) bad();
        const field = fields[fill.slot] as RegistrationInputSlot;
        const control = step.fill_input.control;
        if (!(control === "fill" && ["string", "number", "integer"].includes(field.type) || control === "check" && field.type === "boolean" || control === "select" && field.type === "string" && field.enum?.length)) bad();
      }
    }
    if ("submit" in step) { if (pending.size) bad(); submitted = true; }
  }
  if ([...loaded].some(slot => !used.has(slot))) bad();
}

function flowSlots(flow: RegistrationFlow): Set<string> {
  return new Set(flow.sequence.flatMap(step => "input_checkpoint" in step ? step.input_checkpoint.slots : []));
}

// Validate independently of Udon. Return a detached copy so subsequent caller
// mutation cannot alter credentials or the snapshot used by submit approval.
export function validateRegistrationInput(request: RegisterMessage, value: unknown, checkpoint: string, previous?: RegistrationInput): RegistrationInput {
  const input = object(value);
  closed(input, ["version", "profileSha256", "registrationType", "revision", "values"]);
  if (input.version !== "uws.browser-registration-input.1.0" || input.profileSha256 !== request.sourceDigest.slice(7) || input.registrationType !== request.flow || !Number.isSafeInteger(input.revision) || Number(input.revision) < 1) bad();
  const values: Record<string, unknown> = Object.assign(Object.create(null), object(input.values)), flow = request.profile.flows[request.flow];
  if (!flow || Object.keys(values).length > 64) bad();
  const allowed = flowSlots(flow), fields = request.profile.inputSlots!;
  for (const [slot, current] of Object.entries(values)) {
    if (!allowed.has(slot)) bad();
    if (current === null) continue;
    if (own(fields, slot) ? !fieldValue(fields[slot]!, current) : !scalar("string", current) || current === "") bad();
  }
  const checkpoints = flow.sequence.flatMap(step => "input_checkpoint" in step ? [step.input_checkpoint] : []);
  const cp = checkpoints.find(item => item.id === checkpoint);
  if (!cp || !previous && cp !== checkpoints[0]) bad();
  for (const slot of cp.slots) {
    const field = own(fields, slot) ? fields[slot] : undefined;
    if (field?.requiredWhen && values[field.requiredWhen.slot] == null) bad();
    const required = !field || (field.requiredWhen ? values[field.requiredWhen.slot] === field.requiredWhen.equals : field.required);
    if (required && values[slot] == null) bad();
  }
  if (previous) {
    if (Number(input.revision) <= previous.revision) bad();
    for (const slot of allowed) {
      if ((!cp.slots.includes(slot) || own(request.profile.credentialSlots, slot) && slotValue(previous.values, slot) != null) && (values[slot] ?? null) !== slotValue(previous.values, slot)) bad();
    }
  }
  return structuredClone(input) as unknown as RegistrationInput;
}

export function inputValue(request: RegisterMessage, input: RegistrationInput, slot: string): RegistrationScalar {
  const field = request.profile.inputSlots![slot]!;
  if (field.requiredWhen && slotValue(input.values, field.requiredWhen.slot) !== field.requiredWhen.equals) return null;
  return slotValue(input.values, slot);
}

// Sorted scalar-only canonical form shared with the trusted Udon adapter.
// This identity remains confined to private execution channels.
export function inputIdentity(input: RegistrationInput): { inputRevision: number; inputSha256: string } {
  const parts = [input.version, input.profileSha256, input.registrationType, String(input.revision)];
  for (const [key, value] of Object.entries(input.values).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    let encoded: string;
    if (typeof value === "string") encoded = `s${Buffer.from(value, "utf8").toString("hex")}`;
    else if (typeof value === "number") { const number = Buffer.alloc(8); number.writeDoubleBE(value === 0 ? 0 : value); encoded = `d${number.toString("hex")}`; }
    else encoded = value === null ? "n" : value ? "t" : "f";
    parts.push(key, encoded);
  }
  return { inputRevision: input.revision, inputSha256: createHash("sha256").update(parts.join("\n")).digest("hex") };
}
