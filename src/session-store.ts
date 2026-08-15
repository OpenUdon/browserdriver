import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { DriverFailure } from "./protocol.js";

const maxStorageStateBytes = 1 << 20;

export interface SessionStateStore {
  load(reference: string): Promise<object>;
}

// FileSessionStateStore keeps the protocol binding opaque: only its digest is
// used as a driver-owned lookup key, and Playwright storage state never crosses
// the NDJSON protocol.
export class FileSessionStateStore implements SessionStateStore {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async load(reference: string): Promise<object> {
    try {
      const rootInfo = await lstat(this.root);
      if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new DriverFailure("session_expired");
      const canonicalRoot = await realpath(this.root);
      if (canonicalRoot !== this.root) throw new DriverFailure("session_expired");
      const path = join(canonicalRoot, sessionStateFileName(reference));
      const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const info = await handle.stat();
        if (!info.isFile() || info.size < 2 || info.size > maxStorageStateBytes) throw new DriverFailure("session_expired");
        const data = await handle.readFile();
        const value: unknown = JSON.parse(data.toString("utf8"));
        if (!isObject(value)) throw new DriverFailure("session_expired");
        return value;
      } finally {
        await handle.close();
      }
    } catch (error) {
      if (error instanceof DriverFailure) throw error;
      throw new DriverFailure("session_expired");
    }
  }
}

export function sessionStateFileName(reference: string): string {
  if (!reference || reference.length > 4096 || /[\0\r\n]/u.test(reference)) throw new DriverFailure("session_expired");
  return `${createHash("sha256").update(reference, "utf8").digest("hex")}.json`;
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
