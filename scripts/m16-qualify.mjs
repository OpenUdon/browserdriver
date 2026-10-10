// Prepared opt-in qualification only. The selector is never human authority.
import { createHash, randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createReadStream, openSync, closeSync } from 'node:fs';
import { lstat, mkdir, readFile, readdir, readlink, rm, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import custody from './m16-process-custody.cjs';
import displayPolicy from './m16-display.cjs';
import sandboxPolicy from './m16-sandbox-proof.cjs';
import budgets from './m16-budget.cjs';
import packets from './m16-packet.cjs';
import supervision from './m16-supervisor-client.cjs';
const { reconcileProcessCustody, processIdentityKey, observeProcessWithParent } = custody;
const { xauthority, isPlannedDisplayStop, assertChromiumTmpdirBound } = displayPolicy;
const { inspectRenderer, LaunchSandboxProof } = sandboxPolicy;
const { remainingNs, controllerDeadline, visitWithinBudget } = budgets;
const { publishPacket } = packets;
const { SupervisorClient, retainAdoptions, reconcileWithAdoptionRefresh, verifyOutputDirectory, holdOutputDirectory } = supervision;
const clock = () => process.hrtime.bigint();

if (process.env.BROWSERDRIVER_M16_QUALIFY !== 'true') throw new Error('M16 requires scoped browser authority and its explicit qualification selector');
if (process.versions.node !== '24.14.1') throw new Error('M16 requires exact prepared Node');
if (!/^[a-f0-9]{64}$/u.test(process.env.BROWSERDRIVER_M16_SUPERVISOR_NONCE ?? '')) throw new Error('M16 requires its persistent qualification supervisor');
const worktree = resolve(new URL('..', import.meta.url).pathname), output = process.argv[2];
if (!output || resolve(output) !== output || output === '/') throw new Error('M16 requires a fresh absolute output directory');
assertChromiumTmpdirBound(`${output}/tmp`);
const controllerIdentity = await readProcess(process.pid);
const supervisor = new SupervisorClient({ pid: controllerIdentity.pid, start: controllerIdentity.start, uid: controllerIdentity.uid }, process.env.BROWSERDRIVER_M16_SUPERVISOR_NONCE);
delete process.env.BROWSERDRIVER_M16_SUPERVISOR_NONCE;
const initialCustody = await supervisor.request();
const supervisedController = await observeProcessWithParent(process.pid, readProcess);
if (initialCustody.gap || !supervisedController?.parentIdentity || processIdentityKey(supervisedController.parentIdentity) !== processIdentityKey(initialCustody.supervisor) ||
    initialCustody.controller.pid !== process.pid || controllerIdentity.parent !== initialCustody.supervisor.pid) throw new Error('M16 supervisor custody refused');
const ownedRoot = await holdOutputDirectory(output, initialCustody.outputCustody);
const fsOutput = ownedRoot.anchor;
const manifest = JSON.parse(await readFile(new URL('../docs/m16-qualification-inputs-v5.json', import.meta.url), 'utf8'));
for (const [path, expected] of Object.entries(manifest.files)) {
  const file = path.startsWith('/') ? path : `${worktree}/${path}`, info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size !== expected.bytes) throw new Error('M16 prepared file custody changed');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  if (hash.digest('hex') !== expected.sha256) throw new Error('M16 prepared file bytes changed');
}
const helper = await lstat('/opt/google/chrome/chrome-sandbox');
if (helper.uid !== 0 || helper.gid !== 0 || (helper.mode & 0o7777) !== 0o4755) throw new Error('M16 existing sandbox helper custody changed');
for (const [path, expected] of Object.entries({ ...manifest.companionCustody, ...manifest.supervisorToolCustody })) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== expected.uid || info.gid !== expected.gid ||
      (info.mode & 0o7777) !== expected.mode || info.nlink !== expected.links) throw new Error('M16 prepared browser companion custody changed');
}
const displayNumber = '116', display = `:${displayNumber}`, socketPath = `/tmp/.X11-unix/X${displayNumber}`, lockPath = `/tmp/.X${displayNumber}-lock`;
for (const path of [socketPath, lockPath]) {
  try { await lstat(path); throw new Error('M16 display collision'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
await ownedRoot.verifyCurrent();
await mkdir(`${fsOutput}/home`, { mode: 0o700 }); await mkdir(`${fsOutput}/tmp`, { mode: 0o700 });
await mkdir(`${fsOutput}/tmp/xauth`, { mode: 0o700 });
const proofRoot = `${output}/tmp/sandbox-proofs`, ownedProofRoot = `${fsOutput}/tmp/sandbox-proofs`;
await mkdir(ownedProofRoot, { mode: 0o700 }); await mkdir(`${ownedProofRoot}/requests`, { mode: 0o700 }); await mkdir(`${ownedProofRoot}/acks`, { mode: 0o700 });
const authPath = `${output}/tmp/xauth/Xauthority`, ownedAuthPath = `${fsOutput}/tmp/xauth/Xauthority`;
await writeFile(ownedAuthPath, xauthority(hostname(), displayNumber, randomBytes(16)), { flag: 'wx', mode: 0o600 });
const authIdentity = await lstat(ownedAuthPath, { bigint: true });
const log = openSync(`${fsOutput}/fixture.log`, 'wx', 0o600);
const identities = new Map(), potentialGaps = new Map(), signals = [], actors = [];
const sandboxProof = new LaunchSandboxProof();
const launcherUserNamespace = await readlink('/proc/self/ns/user');
const baseline = new Set((await snapshot()).map(processIdentityKey));
let sandboxObservations = 0, sandboxViolation = false, inspectionGap = false, cancelled = false, authObserved = false;
let displayIdentity, fixture;
process.once('SIGINT', () => { cancelled = true; }); process.once('SIGTERM', () => { cancelled = true; });
const begin = Date.now(), runDeadline = BigInt(initialCustody.runDeadlineNs);
const baseEnv = { PATH: '/home/peter/.nvm/versions/node/v24.14.1/bin:/usr/bin:/bin', HOME: `${output}/home`, TMPDIR: `${output}/tmp`, LANG: 'C.UTF-8', CI: '1' };
await ownedRoot.verifyCurrent();
const server = start('/usr/bin/Xvfb', [display, '-screen', '0', '1280x800x24', '-nolisten', 'tcp', '-auth', authPath], baseEnv, 'display');
await capture(server); displayIdentity = server.identity;
let displayReady = false;
const readyDeadline = clock() + 10_000_000_000n;
while (!server.result && !cancelled && !inspectionGap && clock() < readyDeadline) {
  await scan(readyDeadline < runDeadline ? readyDeadline : runDeadline);
  const socket = await lstat(socketPath).catch(() => undefined);
  const lock = await readFile(lockPath, 'utf8').catch(() => undefined);
  if (socket?.isSocket() && socket.uid === process.getuid() && Number(lock?.trim()) === server.child.pid && authObserved) { displayReady = true; break; }
  await delay(25);
}
if (displayReady && !cancelled && !inspectionGap) {
  await ownedRoot.verifyCurrent();
  fixture = start('/home/peter/.nvm/versions/node/v24.14.1/bin/node', ['--test', 'dist/test/session-save-live.test.js'], {
    ...baseEnv, DISPLAY: display, XAUTHORITY: authPath, PLAYWRIGHT_BROWSERS_PATH: '/home/peter/.cache/ms-playwright',
    CHROME_DEVEL_SANDBOX: '/opt/google/chrome/chrome-sandbox', BROWSERDRIVER_SESSION_SAVE_LIVE_TEST: '1',
    BROWSERDRIVER_M16_FIXTURE_REPORT: `${output}/fixture-evidence.json`,
    BROWSERDRIVER_M16_FAILURE_REPORT: `${output}/fixture-failure.json`,
    BROWSERDRIVER_M16_SANDBOX_PROOFS: proofRoot,
  }, 'fixture');
  await capture(fixture);
} else inspectionGap = true;
while (fixture && !fixture.result && !cancelled && !inspectionGap && !sandboxViolation && clock() < runDeadline) { await scan(runDeadline); await delay(25); }
const timedOut = clock() >= runDeadline;
if (!timedOut) await scan(runDeadline);
let normalStop, authPresentUntilDisplayJoined = false;
if (fixture?.result?.code === 0 && !cancelled && !inspectionGap && !sandboxViolation) {
  await settleFor(30_000, true, undefined, 'normal-settle');
  const nonDisplay = await remainingOwned(true), potential = await remainingPotential();
  if (!nonDisplay.length && !potential.length && displayIdentity && !server.result && await stableAuth()) {
    const stopDeadline = clock() + 3_000_000_000n;
    await announceStage('display-stop', stopDeadline);
    normalStop = signalIdentity(displayIdentity, 'SIGTERM', 'normal-display-stop', stopDeadline);
    await settleFor(10_000, false, undefined, 'display-settle');
    authPresentUntilDisplayJoined = !!server.result && await stableAuth();
  }
}
const normalDisplayClosed = normalStop && isPlannedDisplayStop(normalStop, displayIdentity) &&
  (server.result?.code === 0 || server.result?.signal === 'SIGTERM') && authPresentUntilDisplayJoined;
if (!normalDisplayClosed || fixture?.result?.code !== 0 || cancelled || timedOut || inspectionGap || sandboxViolation) {
  await signalOwned('SIGTERM', cancelled ? 'cancel' : timedOut ? 'timeout' : 'failed-check'); await settleFor(10_000, false, undefined, 'failure-term-settle');
  if ((await remainingOwned()).length || actors.some(actor => !actor.result)) { await signalOwned('SIGKILL', 'escalation'); await settleFor(10_000, false, undefined, 'failure-kill-settle'); }
}
const finalDeadline = clock() + 30_000_000_000n;
await supervisor.request('final', finalDeadline).catch(() => { inspectionGap = true; });
await settleFor(30_000, false, finalDeadline);
const remaining = await remainingOwned(), unsettledPotential = await remainingPotential();
const finalCustody = await supervisor.request('snapshot', controllerDeadline(finalDeadline, clock())).catch(() => { inspectionGap = true; });
for (const actor of actors) if (!actor.result) actor.child.unref();
closeSync(log);
let privateHomeRemoved = false, privateTmpRemoved = false, displayCleanup;
if (!remaining.length && !unsettledPotential.length && actors.every(actor => actor.result) && finalCustody?.descendantsSettled && !finalCustody.gap) {
  const socketAbsent = await absent(socketPath), lockAbsent = await absent(lockPath);
  try {
    await ownedRoot.verifyCurrent();
    // Display and all observed browser owners settle before erasing Xauthority.
    await rm(`${fsOutput}/home`, { recursive: true }); await rm(`${fsOutput}/tmp`, { recursive: true });
    privateHomeRemoved = await absent(`${fsOutput}/home`); privateTmpRemoved = await absent(`${fsOutput}/tmp`);
    displayCleanup = { display, socketAbsent, lockAbsent, authObserved, authDirectoryAbsent: await absent(`${fsOutput}/tmp/xauth`), serverJoinedBeforeAuthErase: true };
  } catch { inspectionGap = true; }
}
let fixtureEvidenceSHA256 = null;
try {
  const bytes = await readFile(`${fsOutput}/fixture-evidence.json`), evidence = JSON.parse(bytes);
  if (evidence.version === 'browserdriver.m16-fixture-evidence.v1' && evidence.browserLaunches === 2 && evidence.joinedDrivers === 2 &&
      evidence.mutations === 0 && evidence.reuseWithCookie === 1 && evidence.listenerClosed === true && evidence.plaintextFixtureRootRemoved === true) {
    fixtureEvidenceSHA256 = createHash('sha256').update(bytes).digest('hex');
  }
} catch { /* Missing/incomplete fixture proof refuses qualification. */ }
const report = { version: 'browserdriver.m16-qualification.v1', fixtureOnly: true, origin: 'http://127.0.0.1:46061',
  plannedBrowserLaunches: 2, browserLaunchesQualifiedByFixture: fixture?.result?.code === 0 ? 2 : null,
  node: process.versions.node, playwright: '1.62.1', chromium: '151.0.7922.34', sandboxRequired: true,
  actors: actors.map(actor => ({ role: actor.role, identity: actor.identity, result: actor.result ?? { unsettled: true } })), elapsedMs: Date.now() - begin,
  identities: [...identities.values()], remaining, potentialOwnershipGaps: [...potentialGaps.values()], remainingPotential: unsettledPotential,
  signals, normalDisplayClosed: !!normalDisplayClosed, authPresentUntilDisplayJoined,
  forcedCleanup: signals.some(record => record.state === 'sent' && !isPlannedDisplayStop(record, displayIdentity)),
  timedOut, cancelled, inspectionGap, sandboxObservations, sandboxViolation, privateHomeRemoved, privateTmpRemoved, displayCleanup,
  sandboxLaunches: sandboxProof.report(),
  fixtureEvidenceSHA256,
  state: fixture?.result?.code === 0 && normalDisplayClosed && !remaining.length && !unsettledPotential.length &&
    signals.every(record => isPlannedDisplayStop(record, displayIdentity)) && !timedOut && !cancelled && !inspectionGap &&
    sandboxProof.complete() && !sandboxViolation && privateHomeRemoved && privateTmpRemoved && displayCleanup?.socketAbsent &&
    displayCleanup?.lockAbsent && displayCleanup?.authDirectoryAbsent && fixtureEvidenceSHA256 && finalCustody?.descendantsSettled && !finalCustody.gap ? 'passed' : 'failed-or-unsettled' };
const reportBytes = `${JSON.stringify(report, null, 2)}\n`;
await ownedRoot.verifyCurrent();
await writeFile(`${fsOutput}/qualification-node.json`, reportBytes, { flag: 'wx', mode: 0o600 });
await supervisor.request('finish', controllerDeadline(finalDeadline, clock()), createHash('sha256').update(reportBytes).digest('hex'));
supervisor.close();
await ownedRoot.close();
if (report.state !== 'passed') process.exitCode = 1;

function start(executable, args, env, role) {
  const child = spawn(executable, args, { cwd: worktree, env, stdio: ['ignore', log, log] }), actor = { child, role, result: undefined, identity: undefined };
  child.once('error', () => { actor.result = { code: null, signal: null, spawnFailed: true }; });
  child.once('close', (code, signal) => { actor.result = { code, signal, spawnFailed: false }; });
  actors.push(actor); return actor;
}
async function capture(actor) {
  try {
    const item = await observeProcessWithParent(actor.child.pid, readProcess);
    if (!item || item.parent !== process.pid || !item.parentIdentity || processIdentityKey(item.parentIdentity) !== processIdentityKey(controllerIdentity) ||
        item.uid !== process.getuid() || baseline.has(processIdentityKey(item))) inspectionGap = true;
    else { actor.identity = { pid: item.pid, start: item.start, uid: item.uid }; identities.set(processIdentityKey(item), actor.identity); }
  } catch { inspectionGap = true; }
}
async function readProcess(pid) {
  const before = await readFile(`/proc/${pid}/stat`, 'utf8'), infoBefore = await lstat(`/proc/${pid}`);
  const cmd = await readFile(`/proc/${pid}/cmdline`), infoAfter = await lstat(`/proc/${pid}`), after = await readFile(`/proc/${pid}/stat`, 'utf8');
  const first = before.slice(before.lastIndexOf(')') + 2).split(' '), last = after.slice(after.lastIndexOf(')') + 2).split(' ');
  if (first[19] !== last[19] || first[1] !== last[1] || infoBefore.uid !== infoAfter.uid) throw new Error('process custody changed');
  return { pid, parent: Number(last[1]), start: last[19], uid: infoAfter.uid, cmd };
}
async function snapshot(deadline) {
  const processes = [];
  for (const value of await readdir('/proc')) {
    if (deadline && !remainingNs(deadline, clock())) break;
    if (!/^\d+$/.test(value)) continue;
    try { const item = await observeProcessWithParent(Number(value), readProcess); if (item) processes.push(item); }
    catch (error) {
      // Errors for a known owner are uncertainty, not exit. Unrelated entries
      // still cannot establish new ownership when inspection is unavailable.
      if (error.code !== 'ENOENT' && error.code !== 'ESRCH' && [...identities.values()].some(item => item.pid === Number(value))) inspectionGap = true;
    }
  }
  return processes;
}
async function scan(deadline) {
  try { await ownedRoot.verifyCurrent(); } catch { inspectionGap = true; }
  try {
    const observed = await supervisor.request('snapshot', controllerDeadline(deadline ?? clock() + 3_000_000_000n, clock()));
    if (observed.gap) inspectionGap = true;
    retainAdoptions(observed, identities, controllerIdentity, baseline);
  } catch { inspectionGap = true; }
  let processes;
  try { processes = await snapshot(deadline); } catch { inspectionGap = true; return; }
  if (deadline && !remainingNs(deadline, clock())) return;
  let proof;
  try { proof = await reconcileWithAdoptionRefresh(processes, displayIdentity, identities, baseline, output, controllerIdentity,
    () => supervisor.request('snapshot', controllerDeadline(deadline ?? clock() + 3_000_000_000n, clock()))); }
  catch { inspectionGap = true; return; }
  if (proof.ambiguous || proof.potential.length) inspectionGap = true;
  for (const item of proof.potential) potentialGaps.set(processIdentityKey(item), item);
  const chrome = '/home/peter/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
  for (const item of proof.owned) {
    const args = item.cmd.toString('utf8').split('\0');
    if (args[0] === chrome && !args.some(arg => arg === '--type' || arg.startsWith('--type='))) sandboxProof.registerMain(item);
  }
  for (const item of proof.owned) {
    if (deadline && !remainingNs(deadline, clock())) return;
    const args = item.cmd.toString('utf8').split('\0');
    const disableFlags = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-seccomp-filter-sandbox', '--disable-namespace-sandbox', '--no-zygote-sandbox', '--disable-gpu-sandbox', '--single-process'];
    if (args[0]?.startsWith('/home/peter/.cache/ms-playwright/chromium-1234/') && args.some(arg => disableFlags.some(flag => arg === flag || arg.startsWith(`${flag}=`)))) sandboxViolation = true;
    if (displayIdentity && processIdentityKey(item) === processIdentityKey(displayIdentity)) authObserved ||= await stableAuth();
    if (item.cmd.includes(Buffer.from('--type=renderer'))) {
      const inspected = await inspectRenderer(item, readProcess, pid => readFile(`/proc/${pid}/status`, 'utf8'),
        pid => readlink(`/proc/${pid}/ns/user`), launcherUserNamespace);
      if (inspected.state === 'uncertain') inspectionGap = true;
      else if (inspected.state === 'violation' || args.some(arg => disableFlags.some(flag => arg === flag || arg.startsWith(`${flag}=`)))) sandboxViolation = true;
      else if (inspected.state === 'positive') {
        if (!sandboxProof.positiveRenderer(item, identities)) inspectionGap = true;
        else sandboxObservations += 1;
      }
    }
  }
  if (!inspectionGap && !sandboxViolation && (!deadline || remainingNs(deadline, clock()))) await acknowledgePhases();
}

async function acknowledgePhases() {
  for (const phase of ['start', 'reuse']) {
    if (sandboxProof.phases.has(phase)) continue;
    let packet;
    try {
      const path = `${ownedProofRoot}/requests/${phase}.json`, info = await lstat(path);
      if (!info.isFile() || info.uid !== process.getuid() || (info.mode & 0o777) !== 0o600 || info.size > 4096) { inspectionGap = true; return; }
      const bytes = await readFile(path); if (bytes.length > 4096) { inspectionGap = true; return; }
      packet = JSON.parse(bytes);
    } catch (error) { if (error.code === 'ENOENT') continue; inspectionGap = true; return; }
    const worker = packet.worker;
    if (packet.version !== 'browserdriver.m16-sandbox-phase.v1' || packet.phase !== phase || !worker ||
        !Number.isSafeInteger(worker.pid) || worker.pid <= 0 || typeof worker.start !== 'string' || !/^\d+$/.test(worker.start) || worker.uid !== process.getuid() ||
        !identities.has(processIdentityKey(worker))) { inspectionGap = true; return; }
    const main = sandboxProof.eligibleRoot(phase, worker, identities);
    if (!main) continue;
    let current;
    try { current = await readProcess(main.pid); }
    catch (error) { if (error.code === 'ENOENT' || error.code === 'ESRCH') continue; inspectionGap = true; return; }
    if (processIdentityKey(current) !== processIdentityKey(main)) continue;
    if (!sandboxProof.assign(phase, main)) { inspectionGap = true; return; }
    const rendererCount = sandboxProof.roots.get(processIdentityKey(main)).renderers.size;
    try { await publishPacket(`${ownedProofRoot}/acks/${phase}.json`, { version: 'browserdriver.m16-sandbox-proof.v1', phase, worker, main, rendererCount }, ownedRoot); }
    catch { inspectionGap = true; return; }
  }
}
async function stableAuth() {
  try {
    const current = await lstat(ownedAuthPath, { bigint: true });
    return current.isFile() && current.dev === authIdentity.dev && current.ino === authIdentity.ino && current.uid === authIdentity.uid &&
      current.mode === authIdentity.mode && current.size === authIdentity.size && current.mtimeNs === authIdentity.mtimeNs && current.ctimeNs === authIdentity.ctimeNs;
  } catch { inspectionGap = true; return false; }
}
async function alive(identity) {
  try { const item = await readProcess(identity.pid); return processIdentityKey(item) === processIdentityKey(identity); }
  catch (error) { if (error.code === 'ENOENT' || error.code === 'ESRCH') return false; inspectionGap = true; return true; }
}
async function remainingOwned(excludeDisplay = false) {
  const values = [];
  for (const identity of identities.values()) if ((!excludeDisplay || !displayIdentity || processIdentityKey(identity) !== processIdentityKey(displayIdentity)) && await alive(identity)) values.push(identity);
  return values;
}
async function remainingPotential() {
  const values = []; for (const identity of potentialGaps.values()) if (await alive(identity)) values.push(identity); return values;
}
function signalIdentity(identity, signal, purpose, deadline = clock() + 3_000_000_000n) {
  if (identity.pid === process.pid || identity.pid === initialCustody.supervisor.pid) { inspectionGap = true; return { ...identity, signal, purpose, state: 'ownership-refused' }; }
  // The Python worker uses a kernel pidfd; its own alarm targets only itself.
  // No numeric-PID kill fallback, no implicit Node timeout signal, no sudo.
  const controller = spawnSync('/usr/bin/python3.14', ['-c', `
import signal, time, sys
deadline_ns = int(sys.argv[5])
remaining = (deadline_ns - time.monotonic_ns()) / 1_000_000_000
if remaining <= 0: print('budget-expired'); sys.exit(0)
signal.setitimer(signal.ITIMER_REAL, remaining)
import os
pid, expected, expected_uid, signum = int(sys.argv[1]), sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
fd = None
try:
    fd = os.pidfd_open(pid, 0)
    with open('/proc/%d/stat' % pid) as stream: stat = stream.read()
    start = stat[stat.rfind(')') + 2:].split(' ')[19]
    uid = os.stat('/proc/%d' % pid).st_uid
    if time.monotonic_ns() >= deadline_ns: print('budget-expired')
    elif start != expected or uid != expected_uid or uid != os.getuid(): print('ownership-refused')
    else: signal.pidfd_send_signal(fd, signum, None, 0); print('sent')
except ProcessLookupError: print('already-absent')
except FileNotFoundError: print('already-absent')
except (AttributeError, NotImplementedError): print('capability-unavailable')
except OSError: print('signal-refused')
finally:
    if fd is not None: os.close(fd)
`, String(identity.pid), identity.start, String(identity.uid), signal === 'SIGTERM' ? '15' : '9', String(deadline)], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, stdio: ['ignore', 'pipe', 'ignore'] });
  const value = controller.stdout?.trim();
  const record = { ...identity, signal, purpose, controllerSignal: controller.signal,
    state: controller.status === 0 && ['sent', 'already-absent', 'ownership-refused', 'capability-unavailable', 'signal-refused', 'budget-expired'].includes(value) ? value : 'controller-unsettled' };
  signals.push(record); return record;
}
async function signalOwned(signal, purpose) {
  const deadline = clock() + 5_000_000_000n;
  await announceStage(signal === 'SIGTERM' ? 'failure-term' : 'failure-kill', deadline);
  await scan(deadline);
  const finished = await visitWithinBudget(identities.values(), deadline, clock, async identity => {
    if (!await alive(identity)) return false;
    if (identity.uid !== process.getuid()) { signals.push({ ...identity, signal, purpose, state: 'ownership-refused' }); return false; }
    return true;
  }, (identity, remainingDeadline) => signalIdentity(identity, signal, purpose, remainingDeadline));
  if (!finished) inspectionGap = true;
}
async function announceStage(stage, deadline) {
  try { await supervisor.request('stage', deadline, null, stage); } catch { inspectionGap = true; }
}
async function settleFor(milliseconds, excludeDisplay = false, admittedDeadline, stage) {
  const deadline = admittedDeadline ?? clock() + BigInt(milliseconds) * 1_000_000n;
  if (stage) await announceStage(stage, deadline);
  do {
    await scan(deadline);
    if (!remainingNs(deadline, clock())) return;
    if (!(await remainingOwned(excludeDisplay)).length && !(await remainingPotential()).length &&
        actors.filter(actor => !excludeDisplay || actor.role !== 'display').every(actor => actor.result)) return;
    const remaining = Number(remainingNs(deadline, clock())) / 1_000_000;
    if (!remaining) return;
    await delay(Math.min(100, remaining));
  } while (remainingNs(deadline, clock()));
}
async function absent(path) {
  try { await lstat(path); return false; } catch (error) { if (error.code === 'ENOENT') return true; inspectionGap = true; return false; }
}
