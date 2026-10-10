'use strict';
const controllerMaximumNs = 3_000_000_000n;
const remainingNs = (deadline, now) => deadline > now ? deadline - now : 0n;
const controllerDeadline = (stageDeadline, now) => stageDeadline < now + controllerMaximumNs ? stageDeadline : now + controllerMaximumNs;

async function visitWithinBudget(items, deadline, now, inspect, act) {
  for (const identity of items) {
    if (!remainingNs(deadline, now())) return false;
    const admitted = await inspect(identity);
    if (!remainingNs(deadline, now())) return false;
    if (admitted) act(identity, controllerDeadline(deadline, now()));
  }
  return !!remainingNs(deadline, now());
}

module.exports = { remainingNs, controllerDeadline, visitWithinBudget };
