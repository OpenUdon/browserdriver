import { createHash, randomBytes } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { lstat, open, readdir, realpath, link, unlink, type FileHandle } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { AuthenticateMessage, LegacyProtocolVersion } from "./protocol.js";

export const maxSessionSavePlanBytes = 256 << 10;
export const maxSessionCandidateBytes = 1 << 20;
export const defaultSessionMaxAgeSeconds = 604_800;
export const maxSessionMaxAgeSeconds = 2_592_000;

export interface SessionSavePermission {
  readonly permissionId: string;
  readonly authenticate: Readonly<{
    version: LegacyProtocolVersion; operationId: string; sourceDigest: string;
    flow: string; session: string; sessionBinding: string | null;
  }>;
  readonly authenticationRequestSHA256: string;
  readonly saveBinding: string;
  readonly bindingSHA256: string;
  readonly generation: number;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly maxAgeSeconds: number;
}
export interface SessionSavePlan {
  readonly version: "browserdriver.session-save-plan.v1";
  readonly launchNonce: string;
  readonly admittedDeadline: string;
  readonly permissions: readonly Readonly<SessionSavePermission>[];
}
export interface SessionCandidateStore {
  write(permission: Readonly<SessionSavePermission>, planSHA256: string, capturedAt: string, storageState: object): Promise<void>;
  close(): Promise<void>;
}
export interface SessionSaveOptions {
  readonly plan: Readonly<SessionSavePlan>;
  readonly planSHA256: string;
  readonly candidates: SessionCandidateStore;
}

export async function sessionSaveConfiguration(planPath?: string, root?: string, loadRoot?: string): Promise<SessionSaveOptions | undefined> {
  if (planPath === undefined && root === undefined) return undefined;
  if (planPath === undefined || root === undefined) invalid();
  const { plan, planSHA256 } = await sessionSavePlan(planPath);
  const candidates = await sessionCandidateStore(root, plan, loadRoot);
  return Object.freeze({ plan, planSHA256, candidates });
}

// Private diagnostics are deliberately constant: errors must never reveal paths,
// bindings, storage state, credential maps or underlying filesystem prose.
function invalid(): never { throw new Error("invalid private session save configuration"); }
export function sessionCandidateFileName(binding: string): string {
  privateString(binding);
  return `${sha256(binding)}.candidate.json`;
}
function sha256(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function fields(value: Record<string, unknown>, required: string[], optional: string[] = []): void {
  if (required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) invalid();
}
function privateString(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value || value.length > 4096 || /[\u0000-\u001f\u007f]/u.test(value) || !value.isWellFormed()) invalid();
}
function id(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)) invalid();
}
function digest(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) invalid();
}
function integer(value: unknown, maximum: number): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > maximum) invalid();
}
// Accept UTC seconds, JS's exact millisecond ISO form, or RFC3339Nano's
// non-zero-terminated fraction. Compare at nanosecond precision without renewal.
function timestamp(value: unknown): bigint {
  if (typeof value !== "string") invalid();
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/u.exec(value);
  if (!match) invalid();
  const base = Date.parse(`${match[1]}Z`);
  if (!Number.isFinite(base) || new Date(base).toISOString() !== `${match[1]}.000Z`) invalid();
  const fraction = match[2] ?? "";
  if (fraction && fraction.length !== 3 && fraction.endsWith("0")) invalid();
  return BigInt(base) * 1_000_000n + BigInt(fraction.padEnd(9, "0"));
}
export function assertSessionSaveCurrent(plan: Readonly<SessionSavePlan>, permission: Readonly<SessionSavePermission>, now = Date.now()): void {
  const current = BigInt(now) * 1_000_000n;
  if (current >= timestamp(plan.admittedDeadline) || current >= timestamp(permission.expiresAt) || current < timestamp(permission.createdAt)) invalid();
}

// Scan each object independently before JSON.parse; a reviver cannot detect
// overwritten duplicate keys. Bound depth, Unicode and UTF8 before decoding.
function strictJSON(data: Buffer): unknown {
  if (data.length < 2 || data.length > maxSessionSavePlanBytes) invalid();
  let input: string;
  try { input = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(data); } catch { invalid(); }
  let offset = 0;
  const space = (): void => { while (/[ \t\r\n]/u.test(input[offset] ?? "x")) offset += 1; };
  const string = (): string => {
    const start = offset++;
    while (offset < input.length) {
      const char = input[offset++];
      if (char === "\\") offset += 1;
      else if (char === '"') {
        let value: unknown;
        try { value = JSON.parse(input.slice(start, offset)); } catch { invalid(); }
        if (typeof value !== "string" || !value.isWellFormed()) invalid();
        return value;
      }
    }
    invalid();
  };
  const value = (depth: number): void => {
    if (depth > 32) invalid();
    space();
    const char = input[offset];
    if (char === '"') { string(); return; }
    if (char === "{" || char === "[") {
      offset += 1;
      space();
      const end = char === "{" ? "}" : "]";
      const keys = new Set<string>();
      if (input[offset] === end) { offset += 1; return; }
      for (;;) {
        space();
        if (char === "{") {
          if (input[offset] !== '"') invalid();
          const key = string();
          if (keys.has(key)) invalid();
          keys.add(key); space();
          if (input[offset++] !== ":") invalid();
        }
        value(depth + 1); space();
        if (input[offset] === end) { offset += 1; return; }
        if (input[offset++] !== ",") invalid();
      }
    }
    const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u.exec(input.slice(offset));
    if (!token) invalid();
    offset += token[0].length;
  };
  value(0); space();
  if (offset !== input.length) invalid();
  try { return JSON.parse(input); } catch { invalid(); }
}

export function parseSessionSavePlan(data: Buffer, now = Date.now()): Readonly<SessionSavePlan> {
  const plan = record(strictJSON(data));
  fields(plan, ["version", "launchNonce", "admittedDeadline", "permissions"]);
  if (plan.version !== "browserdriver.session-save-plan.v1") invalid();
  id(plan.launchNonce);
  if (timestamp(plan.admittedDeadline) <= BigInt(now) * 1_000_000n) invalid();
  if (!Array.isArray(plan.permissions) || plan.permissions.length > 100) invalid();
  const ids = new Set<string>(), tuples = new Set<string>(), bindings = new Set<string>();
  for (const raw of plan.permissions) {
    const permission = record(raw);
    fields(permission, ["permissionId", "authenticate", "authenticationRequestSHA256", "saveBinding", "bindingSHA256", "generation", "createdAt", "expiresAt"], ["maxAgeSeconds"]);
    id(permission.permissionId);
    const auth = record(permission.authenticate);
    fields(auth, ["version", "operationId", "sourceDigest", "flow", "session", "sessionBinding"]);
    if (!["udon.browser-driver.v2", "udon.browser-driver.v3", "udon.browser-driver.v10", "udon.browser-driver.v11"].includes(auth.version as string)) invalid();
    privateString(auth.operationId); privateString(auth.flow); privateString(auth.session);
    if (typeof auth.sourceDigest !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(auth.sourceDigest)) invalid();
    if (auth.sessionBinding !== null) privateString(auth.sessionBinding);
    digest(permission.authenticationRequestSHA256); privateString(permission.saveBinding); digest(permission.bindingSHA256);
    integer(permission.generation, Number.MAX_SAFE_INTEGER);
    const maxAge = Object.hasOwn(permission, "maxAgeSeconds") ? permission.maxAgeSeconds : defaultSessionMaxAgeSeconds;
    integer(maxAge, maxSessionMaxAgeSeconds);
    permission.maxAgeSeconds = maxAge;
    if (timestamp(permission.expiresAt) - timestamp(permission.createdAt) !== BigInt(maxAge) * 1_000_000_000n) invalid();
    assertSessionSaveCurrent(plan as unknown as SessionSavePlan, permission as unknown as SessionSavePermission, now);
    const tuple = JSON.stringify([auth.version, auth.operationId, auth.sourceDigest, auth.flow, auth.session, auth.sessionBinding]);
    if (ids.has(permission.permissionId) || tuples.has(tuple) || bindings.has(permission.saveBinding)) invalid();
    ids.add(permission.permissionId); tuples.add(tuple); bindings.add(permission.saveBinding);
    Object.freeze(auth); Object.freeze(permission);
  }
  Object.freeze(plan.permissions);
  return Object.freeze(plan) as unknown as Readonly<SessionSavePlan>;
}

export function authenticationRequestSHA256(request: AuthenticateMessage): string {
  function canonical(value: unknown, depth = 0): string {
    if (depth > 64) invalid();
    if (typeof value === "string") { if (!value.isWellFormed()) invalid(); return JSON.stringify(value); }
    if (value === null || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(entry => canonical(entry, depth + 1)).join(",")}]`;
    const object = record(value);
    const keys = Object.keys(object).sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
    return `{${keys.map(key => `${canonical(key)}:${canonical(object[key], depth + 1)}`).join(",")}}`;
  }
  const { requestId: _requestId, ...complete } = request;
  return sha256(canonical(complete));
}

function owner(): number {
  if (process.platform !== "linux" || typeof process.getuid !== "function") invalid();
  return process.getuid();
}
function metadata(info: Stats, directory: boolean, mode: number): void {
  if ((directory ? !info.isDirectory() : !info.isFile()) || info.uid !== owner() || (info.mode & 0o777) !== mode || (!directory && info.nlink !== 1)) invalid();
}
function same(left: Stats, right: Stats): boolean { return left.dev === right.dev && left.ino === right.ino; }
function contained(left: string, right: string): boolean {
  const path = relative(left, right);
  return path === "" || path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}
async function stablePath(path: string): Promise<void> {
  if (!isAbsolute(path) || resolve(path) !== path || await realpath(path) !== path) invalid();
}

export async function sessionSavePlan(path: string, now = Date.now()): Promise<{ plan: Readonly<SessionSavePlan>; planSHA256: string }> {
  await stablePath(path);
  await stablePath(dirname(path));
  const parent = await lstat(dirname(path));
  metadata(parent, true, 0o700);
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await handle.stat(); metadata(before, false, 0o600);
    if (before.size < 2 || before.size > maxSessionSavePlanBytes) invalid();
    const buffer = Buffer.alloc(maxSessionSavePlanBytes + 1);
    let length = 0;
    while (length < buffer.length) {
      const result = await handle.read(buffer, length, buffer.length - length, length);
      if (result.bytesRead === 0) break;
      length += result.bytesRead;
    }
    const after = await handle.stat();
    const pathInfo = await lstat(path);
    await stablePath(path);
    if (!same(before, after) || !same(before, pathInfo) || before.size !== after.size || length !== before.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || !same(parent, await lstat(dirname(path)))) invalid();
    metadata(after, false, 0o600); metadata(pathInfo, false, 0o600);
    const data = buffer.subarray(0, length);
    return { plan: parseSessionSavePlan(data, now), planSHA256: sha256(data) };
  } finally { await handle.close(); }
}

export async function sessionCandidateStore(root: string, plan: Readonly<SessionSavePlan>, loadRoot?: string): Promise<SessionCandidateStore> {
  await stablePath(root);
  const pathInfo = await lstat(root); metadata(pathInfo, true, 0o700);
  if ((await readdir(root)).length !== 0) invalid();
  if (loadRoot !== undefined) {
    const old = await realpath(resolve(loadRoot));
    if (contained(old, root) || contained(root, old)) invalid();
  }
  const handle = await open(root, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    metadata(info, true, 0o700);
    await stablePath(root);
    if (!same(pathInfo, info) || !same(info, await lstat(root))) invalid();
    return new FileSessionCandidateStore(root, handle, info, plan);
  } catch (error) {
    await handle.close();
    throw error;
  }
}

class FileSessionCandidateStore implements SessionCandidateStore {
  private closed = false;
  private unsafe = false;
  private pending = Promise.resolve();
  private closing: Promise<void> | undefined;
  constructor(private readonly root: string, private readonly directory: FileHandle, private readonly identity: Stats, private readonly plan: Readonly<SessionSavePlan>) {}

  write(permission: Readonly<SessionSavePermission>, planSHA256: string, capturedAt: string, storageState: object): Promise<void> {
    if (this.closed || this.unsafe) return Promise.reject(new Error("session candidate store is unavailable"));
    const operation = this.pending.then(() => this.publish(permission, planSHA256, capturedAt, storageState));
    this.pending = operation.catch(() => undefined);
    return operation;
  }
  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true;
    this.closing = this.pending.then(async () => {
      try { await this.directory.close(); } catch { this.unsafe = true; }
      if (this.unsafe) invalid();
    });
    return this.closing;
  }
  private async stable(): Promise<void> {
    await stablePath(this.root);
    const pathInfo = await lstat(this.root), info = await this.directory.stat();
    metadata(pathInfo, true, 0o700); metadata(info, true, 0o700);
    if (!same(pathInfo, this.identity) || !same(info, this.identity)) invalid();
  }
  private async publish(permission: Readonly<SessionSavePermission>, planSHA256: string, capturedAt: string, storageState: object): Promise<void> {
    if (this.unsafe) invalid();
    if (!this.plan.permissions.includes(permission)) invalid();
    digest(planSHA256);
    assertSessionSaveCurrent(this.plan, permission);
    if (timestamp(capturedAt) < timestamp(permission.createdAt) || timestamp(capturedAt) > BigInt(Date.now()) * 1_000_000n) invalid();
    record(storageState);
    const data = Buffer.from(JSON.stringify({ version: "browserdriver.session-candidate.v1", launchNonce: this.plan.launchNonce,
      permissionId: permission.permissionId, planSHA256, bindingSHA256: permission.bindingSHA256, generation: permission.generation,
      createdAt: permission.createdAt, expiresAt: permission.expiresAt, capturedAt, storageState }));
    if (data.length > maxSessionCandidateBytes) invalid();
    await this.stable();
    // Anchoring all operations to the opened directory prevents a replaced path
    // from redirecting plaintext writes to another directory.
    const anchored = `/proc/self/fd/${this.directory.fd}`;
    const temporary = join(anchored, `.session-${randomBytes(16).toString("hex")}.tmp`);
    const final = join(anchored, sessionCandidateFileName(permission.saveBinding));
    let file: FileHandle | undefined;
    let published = false;
    let complete = false;
    let fileIdentity: Stats | undefined;
    try {
      file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      await file.writeFile(data); await file.sync();
      const info = await file.stat(); metadata(info, false, 0o600);
      fileIdentity = info;
      if (info.size !== data.length) invalid();
      await this.stable(); assertSessionSaveCurrent(this.plan, permission);
      // Atomic no-clobber publication: unlike rename(), link() cannot replace
      // an existing candidate. Unlink and directory sync settle the single link.
      await link(temporary, final); published = true;
      await unlink(temporary);
      const finalInfo = await lstat(final); metadata(finalInfo, false, 0o600);
      if (!same(info, finalInfo)) invalid();
      await this.directory.sync();
      await this.stable(); assertSessionSaveCurrent(this.plan, permission);
      const settled = await lstat(final); metadata(settled, false, 0o600);
      if (!same(info, settled) || settled.size !== data.length) invalid();
      complete = true;
    } finally {
      if (!complete) {
        // Invalidate our still-open inode before erasure. A cleanup failure must
        // never leave complete bytes eligible for positive joined acceptance.
        if (published && fileIdentity) {
          try { await file!.truncate(0); await file!.sync(); } catch { this.unsafe = true; }
          // Never erase a different file if a host has replaced our candidate.
          try {
            const current = await lstat(final);
            if (same(current, fileIdentity)) await unlink(final);
          } catch (error) { if (!missing(error)) this.unsafe = true; }
        }
        try { await unlink(temporary); } catch (error) { if (!missing(error)) this.unsafe = true; }
        try { await this.directory.sync(); } catch { this.unsafe = true; }
      }
      try { await file?.close(); } catch { this.unsafe = true; }
      if (this.unsafe) invalid();
    }
  }
}

function missing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
