import { createHmac } from "node:crypto";
import { DriverFailure } from "./protocol.js";

export function exactOrigin(raw: string): string {
  try { return new URL(raw).origin; } catch { throw new DriverFailure("origin_rejected"); }
}

export function assertAllowedURL(raw: string, allowed: ReadonlySet<string>): void {
  if (raw === "about:blank") return;
  if (!allowed.has(exactOrigin(raw))) throw new DriverFailure("origin_rejected");
}

export function credentialValue(environmentName: string | undefined): string {
  if (!environmentName || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(environmentName)) {
    throw new DriverFailure("credentials_invalid");
  }
  const value = process.env[environmentName];
  if (!value) throw new DriverFailure("credentials_invalid");
  return value;
}

export function totp(seed: string, now = Date.now()): string {
  const key = decodeBase32(seed);
  const counter = Math.floor(now / 30_000);
  const data = Buffer.alloc(8);
  data.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", key).update(data).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = ((digest[offset]! & 0x7f) << 24) |
    (digest[offset + 1]! << 16) | (digest[offset + 2]! << 8) | digest[offset + 3]!;
  return String(binary % 1_000_000).padStart(6, "0");
}

function decodeBase32(raw: string): Buffer {
  const value = raw.toUpperCase().replace(/=+$/u, "").replace(/[\s-]/gu, "");
  if (!/^[A-Z2-7]+$/.test(value)) throw new DriverFailure("credentials_invalid");
  let bits = "";
  for (const char of value) {
    const number = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(char);
    bits += number.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  if (bytes.length === 0) throw new DriverFailure("credentials_invalid");
  return Buffer.from(bytes);
}
