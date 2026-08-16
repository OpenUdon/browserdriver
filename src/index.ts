#!/usr/bin/env node
import { createInterface } from "node:readline";
import { PersistentBrowserDriver, defaultChallengeTimeoutMs } from "./driver.js";
import { ReadlineMessageSource } from "./line-source.js";
import { DriverFailure, failure, maxMessageBytes, parseInput, protocolVersion, type ProtocolVersion } from "./protocol.js";
import { FileSessionStateStore } from "./session-store.js";

const input = createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY, terminal: false });
const lines = new ReadlineMessageSource(input);
const emit = (message: object): void => { process.stdout.write(`${JSON.stringify(message)}\n`); };
let driver: PersistentBrowserDriver | undefined;

try {
  const args = process.argv.slice(2);
  const sessionStorePath = optionValue(args, "--session-store");
  const numberMatchSelector = optionValue(args, "--number-match-selector");
  driver = new PersistentBrowserDriver(lines, emit, {
    headed: args.includes("--headed"),
    ...(sessionStorePath ? { sessionStore: new FileSessionStateStore(sessionStorePath) } : {}),
    challengeTimeoutMs: durationOption(args, "--challenge-timeout", defaultChallengeTimeoutMs),
    ...(numberMatchSelector !== undefined ? { numberMatchSelector } : {}),
  });
  for (;;) {
    const next = await lines.next();
    if (next.done) break;
    if (Buffer.byteLength(next.value) > maxMessageBytes) throw new DriverFailure("invalid_response");
    let requestId = "invalid";
    let requestVersion: ProtocolVersion = protocolVersion;
    try {
      const message = parseInput(next.value);
      requestId = message.requestId;
      requestVersion = message.version;
      if (message.type === "close") break;
      if (message.type === "authenticate") await driver.authenticate(message);
      else if (message.type === "action") await driver.action(message);
      else throw new DriverFailure("invalid_response");
    } catch (error) {
      emit(failure(requestId, error instanceof DriverFailure ? error.code : "invalid_response", requestVersion));
    }
  }
} catch {
  process.stderr.write("browser driver configuration or protocol loop failed\n");
  process.exitCode = 1;
} finally {
  await driver?.close();
}

function optionValue(args: string[], name: string): string | undefined {
  const indexes = args.flatMap((value, index) => value === name ? [index] : []);
  if (indexes.length === 0) return undefined;
  if (indexes.length !== 1 || indexes[0] === undefined || !args[indexes[0] + 1]) throw new Error("invalid driver option");
  return args[indexes[0] + 1];
}

function durationOption(args: string[], name: string, fallback: number): number {
  const value = optionValue(args, name);
  if (value === undefined) return fallback;
  const match = /^(\d+)(ms|s|m)$/u.exec(value);
  if (!match) throw new Error("invalid driver duration");
  const amount = Number(match[1]);
  const multiplier = match[2] === "ms" ? 1 : match[2] === "s" ? 1_000 : 60_000;
  const result = amount * multiplier;
  if (!Number.isSafeInteger(result) || result <= 0 || result > 86_400_000) throw new Error("invalid driver duration");
  return result;
}
