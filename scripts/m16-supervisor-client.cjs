'use strict';
const net = require('node:net');
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const { processIdentityKey: key, reconcileProcessCustody } = require('./m16-process-custody.cjs');
const version = 'browserdriver.m16-supervisor.v1', maximum = 131072;
const fields = (value, names) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === [...names].sort().join(',');
const validIdentity = value => fields(value, ['pid', 'start', 'uid']) && Number.isSafeInteger(value.pid) && value.pid > 0 &&
  typeof value.start === 'string' && /^\d{1,20}$/u.test(value.start) && Number.isSafeInteger(value.uid) && value.uid >= 0;
const refused = () => { throw new Error('private qualification supervisor refused'); };
const validOutput = value => fields(value, ['device', 'inode', 'uid', 'gid', 'mode']) &&
  typeof value.device === 'string' && /^\d{1,20}$/u.test(value.device) && typeof value.inode === 'string' && /^\d{1,20}$/u.test(value.inode) &&
  Number.isSafeInteger(value.uid) && value.uid >= 0 && Number.isSafeInteger(value.gid) && value.gid >= 0 && value.mode === 0o700;

async function verifyOutputDirectory(path, expected) {
  if (!validOutput(expected) || expected.uid !== process.getuid() || await fs.realpath(path) !== path) refused();
  const actual = await fs.lstat(path, { bigint: true });
  if (!actual.isDirectory() || actual.dev.toString() !== expected.device || actual.ino.toString() !== expected.inode ||
      actual.uid !== BigInt(expected.uid) || actual.gid !== BigInt(expected.gid) || (actual.mode & 0o7777n) !== BigInt(expected.mode)) refused();
}

async function holdOutputDirectory(path, expected) {
  await verifyOutputDirectory(path, expected);
  const directory = await fs.open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  const verifyHeld = async () => {
    const actual = await directory.stat({ bigint: true });
    if (!actual.isDirectory() || actual.dev.toString() !== expected.device || actual.ino.toString() !== expected.inode ||
        actual.uid !== BigInt(expected.uid) || actual.gid !== BigInt(expected.gid) || (actual.mode & 0o7777n) !== BigInt(expected.mode)) refused();
  };
  try { await verifyHeld(); await verifyOutputDirectory(path, expected); }
  catch (error) { await directory.close(); throw error; }
  return { anchor: `/proc/self/fd/${directory.fd}`, verifyHeld,
    verifyCurrent: async () => { await verifyHeld(); await verifyOutputDirectory(path, expected); },
    close: () => directory.close() };
}

function validateCustody(value, controller, previous) {
  if (!fields(value, ['version', 'supervisor', 'controller', 'subreaperVerified', 'gap', 'children', 'descendantsSettled', 'echild', 'runDeadlineNs', 'outputCustody']) ||
      value.version !== version || !validIdentity(value.supervisor) || !validIdentity(value.controller) ||
      key(value.controller) !== key(controller) || key(value.supervisor) === key(controller) || value.subreaperVerified !== true ||
      typeof value.gap !== 'boolean' || typeof value.descendantsSettled !== 'boolean' || typeof value.echild !== 'boolean' ||
      !Array.isArray(value.children) || !value.children.length || value.children.length > 256 || value.echild ||
      typeof value.runDeadlineNs !== 'string' || !/^\d{1,20}$/u.test(value.runDeadlineNs) ||
      value.outputCustody !== null && !validOutput(value.outputCustody) ||
      previous && (key(value.supervisor) !== key(previous.supervisor) || value.runDeadlineNs !== previous.runDeadlineNs || JSON.stringify(value.outputCustody) !== JSON.stringify(previous.outputCustody))) refused();
  const seen = new Set(), livePIDs = new Set(), byIdentity = new Map();
  for (const record of value.children) {
    if (!fields(record, ['identity', 'parentIdentity', 'proof', 'wait', 'reaped']) || !validIdentity(record.identity) ||
        !validIdentity(record.parentIdentity) || key(record.parentIdentity) !== key(value.supervisor) || key(record.identity) === key(value.supervisor) ||
        record.proof !== 'kernel-child' || typeof record.reaped !== 'boolean' || seen.has(key(record.identity)) ||
        (record.wait !== null && (!fields(record.wait, ['code', 'status']) || !['exited', 'killed', 'dumped'].includes(record.wait.code) ||
          !Number.isSafeInteger(record.wait.status) || record.wait.status < 0 || record.wait.status > (record.wait.code === 'exited' ? 255 : 64) ||
          record.wait.code !== 'exited' && record.wait.status === 0)) || record.reaped !== (record.wait !== null) || !record.reaped && livePIDs.has(record.identity.pid)) refused();
    if (!record.reaped) livePIDs.add(record.identity.pid);
    seen.add(key(record.identity)); byIdentity.set(key(record.identity), record);
  }
  const root = byIdentity.get(key(controller));
  if (!root || root.reaped || value.descendantsSettled !== value.children.every(record => record.reaped || key(record.identity) === key(controller))) refused();
  if (previous) for (const record of previous.children) {
    const next = byIdentity.get(key(record.identity));
    if (!next || record.reaped && JSON.stringify(next) !== JSON.stringify(record)) refused();
  }
  return value;
}

class SupervisorClient {
  constructor(controller, nonce, socket) {
    if (!validIdentity(controller) || typeof nonce !== 'string' || !/^[a-f0-9]{64}$/u.test(nonce)) refused();
    this.controller = controller; this.nonce = nonce; this.sequence = 0; this.previous = undefined;
    this.socket = socket ?? new net.Socket({ fd: 3, readable: true, writable: true });
    this.buffer = Buffer.alloc(0); this.pending = undefined; this.failed = false;
    this.socket.on('data', chunk => {
      if (this.failed) return;
      try {
        if (!Buffer.isBuffer(chunk) || chunk.length > maximum - this.buffer.length) refused();
        this.buffer = Buffer.concat([this.buffer, chunk]);
        const index = this.buffer.indexOf(10);
        if (index < 0) return;
        if (!this.pending || index !== this.buffer.length - 1) refused();
        const bytes = this.buffer.subarray(0, index), value = JSON.parse(bytes);
        // Canonical Python serialization also excludes duplicate keys and
        // alternate encodings that JSON.parse would silently normalize.
        if (!fields(value, ['version', 'nonce', 'sequence', 'operation', 'custody']) || value.version !== version || value.nonce !== this.nonce ||
            value.sequence !== this.pending.sequence || value.operation !== this.pending.operation ||
            JSON.stringify(value) !== bytes.toString('utf8')) refused();
        const custody = validateCustody(value.custody, this.controller, this.previous);
        this.previous = custody; this.buffer = Buffer.alloc(0);
        const pending = this.pending; this.pending = undefined; clearTimeout(pending.timer); pending.resolve(custody);
      } catch { this.fail(); }
    });
    this.socket.on('error', () => this.fail()); this.socket.on('end', () => this.fail()); this.socket.on('close', () => this.fail());
  }
  fail() {
    if (this.failed) return;
    this.failed = true;
    this.buffer = Buffer.alloc(0); this.socket.destroy();
    if (this.pending) { const pending = this.pending; this.pending = undefined; clearTimeout(pending.timer); pending.reject(new Error('private qualification supervisor refused')); }
  }
  request(operation = 'snapshot', deadline = process.hrtime.bigint() + 3_000_000_000n, sha256 = null, stage = null) {
    if (this.failed || this.pending || !['snapshot', 'stage', 'final', 'finish'].includes(operation) ||
        operation === 'finish' && (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(sha256)) || operation !== 'finish' && sha256 !== null) refused();
    if (operation === 'stage' ? !['normal-settle', 'display-stop', 'display-settle', 'failure-term', 'failure-term-settle', 'failure-kill', 'failure-kill-settle'].includes(stage) : stage !== null) refused();
    const remaining = Number(deadline - process.hrtime.bigint()) / 1_000_000;
    if (remaining <= 0) refused();
    const sequence = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.fail(); }, Math.min(3000, remaining));
      this.pending = { sequence, operation, timer, resolve, reject };
      this.socket.write(`${JSON.stringify({ version, nonce: this.nonce, sequence, controller: this.controller, operation, sha256, deadlineNs: String(deadline), stage })}\n`);
    });
  }
  // Finish is already acknowledged. Release both halves: a readable socket
  // retained here would keep Node alive while its parent waits for ECHILD.
  close() { this.socket.destroy(); }
}

async function reconcileWithAdoptionRefresh(processes, launch, lineage, baseline, output, controller, refresh) {
  let proof = reconcileProcessCustody(processes, launch, lineage, baseline, output);
  if (proof.potential.length && !proof.ambiguous) {
    const refreshed = await refresh();
    if (refreshed.gap) refused();
    retainAdoptions(refreshed, lineage, controller, baseline);
    proof = reconcileProcessCustody(processes, launch, lineage, baseline, output);
  }
  return proof;
}

function retainAdoptions(custody, lineage, controller, baseline) {
  for (const record of custody.children) {
    if (key(record.identity) === key(controller)) continue; // Never signal/wait on either controller root.
    if (baseline.has(key(record.identity))) refused();
    const old = lineage.get(key(record.identity));
    // Keep a previously observed browser ancestry for per-launch sandbox proof.
    if (!old) lineage.set(key(record.identity), { ...record.identity, parentIdentity: record.parentIdentity,
      parent: record.parentIdentity.pid, parentStart: record.parentIdentity.start, custodyProof: 'kernel-adoption' });
  }
}

module.exports = { SupervisorClient, validateCustody, retainAdoptions, reconcileWithAdoptionRefresh, verifyOutputDirectory, holdOutputDirectory };
