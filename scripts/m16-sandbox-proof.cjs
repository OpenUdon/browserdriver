'use strict';
const { processIdentityKey: key } = require('./m16-process-custody.cjs');
const gone = error => error && (error.code === 'ENOENT' || error.code === 'ESRCH');

async function inspectRenderer(identity, readIdentity, readStatus, readNamespace, launcherNamespace) {
  let status, namespace, detailFailure = false;
  try { status = await readStatus(identity.pid); } catch { detailFailure = true; }
  try { namespace = await readNamespace(identity.pid); } catch { detailFailure = true; }
  let current;
  try { current = await readIdentity(identity.pid); }
  catch (error) { return { state: gone(error) ? 'gone' : 'uncertain' }; }
  if (key(current) !== key(identity)) return { state: 'identity-changed' };
  if (detailFailure || typeof status !== 'string' || typeof namespace !== 'string') return { state: 'uncertain' };
  return { state: /^Seccomp:\s+2$/m.test(status) && /^NoNewPrivs:\s+1$/m.test(status) && namespace !== launcherNamespace ? 'positive' : 'violation' };
}

function ancestor(identity, lineage, roots) {
  let current = identity;
  const seen = new Set();
  while (current && !seen.has(key(current))) {
    const currentKey = key(current); seen.add(currentKey);
    if (roots.has(currentKey)) return currentKey;
    current = lineage.get(currentKey)?.parentIdentity;
  }
  return undefined;
}

class LaunchSandboxProof {
  constructor() { this.roots = new Map(); this.phases = new Map(); }
  registerMain(identity) {
    const rootKey = key(identity);
    if (!this.roots.has(rootKey)) this.roots.set(rootKey, { identity: { pid: identity.pid, start: identity.start, uid: identity.uid }, renderers: new Map() });
  }
  positiveRenderer(identity, lineage) {
    const rootKey = ancestor(identity, lineage, this.roots);
    if (!rootKey) return undefined;
    this.roots.get(rootKey).renderers.set(key(identity), { pid: identity.pid, start: identity.start, uid: identity.uid });
    return rootKey;
  }
  eligibleRoot(phase, worker, lineage) {
    if (!['start', 'reuse'].includes(phase) || this.phases.has(phase)) return undefined;
    const assigned = new Set(this.phases.values());
    for (const [rootKey, root] of this.roots) {
      if (!assigned.has(rootKey) && root.renderers.size > 0 && ancestor(root.identity, lineage, new Map([[key(worker), worker]])) === key(worker)) return root.identity;
    }
    return undefined;
  }
  assign(phase, root) {
    const rootKey = key(root), value = this.roots.get(rootKey);
    if (!['start', 'reuse'].includes(phase) || this.phases.has(phase) || [...this.phases.values()].includes(rootKey) || !value?.renderers.size) return false;
    this.phases.set(phase, rootKey); return true;
  }
  complete() {
    return this.roots.size === 2 && this.phases.size === 2 && this.phases.has('start') && this.phases.has('reuse') &&
      new Set(this.phases.values()).size === 2 && [...this.roots.values()].every(root => root.renderers.size > 0);
  }
  report() {
    return { phases: Object.fromEntries(this.phases), launches: [...this.roots.values()].map(root => ({ main: root.identity, renderers: [...root.renderers.values()] })), complete: this.complete() };
  }
}

module.exports = { inspectRenderer, LaunchSandboxProof };
