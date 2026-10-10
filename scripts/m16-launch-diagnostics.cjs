'use strict';

// Qualification-only reduction. Never return exception prose, stack, paths,
// command lines, browser material or a digest of an exception. Source markers
// are observations, not proof that any component caused a failure.
const categories = ['sandbox_refused', 'display_auth_refused', 'host_dependency_missing',
  'executable_unavailable', 'host_resource_unavailable', 'launch_timeout',
  'closed_before_connection', 'unknown_launch_failure'];
const signals = ['SIGABRT', 'SIGBUS', 'SIGFPE', 'SIGHUP', 'SIGILL', 'SIGINT', 'SIGKILL',
  'SIGQUIT', 'SIGSEGV', 'SIGSYS', 'SIGTERM', 'SIGTRAP', 'SIGXCPU', 'SIGXFSZ'];
const featureRules = [
  ['crashpad_database_required', /(?:^|\s)--database is required(?:\s|$)/u],
  ['crashpad_handler_marker', /crashpad_handler/u],
  ['profile_singleton_marker', /ProcessSingleton/u],
  ['temp_directory_operation', /\bmkdtemp\b/u],
  ['disk_space_marker', /\bENOSPC\b|No space left on device/u],
  ['disk_quota_marker', /\bEDQUOT\b|Disk quota exceeded/u],
  ['memory_thread_marker', /\bENOMEM\b|Cannot allocate memory|Resource temporarily unavailable|pthread_create/u],
  ['sandbox_marker', /No usable sandbox|SUID sandbox|sandbox.{0,120}(?:incorrect|not found|refused)/iu],
  ['namespace_marker', /Failed to move to new namespace|namespace.{0,120}Operation not permitted/iu],
  ['display_marker', /Missing X server|X11 connection rejected|Authorization required|No protocol specified|cannot open display|Unable to open X display|Failed to connect to X server/iu],
  ['dependency_marker', /Host system is missing dependencies|error while loading shared libraries|cannot open shared object file|Missing dependencies/iu],
  ['executable_marker', /Executable doesn't exist|\bENOENT\b|\bEACCES\b|Permission denied|not executable/iu],
  ['permission_marker', /\bEACCES\b|Permission denied|Operation not permitted/u],
];
const featureIDs = featureRules.map(([id]) => id).sort();
const emptyTermination = state => ({ state, exitCode: null, signal: null });
const unknown = inputState => ({ version: 'browserdriver.m16-launch-failure.v2', inputState,
  category: 'unknown_launch_failure', termination: emptyTermination('absent'), features: [] });

function categoryFor(text) {
  if (/No usable sandbox|SUID sandbox|Failed to move to new namespace|sandbox.{0,120}(?:incorrect|not found|refused)|namespace.{0,120}Operation not permitted/iu.test(text)) return 'sandbox_refused';
  if (/Missing X server|X11 connection rejected|Authorization required|No protocol specified|cannot open display|Unable to open X display|Failed to connect to X server/iu.test(text)) return 'display_auth_refused';
  if (/Host system is missing dependencies|error while loading shared libraries|cannot open shared object file|Missing dependencies/iu.test(text)) return 'host_dependency_missing';
  if (/ProcessSingleton|\bmkdtemp\b|\bEDQUOT\b|Disk quota exceeded|\bENOMEM\b|Cannot allocate memory|Resource temporarily unavailable|pthread_create|\bENOSPC\b|No space left/iu.test(text)) return 'host_resource_unavailable';
  if (/Executable doesn't exist|\bENOENT\b|\bEACCES\b|Permission denied|not executable/iu.test(text)) return 'executable_unavailable';
  if (/Timeout \d+ms exceeded|timed? ?out/iu.test(text)) return 'launch_timeout';
  if (/Target page, context or browser has been closed|Browser closed|Failed to connect to browser/iu.test(text)) return 'closed_before_connection';
  return 'unknown_launch_failure';
}

function reduceLaunchFailure(error) {
  let message;
  try { message = error && error.message; } catch { return unknown('unavailable'); }
  if (typeof message !== 'string') return unknown('unavailable');
  // Do not slice or hash oversize input: a retained prefix could hide conflicts.
  if (message.length > 65536) return unknown('oversize');
  if (message.includes('\0') || !message.isWellFormed()) return unknown('malformed');
  const lines = message.split(/\r?\n/u);
  if (lines.length > 1024 || lines.some(line => line.length > 8192)) return unknown('oversize');
  const observed = new Map(), featureText = [];
  let malformed = false, truncated = false;
  for (let index = 0; index < lines.length; index += 1) {
    // Installed Playwright duplicates its process log in the call log. Accept
    // that exact indentation, coalesce identical records, compare PID only in
    // memory and never retain it in the diagnostic.
    const line = lines[index].replace(/^\s*(?:-\s*)?/u, '');
    const event = /^\[pid=[^\]\r\n]{1,32}\] <process did exit:/u.test(line);
    if (event) {
      const match = /^\[pid=([1-9]\d{0,9})\] <process did exit: exitCode=(null|0|[1-9]\d{0,2}), signal=(null|SIG[A-Z0-9]{1,12})>$/u.exec(line);
      if (!match) { if (!line.endsWith('>')) truncated = true; else malformed = true; continue; }
      const exitCode = match[2] === 'null' ? null : Number(match[2]);
      const signal = match[3] === 'null' ? null : match[3];
      if ((exitCode !== null && exitCode > 255) || (signal !== null && !signals.includes(signal)) ||
          (exitCode === null) === (signal === null)) { malformed = true; continue; }
      observed.set(`${match[1]}/${exitCode}/${signal}`, { state: signal ? 'signaled' : 'exited', exitCode, signal });
      continue;
    }
    // A partial installed event at EOF cannot establish termination. Command
    // and cleanup lines are deliberately not sources for fatal-feature IDs.
    if (/^\[pid=[^\]\r\n]{1,32}\] <process did ex/u.test(line)) { truncated = true; continue; }
    const stderr = /^\[pid=(?:[1-9]\d{0,9}|N\/A)\]\[err\] (.*)$/u.exec(line);
    if (stderr) featureText.push(stderr[1]);
    else if (index === 0 && !line.startsWith('<launching>') && !line.startsWith('[pid=')) featureText.push(line);
  }
  const text = featureText.join('\n');
  const termination = malformed ? emptyTermination('malformed') : truncated ? emptyTermination('truncated') :
    observed.size > 1 ? emptyTermination('ambiguous') : observed.size ? [...observed.values()][0] : emptyTermination('absent');
  return { version: 'browserdriver.m16-launch-failure.v2', inputState: 'complete', category: categoryFor(text), termination,
    features: featureRules.filter(([, pattern]) => pattern.test(text)).map(([id]) => id).sort() };
}

function isClosedLaunchFailure(value) {
  const keys = (item, expected) => item && typeof item === 'object' && !Array.isArray(item) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(item)) &&
    Object.getOwnPropertyNames(item).sort().join('|') === expected.slice().sort().join('|') &&
    Object.values(Object.getOwnPropertyDescriptors(item)).every(descriptor => Object.hasOwn(descriptor, 'value'));
  try {
    if (!keys(value, ['version', 'inputState', 'category', 'termination', 'features']) ||
        value.version !== 'browserdriver.m16-launch-failure.v2' || !categories.includes(value.category) ||
        !['complete', 'unavailable', 'oversize', 'malformed'].includes(value.inputState) ||
        !keys(value.termination, ['state', 'exitCode', 'signal']) || !Array.isArray(value.features) ||
        Object.getPrototypeOf(value.features) !== Array.prototype ||
        Object.getOwnPropertyNames(value.features).sort().join('|') !==
          ['length', ...value.features.map((_, index) => String(index))].sort().join('|') ||
        !Object.values(Object.getOwnPropertyDescriptors(value.features)).every(descriptor => Object.hasOwn(descriptor, 'value')) ||
        value.features.length > featureIDs.length || value.features.some(id => !featureIDs.includes(id)) ||
        value.features.join('|') !== [...new Set(value.features)].sort().join('|')) return false;
    const { state, exitCode, signal } = value.termination;
    if (state === 'exited') {
      if (!Number.isInteger(exitCode) || exitCode < 0 || exitCode > 255 || signal !== null) return false;
    } else if (state === 'signaled') {
      if (exitCode !== null || !signals.includes(signal)) return false;
    } else if (!['absent', 'ambiguous', 'malformed', 'truncated'].includes(state) || exitCode !== null || signal !== null) return false;
    return value.inputState === 'complete' || (value.category === 'unknown_launch_failure' && state === 'absent' && value.features.length === 0);
  } catch { return false; }
}

function classifyLaunchFailure(error) { return reduceLaunchFailure(error).category; }
module.exports = { classifyLaunchFailure, reduceLaunchFailure, isClosedLaunchFailure };
