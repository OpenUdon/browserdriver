import { createHash } from "node:crypto";
import { constants, type BigIntStats } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { DriverFailure } from "./protocol.js";

const maxStorageStateBytes = 1 << 20;

export interface SessionStateStore {
  load(reference: string): Promise<object>;
}

export type SessionStoreDiagnostic = (message: string) => void;

// FileSessionStateStore keeps the protocol binding opaque: only its digest is
// used as a driver-owned lookup key, and Playwright storage state never crosses
// the NDJSON protocol.
export class FileSessionStateStore implements SessionStateStore {
  private readonly root: string;

  constructor(root: string, private readonly diagnostic: SessionStoreDiagnostic = defaultDiagnostic) {
    this.root = resolve(root);
  }

  async load(reference: string): Promise<object> {
    let fileName: string;
    try {
      fileName = sessionStateFileName(reference);
    } catch {
      this.fail("reference is invalid");
    }
    let rootInfo;
    try {
      rootInfo = await lstat(this.root, { bigint: true });
    } catch {
      this.fail("configured root is unavailable");
    }
    if (rootInfo.isSymbolicLink()) this.fail("configured root must not be a symlink");
    if (!rootInfo.isDirectory()) this.fail("configured root is not a directory");
    let canonicalRoot: string;
    try {
      canonicalRoot = await realpath(this.root);
    } catch {
      this.fail("configured root cannot be canonicalized");
    }
    const path = join(canonicalRoot, fileName);
    let canonicalPath: string;
    try {
      canonicalPath = await realpath(path);
    } catch {
      this.fail("state file is unavailable");
    }
    const fromRoot = relative(canonicalRoot, canonicalPath);
    if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
      this.fail("state file escapes the canonical root");
    }
    let handle;
    try {
      handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    } catch {
      this.fail("state file cannot be opened safely");
    }
    try {
      const info = await handle.stat({ bigint: true });
      const currentUID = typeof process.getuid === "function" ? process.getuid() : undefined;
      const metadataFailure = stateMetadataFailure(info, currentUID);
      if (metadataFailure) this.fail(metadataFailure);
      const buffer = Buffer.alloc(maxStorageStateBytes + 1);
      let length = 0;
      while (length < buffer.length) {
        const read = await handle.read(buffer, length, buffer.length - length, length);
        if (read.bytesRead === 0) break;
        length += read.bytesRead;
      }
      const after = await handle.stat({ bigint: true });
      const currentPath = await lstat(path, { bigint: true });
      const currentRoot = await lstat(this.root, { bigint: true });
      for (const current of [after, currentPath]) {
        const failure = stateMetadataFailure(current, currentUID);
        if (failure) this.fail(failure);
        if (!stableFile(info, current)) this.fail("state file changed during read");
      }
      if (length < 2 || length > maxStorageStateBytes || BigInt(length) !== info.size) this.fail("state file size is outside the accepted bounds");
      if (!currentRoot.isDirectory() || currentRoot.dev !== rootInfo.dev || currentRoot.ino !== rootInfo.ino ||
          currentRoot.uid !== rootInfo.uid || currentRoot.gid !== rootInfo.gid || currentRoot.mode !== rootInfo.mode ||
          await realpath(this.root) !== canonicalRoot || await realpath(path) !== canonicalPath) this.fail("state root changed during read");
      const data = buffer.subarray(0, length);
      let value: unknown;
      try {
        value = JSON.parse(data.toString("utf8"));
      } catch {
        this.fail("state file is not valid JSON");
      }
      if (!isObject(value)) this.fail("state file does not contain an object");
      return value;
    } catch (error) {
      if (error instanceof DriverFailure) throw error;
      return this.fail("state file custody cannot be verified");
    } finally {
      try { await handle.close(); } catch { this.fail("state file cannot be closed safely"); }
    }
  }

  private fail(reason: string): never {
    this.diagnostic(`browserdriver session store: ${reason}\n`);
    throw new DriverFailure("session_expired");
  }
}

function stateMetadataFailure(info: BigIntStats, currentUID: number | undefined): string | undefined {
  return sessionStateMetadataFailure({ isFile: () => info.isFile(), size: Number(info.size), mode: Number(info.mode), uid: Number(info.uid) }, currentUID);
}

function stableFile(before: BigIntStats, after: BigIntStats): boolean {
  return before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.uid === after.uid &&
    before.gid === after.gid && before.mode === after.mode && before.nlink === after.nlink &&
    before.mtimeNs === after.mtimeNs && before.ctimeNs === after.ctimeNs;
}

export function sessionStateFileName(reference: string): string {
  if (!reference || reference.length > 4096 || /[\0\r\n]/u.test(reference)) throw new DriverFailure("session_expired");
  return `${createHash("sha256").update(reference, "utf8").digest("hex")}.json`;
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatMode(mode: number): string {
  return (mode & 0o777).toString(8).padStart(4, "0");
}

export function sessionStateMetadataFailure(
  info: { isFile(): boolean; size: number; mode: number; uid: number },
  currentUID: number | undefined,
): string | undefined {
  if (!info.isFile()) return "state file is not regular";
  if (info.size < 2 || info.size > maxStorageStateBytes) return "state file size is outside the accepted bounds";
  if (currentUID !== undefined) {
    if ((info.mode & 0o077) !== 0) return `state file mode ${formatMode(info.mode)} is too permissive`;
    if (info.uid !== currentUID) return "state file owner does not match the driver user";
  }
  return undefined;
}

function defaultDiagnostic(message: string): void {
  process.stderr.write(message);
}
