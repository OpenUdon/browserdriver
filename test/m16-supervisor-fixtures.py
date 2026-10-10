"""Offline synthetic process checks; never imports or starts browser code."""
import importlib.util
import errno
import json
import os
from pathlib import Path
import signal
import sys
import time
import tempfile
import unittest
from unittest import mock

sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location("m16_supervisor", Path(__file__).resolve().parents[1] / "scripts/m16-supervisor.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

ROOT = r'''
import json, os, signal, socket, sys, time
sys.excepthook = lambda *_: None  # Exit evidence is retained; raw fixture prose is not.
connection = socket.socket(fileno=3)
nonce = os.environ['BROWSERDRIVER_M16_SUPERVISOR_NONCE']
with open('/proc/self/stat') as stream: value = stream.read()
controller = {'pid': os.getpid(), 'start': value[value.rfind(')') + 2:].split()[19], 'uid': os.getuid()}
sequence = 0
def request(operation, checksum=None):
    global sequence
    sequence += 1
    connection.sendall((json.dumps({'version': 'browserdriver.m16-supervisor.v1', 'nonce': nonce, 'sequence': sequence,
      'controller': controller, 'operation': operation, 'sha256': checksum,
      'deadlineNs': str(time.monotonic_ns() + (30_000_000_000 if operation == 'final' else 3_000_000_000)), 'stage': None}, separators=(',', ':')) + '\n').encode())
    incoming = b''
    while b'\n' not in incoming: incoming += connection.recv(131072)
    return json.loads(incoming)
request('snapshot')
scenario = sys.argv[1]
if scenario in ('double-fork', 'early-zombie', 'live-orphan', 'crash', 'cancel', 'malformed', 'deep-json', 'stall', 'node-exit-with-orphan'):
    parent = os.fork()
    if parent == 0:
        child = os.fork()
        if child == 0:
            if scenario in ('live-orphan', 'crash', 'cancel', 'malformed', 'deep-json', 'stall', 'node-exit-with-orphan'): time.sleep(0.3 if scenario not in ('crash', 'cancel', 'stall') else 30)
            os._exit(0)
        os._exit(0)
    os.waitpid(parent, 0)
    if scenario == 'crash': os._exit(7)
    if scenario == 'cancel':
        os.kill(os.getppid(), signal.SIGTERM)
        time.sleep(30)
    if scenario == 'malformed':
        connection.sendall(b'{"bad":true}\n')
        time.sleep(30)
    if scenario == 'deep-json':
        connection.sendall(b'[' * 2000 + b']' * 2000 + b'\n')
        time.sleep(30)
    if scenario == 'stall': time.sleep(30)
    if scenario == 'early-zombie': time.sleep(0.15)
    if scenario == 'live-orphan':
        request('snapshot')
        time.sleep(0.4)
    else: time.sleep(0.05)
elif scenario == 'oversize':
    connection.sendall(b'x' * 131073)
    time.sleep(30)
elif scenario == 'kill-adoption':
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    if os.fork() == 0:
        time.sleep(30)
        os._exit(0)
    time.sleep(30)
request('final')
if scenario == 'finish-unread':
    sequence += 1
    connection.sendall((json.dumps({'version': 'browserdriver.m16-supervisor.v1', 'nonce': nonce, 'sequence': sequence,
      'controller': controller, 'operation': 'finish', 'sha256': '0' * 64, 'deadlineNs': str(time.monotonic_ns()+3_000_000_000), 'stage': None})+'\n').encode())
    connection.close()
    os._exit(0)
request('finish', '0' * 64)
if scenario == 'finish-truncated': connection.sendall(b'{')
connection.close()
'''


class FixtureTests(unittest.TestCase):
    def execute(self, scenario):
        supervisor = module.Supervisor()
        result = module.run(supervisor, ["/usr/bin/python3.14", "-I", "-S", "-c", ROOT, scenario], {"PATH": "/usr/bin:/bin"})
        self.assertTrue(result["custody"]["echild"])
        self.assertFalse(result["custody"]["gap"])
        self.assertTrue(all(record["reaped"] and record["wait"] is not None for record in result["custody"]["children"]))
        self.assertEqual(supervisor.fds, {})
        return result

    def test_double_fork_and_exit_before_first_scan(self):
        for scenario in ("double-fork", "early-zombie", "live-orphan", "node-exit-with-orphan"):
            with self.subTest(scenario=scenario):
                result = self.execute(scenario)
                self.assertFalse(result["fault"])
                self.assertEqual(result["signals"], [])
                adopted = [record for record in result["custody"]["children"] if record["identity"] != result["custody"]["controller"]]
                self.assertEqual(len(adopted), 1)
                self.assertEqual(adopted[0]["parentIdentity"], result["custody"]["supervisor"])
                self.assertEqual(adopted[0]["proof"], "kernel-child")
                self.assertEqual(adopted[0]["wait"], {"code": "exited", "status": 0})

    def test_crash_and_invalid_ipc_reap_all_children(self):
        for scenario in ("crash", "cancel", "malformed", "deep-json", "oversize", "finish-unread", "finish-truncated"):
            with self.subTest(scenario=scenario):
                result = self.execute(scenario)
                self.assertTrue(result["fault"])
                self.assertTrue(all(item["identity"] != result["custody"]["supervisor"] for item in result["signals"]))

    def test_expired_work_and_late_adoption_receive_original_cleanup_stages(self):
        for scenario in ("stall", "kill-adoption"):
            with self.subTest(scenario=scenario), mock.patch.object(module, "RUN_NS", 500_000_000), mock.patch.object(module, "SIGNAL_NS", 200_000_000), mock.patch.object(module, "SETTLE_NS", 100_000_000), mock.patch.object(module, "FINAL_NS", 300_000_000):
                result = self.execute(scenario)
                self.assertTrue(result["fault"])
                self.assertTrue(any(record["state"] == "sent" for record in result["signals"]))
                if scenario == "kill-adoption":
                    killed = [record for record in result["signals"] if record["signal"] == "SIGKILL" and record["state"] == "sent"]
                    self.assertEqual(len(killed), 2)
                    self.assertEqual(len({module.key(record["identity"]) for record in killed}), 2)

    def test_persistent_inspection_failure_retains_bounded_uncertain_evidence(self):
        for failure in (PermissionError(errno.EACCES, "fixture"), OSError(errno.EIO, "fixture"), module.Refused()):
            with self.subTest(failure=type(failure).__name__):
                supervisor = module.Supervisor()
                begin = time.monotonic_ns()
                with mock.patch.object(supervisor, "poll", side_effect=failure), mock.patch.object(module, "SIGNAL_NS", 30_000_000), mock.patch.object(module, "SETTLE_NS", 30_000_000), mock.patch.object(module, "FINAL_NS", 30_000_000):
                    result = module.run(supervisor, ["/usr/bin/python3.14", "-I", "-S", "-c", ROOT, "stall"], {"PATH": "/usr/bin:/bin"})
                self.assertLess(time.monotonic_ns() - begin, 5_000_000_000)
                self.assertTrue(result["fault"])
                self.assertTrue(result["custody"]["gap"])
                self.assertIsNone(result["custody"]["echild"])
                self.assertFalse(result["custody"]["descendantsSettled"])
                self.assertFalse(result["protocolComplete"])
                self.assertEqual(result["custody"]["children"][0]["identity"], supervisor.root)
                self.assertFalse(result["custody"]["children"][0]["reaped"])
                # Capability restoration is test-only positive fixture cleanup;
                # the failed run itself claimed no settlement or new authority.
                deadline = time.monotonic_ns() + 2_000_000_000
                while time.monotonic_ns() < deadline and not supervisor.echild:
                    supervisor.poll()
                    for child_key, child in supervisor.children.items():
                        if not child["reaped"]:
                            supervisor.signal_child(child_key, signal.SIGTERM, deadline)
                    time.sleep(0.01)
                self.assertTrue(supervisor.echild)

    def test_parent_destination_retains_pre_mkdir_controller_failure(self):
        with tempfile.TemporaryDirectory(prefix="m16-parent-report-") as directory:
            supervisor = module.Supervisor()
            destination = module.ReportDirectory(directory + "/owned")
            supervisor.output_custody = destination.identity
            try:
                result = module.run(supervisor, [module.NODE, "-e", "process.exit(7)"], {"PATH": "/usr/bin:/bin"})
                report = module.publish_qualification_report(destination, supervisor, result)
                saved = json.loads(Path(destination.path, "qualification.json").read_text())
                self.assertEqual(report, saved)
                self.assertEqual(saved["state"], "failed-or-unsettled")
                self.assertEqual(saved["supervisorCustody"]["custody"]["children"][0]["wait"], {"code": "exited", "status": 7})
                self.assertTrue(saved["supervisorCustody"]["custody"]["echild"])
                self.assertFalse(Path(destination.path, "qualification-node.json").exists())
                self.assertEqual(os.stat(destination.path).st_mode & 0o777, 0o700)
                self.assertEqual(os.stat(Path(destination.path, "qualification.json")).st_mode & 0o777, 0o600)
            finally:
                destination.close()

    def test_parent_destination_persists_unknown_custody_before_child_mkdir(self):
        for failure in (PermissionError(errno.EACCES, "fixture"), OSError(errno.EIO, "fixture")):
            with self.subTest(failure=type(failure).__name__), tempfile.TemporaryDirectory(prefix="m16-parent-gap-") as directory:
                supervisor = module.Supervisor()
                destination = module.ReportDirectory(directory + "/owned")
                supervisor.output_custody = destination.identity
                try:
                    with mock.patch.object(supervisor, "poll", side_effect=failure), mock.patch.object(module, "SIGNAL_NS", 30_000_000), mock.patch.object(module, "SETTLE_NS", 30_000_000), mock.patch.object(module, "FINAL_NS", 30_000_000):
                        result = module.run(supervisor, [module.NODE, "-e", "setInterval(()=>{},1000)"], {"PATH": "/usr/bin:/bin"})
                        report = module.publish_qualification_report(destination, supervisor, result)
                    saved = json.loads(Path(destination.path, "qualification.json").read_text())
                    self.assertEqual(report, saved)
                    self.assertEqual(saved["state"], "failed-or-unsettled")
                    custody = saved["supervisorCustody"]["custody"]
                    self.assertTrue(custody["gap"])
                    self.assertIsNone(custody["echild"])
                    self.assertFalse(custody["descendantsSettled"])
                    self.assertEqual(custody["children"][0]["identity"], supervisor.root)
                    self.assertFalse(custody["children"][0]["reaped"])
                    self.assertFalse(Path(destination.path, "qualification-node.json").exists())
                finally:
                    deadline = time.monotonic_ns() + 2_000_000_000
                    while time.monotonic_ns() < deadline and not supervisor.echild:
                        supervisor.poll()
                        for child_key, child in supervisor.children.items():
                            if not child["reaped"]:
                                supervisor.signal_child(child_key, signal.SIGTERM, deadline)
                        time.sleep(0.01)
                    destination.close()
                    self.assertTrue(supervisor.echild)

    def test_parent_destination_refuses_collision_replacement_and_overwrite(self):
        with tempfile.TemporaryDirectory(prefix="m16-parent-custody-") as directory:
            destination = module.ReportDirectory(directory + "/owned")
            try:
                with self.assertRaises(FileExistsError):
                    module.ReportDirectory(destination.path)
                os.rename(destination.path, directory + "/retained")
                os.mkdir(destination.path, 0o700)
                with self.assertRaises(module.Refused):
                    destination.stable()
                self.assertEqual(os.listdir(destination.path), [])
                os.rmdir(destination.path)
                os.rename(directory + "/retained", destination.path)
                destination.stable()
            finally:
                destination.close()

    def test_existing_node_controller_and_adopted_python_fixture(self):
        supervisor = module.Supervisor()
        client = str(Path(__file__).resolve().parents[1] / "scripts/m16-supervisor-client.cjs")
        code = r'''
const fs = require('node:fs'), {spawn} = require('node:child_process');
const {SupervisorClient} = require(process.argv[1]);
const fields = fs.readFileSync('/proc/self/stat', 'utf8').split(') ').at(-1).split(' ');
const client = new SupervisorClient({pid: process.pid, start: fields[19], uid: process.getuid()}, process.env.BROWSERDRIVER_M16_SUPERVISOR_NONCE);
(async () => {
  await client.request();
  const child = spawn('/usr/bin/python3.14', ['-I', '-S', '-c', 'import os,time; pid=os.fork(); time.sleep(0.05) if pid==0 else None; os._exit(0)'], {stdio: 'ignore'});
  await new Promise(resolve => child.once('close', resolve));
  const deadline = process.hrtime.bigint() + 3_000_000_000n;
  let value;
  do { value = await client.request('snapshot', deadline); await new Promise(resolve => setTimeout(resolve, 25)); }
  while (!value.descendantsSettled && process.hrtime.bigint() < deadline);
  if (!value.descendantsSettled || value.children.length !== 2) throw new Error('synthetic custody refused');
  await client.request('final', process.hrtime.bigint() + 30_000_000_000n);
  await client.request('finish', process.hrtime.bigint() + 3_000_000_000n, '0'.repeat(64)); client.close();
})().catch(() => { client.close(); process.exitCode = 1; });
'''
        result = module.run(supervisor, [module.NODE, "-e", code, client], {"PATH": "/usr/bin:/bin"})
        self.assertFalse(result["fault"])
        self.assertTrue(result["custody"]["echild"])
        self.assertEqual(len(result["custody"]["children"]), 2)
        self.assertEqual(result["signals"], [])

    def test_capability_refusal_before_fork(self):
        previous = signal.getsignal(signal.SIGCHLD)
        try:
            signal.signal(signal.SIGCHLD, signal.SIG_IGN)
            with self.assertRaises(module.Refused):
                module.Supervisor()
        finally:
            signal.signal(signal.SIGCHLD, previous)

    def test_closed_packet_schema_and_replay(self):
        controller = {"pid": 10, "start": "20", "uid": 1000}
        valid = {"version": module.VERSION, "nonce": "a" * 64, "sequence": 1, "controller": controller, "operation": "snapshot", "sha256": None, "deadlineNs": "12345", "stage": None}
        module.decode_packet(json.dumps(valid), "a" * 64, 1, controller)
        for changed in ({**valid, "sequence": 0}, {**valid, "nonce": "b" * 64}, {**valid, "controller": {**controller, "start": "21"}}, {**valid, "controller": {**controller, "pid": 10.0}}, {**valid, "extra": 1}, {**valid, "operation": "signal"}, {**valid, "sha256": "0" * 64}):
            with self.assertRaises(module.Refused):
                module.decode_packet(json.dumps(changed), "a" * 64, 1, controller)
        with self.assertRaises(module.Refused):
            module.decode_packet('{"version":"duplicate","version":"duplicate"}', "a" * 64, 1, controller)
        with self.assertRaises(module.Refused):
            module.decode_packet('[' * 2000 + ']' * 2000, "a" * 64, 1, controller)

    def test_budget_and_reused_identity_do_not_signal(self):
        supervisor = module.Supervisor()
        supervisor.children[(99999999, "0", os.getuid())] = {"identity": {"pid": 99999999, "start": "0", "uid": os.getuid()}, "reaped": False}
        self.assertEqual(supervisor.signal_child((99999999, "0", os.getuid()), signal.SIGTERM, 0), "budget-expired")
        self.assertEqual(supervisor.signal_child(module.key(supervisor.self_identity), signal.SIGTERM, time.monotonic_ns() + 1_000_000), "ownership-refused")
        real = os.fork()
        if real == 0:
            time.sleep(30)
            os._exit(0)
        child_key = supervisor.capture(real)
        old_identity = module.identity
        try:
            module.identity = lambda pid: {**old_identity(pid), "start": "999999999999"} if pid == real else old_identity(pid)
            self.assertEqual(supervisor.signal_child(child_key, signal.SIGTERM, time.monotonic_ns() + 1_000_000_000), "ownership-refused")
        finally:
            module.identity = old_identity
        self.assertEqual(supervisor.signal_child(child_key, signal.SIGTERM, time.monotonic_ns() + 1_000_000_000), "sent")
        deadline = time.monotonic_ns() + 2_000_000_000
        while time.monotonic_ns() < deadline and not supervisor.echild:
            supervisor.poll()
            time.sleep(0.01)
        self.assertTrue(supervisor.echild)

    def test_capability_and_evidence_bounds_refuse(self):
        with mock.patch.object(module.ctypes, "CDLL") as library:
            library.return_value.prctl.return_value = -1
            with self.assertRaises(module.Refused):
                module.Supervisor()
        supervisor = module.Supervisor()
        with self.assertRaises(module.Refused):
            supervisor.capture(os.getppid())  # Foreign ancestry/markers confer nothing.
        real = os.fork()
        if real == 0:
            os._exit(0)
        deadline = time.monotonic_ns() + 2_000_000_000
        event = None
        while event is None and time.monotonic_ns() < deadline:
            event = os.waitid(os.P_PID, real, os.WEXITED | os.WNOHANG | os.WNOWAIT)
            time.sleep(0.01)
        self.assertIsNotNone(event)
        old_identity = module.identity
        try:
            module.identity = lambda pid: (_ for _ in ()).throw(FileNotFoundError()) if pid == real else old_identity(pid)
            with self.assertRaises(FileNotFoundError):
                supervisor.poll()
            # Lost identity did not consume the pending zombie or exit witness.
            self.assertEqual(os.waitid(os.P_PID, real, os.WEXITED | os.WNOHANG | os.WNOWAIT), event)
        finally:
            module.identity = old_identity
        supervisor.poll()
        self.assertTrue(supervisor.echild)
        self.assertTrue(supervisor.gap)
        child = next(iter(supervisor.children.values()))
        self.assertTrue(child["reaped"])


if __name__ == "__main__":
    unittest.main()
