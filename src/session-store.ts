import { createHash } from "node:crypto";
import { constants } from "node:fs";
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
      rootInfo = await lstat(this.root);
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
      handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch {
      this.fail("state file cannot be opened safely");
    }
    try {
      const info = await handle.stat();
      const currentUID = typeof process.getuid === "function" ? process.getuid() : undefined;
      const metadataFailure = sessionStateMetadataFailure(info, currentUID);
      if (metadataFailure) this.fail(metadataFailure);
      const data = await handle.readFile();
      let value: unknown;
      try {
        value = JSON.parse(data.toString("utf8"));
      } catch {
        this.fail("state file is not valid JSON");
      }
      if (!isObject(value)) this.fail("state file does not contain an object");
      return value;
    } finally {
      await handle.close();
    }
  }

  private fail(reason: string): never {
    this.diagnostic(`browserdriver session store: ${reason}\n`);
    throw new DriverFailure("session_expired");
  }
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
