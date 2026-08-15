import type { Interface } from "node:readline";
import type { MessageSource } from "./driver.js";

interface Waiter {
  resolve(value: IteratorResult<string>): void;
  reject(reason: unknown): void;
  signal?: AbortSignal;
  abort?: () => void;
}

// ReadlineMessageSource permits a challenge read to be cancelled without
// leaving a stale async-iterator read that could consume the next envelope.
export class ReadlineMessageSource implements MessageSource {
  private readonly queued: string[] = [];
  private waiter: Waiter | undefined;
  private ended = false;

  constructor(input: Interface) {
    input.on("line", (line) => this.push(line));
    input.on("close", () => this.end());
  }

  next(signal?: AbortSignal): Promise<IteratorResult<string>> {
    const value = this.queued.shift();
    if (value !== undefined) return Promise.resolve({ done: false, value });
    if (this.ended) return Promise.resolve({ done: true, value: undefined });
    if (this.waiter) return Promise.reject(new Error("concurrent protocol reads are not allowed"));
    if (signal?.aborted) return Promise.reject(signal.reason);
    return new Promise<IteratorResult<string>>((resolve, reject) => {
      const waiter: Waiter = { resolve, reject, ...(signal ? { signal } : {}) };
      if (signal) {
        waiter.abort = () => {
          if (this.waiter !== waiter) return;
          this.waiter = undefined;
          reject(signal.reason);
        };
        signal.addEventListener("abort", waiter.abort, { once: true });
      }
      this.waiter = waiter;
    });
  }

  private push(line: string): void {
    const waiter = this.takeWaiter();
    if (waiter) {
      waiter.resolve({ done: false, value: line });
      return;
    }
    this.queued.push(line);
  }

  private end(): void {
    this.ended = true;
    const waiter = this.takeWaiter();
    waiter?.resolve({ done: true, value: undefined });
  }

  private takeWaiter(): Waiter | undefined {
    const waiter = this.waiter;
    this.waiter = undefined;
    if (waiter?.signal && waiter.abort) waiter.signal.removeEventListener("abort", waiter.abort);
    return waiter;
  }
}
