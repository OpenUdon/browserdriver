#!/usr/bin/env node
import { createInterface } from "node:readline";
import { PersistentBrowserDriver } from "./driver.js";
import { DriverFailure, failure, maxMessageBytes, parseInput } from "./protocol.js";
import { FileSessionStateStore } from "./session-store.js";

const input = createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY, terminal: false });
const iterator = input[Symbol.asyncIterator]();
const emit = (message: object): void => { process.stdout.write(`${JSON.stringify(message)}\n`); };
const sessionStorePath = optionValue(process.argv.slice(2), "--session-store");
const driver = new PersistentBrowserDriver(
  iterator,
  emit,
  process.argv.includes("--headed"),
  sessionStorePath ? new FileSessionStateStore(sessionStorePath) : undefined,
);

try {
  for (;;) {
    const next = await iterator.next();
    if (next.done) break;
    if (Buffer.byteLength(next.value) > maxMessageBytes) throw new DriverFailure("invalid_response");
    let requestId = "invalid";
    try {
      const message = parseInput(next.value);
      requestId = message.requestId;
      if (message.type === "close") break;
      if (message.type === "authenticate") await driver.authenticate(message);
      else if (message.type === "action") await driver.action(message);
      else throw new DriverFailure("invalid_response");
    } catch (error) {
      emit(failure(requestId, error instanceof DriverFailure ? error.code : "invalid_response"));
    }
  }
} finally {
  await driver.close();
}

function optionValue(args: string[], name: string): string | undefined {
  const indexes = args.flatMap((value, index) => value === name ? [index] : []);
  if (indexes.length === 0) return undefined;
  if (indexes.length !== 1 || indexes[0] === undefined || !args[indexes[0] + 1]) return undefined;
  return args[indexes[0] + 1];
}
