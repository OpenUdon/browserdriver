import type { LaunchOptions } from "playwright";

// All trusted Chromium launches require the sandbox. Callers supply only their
// headed choice; launch errors propagate without an unsandboxed retry.
export function sandboxedChromiumOptions(headed: boolean): LaunchOptions {
  return {headless: !headed, chromiumSandbox: true};
}
