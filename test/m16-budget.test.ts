import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import test from "node:test";

const { remainingNs, controllerDeadline, visitWithinBudget } = createRequire(import.meta.url)("../../scripts/m16-budget.cjs") as {
  remainingNs(deadline: bigint, now: bigint): bigint; controllerDeadline(deadline: bigint, now: bigint): bigint;
  visitWithinBudget<T>(items: T[], deadline: bigint, now: () => bigint, inspect: (item: T) => Promise<boolean>, act: (item: T, deadline: bigint) => void): Promise<boolean>;
};

test("the final controller gets only the hard remaining stage budget, with no late admissions", async () => {
  let now = 0n;
  const deadline = 5_000_000_000n, budgets: bigint[] = [], admitted: number[] = [];
  const finished = await visitWithinBudget([1, 2, 3], deadline, () => now, async () => { now += 500_000_000n; return true; }, (item, controllerEnd) => {
    admitted.push(item); budgets.push(controllerEnd - now); now = controllerEnd;
  });
  assert.deepEqual(admitted, [1, 2]); assert.deepEqual(budgets, [3_000_000_000n, 1_000_000_000n]);
  assert.equal(now, deadline); assert.equal(finished, false);
  assert.equal(remainingNs(deadline, deadline + 1n), 0n); assert.equal(controllerDeadline(deadline, deadline - 1n), deadline);
});

test("prepared Linux Node and Python clocks share the absolute monotonic controller deadline", () => {
  const before = process.hrtime.bigint();
  const result = spawnSync("/usr/bin/python3.14", ["-c", "import time; print(time.monotonic_ns())"], {
    encoding: "utf8", env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" },
  });
  const after = process.hrtime.bigint();
  assert.equal(result.status, 0); assert.equal(result.stderr, "");
  const observed = BigInt(result.stdout.trim());
  assert.ok(observed >= before && observed <= after);
});
