'use strict';

const key = identity => `${identity.pid}:${identity.start}:${identity.uid}`;

// Bracket the child observation with two exact parent identities, then verify
// the child again after the parent reread. Missing/changing parentage supplies
// no new descent proof. Previously proven child lineage can still reparent.
async function observeProcessWithParent(pid, readProcess) {
  const before = await readProcess(pid);
  const parentBefore = await readProcess(before.parent).catch(() => undefined);
  const middle = await readProcess(pid);
  const parentAfter = await readProcess(before.parent).catch(() => undefined);
  const after = await readProcess(pid);
  if (key(before) !== key(middle) || key(before) !== key(after) || before.parent !== middle.parent || before.parent !== after.parent) return undefined;
  const parentIdentity = parentBefore && parentAfter && key(parentBefore) === key(parentAfter)
    ? { pid: parentAfter.pid, start: parentAfter.start, uid: parentAfter.uid } : undefined;
  return { ...after, ...(parentIdentity ? { parentIdentity } : {}) };
}

// Only observed parentage from the exact captured launcher establishes owned
// lineage. A command-line marker is observation, never signalling authority.
function reconcileProcessCustody(processes, launch, lineage, baseline, output) {
  const byPID = new Map();
  for (const item of processes) {
    if (byPID.has(item.pid)) return { owned: [], potential: [], ambiguous: true };
    byPID.set(item.pid, item);
  }
  const owned = new Map();
  for (const item of processes) if (lineage.has(key(item))) owned.set(item.pid, item);
  const root = launch && byPID.get(launch.pid);
  if (root && key(root) === key(launch)) owned.set(root.pid, root);
  for (;;) {
    let changed = false;
    for (const item of processes) {
      if (owned.has(item.pid) || baseline.has(key(item))) continue;
      const parent = owned.get(item.parent);
      if (parent && item.parentIdentity && key(item.parentIdentity) === key(parent)) {
        owned.set(item.pid, item);
        lineage.set(key(item), { pid: item.pid, start: item.start, uid: item.uid, parent: parent.pid, parentStart: parent.start,
          parentIdentity: { pid: parent.pid, start: parent.start, uid: parent.uid } });
        changed = true;
      }
    }
    if (!changed) break;
  }
  const potential = processes.filter(item => !owned.has(item.pid) && !baseline.has(key(item)) && item.cmd.includes(Buffer.from(output)))
    .map(item => ({ pid: item.pid, start: item.start, uid: item.uid }));
  return { owned: [...owned.values()], potential, ambiguous: false };
}

module.exports = { reconcileProcessCustody, processIdentityKey: key, observeProcessWithParent };
