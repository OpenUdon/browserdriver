"""Private, fixture-only subreaper. No production driver imports or fallback kills."""
import ctypes
import hashlib
import json
import os
import secrets
import select
import signal
import socket
import stat
import sys
import time

VERSION = "browserdriver.m16-supervisor.v1"
MAX_CHILDREN = 256
MAX_PACKET = 131072
NODE = "/home/peter/.nvm/versions/node/v24.14.1/bin/node"
RUN_NS, SIGNAL_NS, SETTLE_NS, FINAL_NS = 180_000_000_000, 5_000_000_000, 10_000_000_000, 30_000_000_000


class Refused(Exception):
    pass


class ReportDirectory:
    """Exclusive parent-owned result destination, retained before any fork."""
    def __init__(self, path):
        if not os.path.isabs(path) or os.path.normpath(path) != path or os.path.realpath(os.path.dirname(path)) != os.path.dirname(path):
            raise Refused()
        os.mkdir(path, 0o700)
        self.path = path
        before = os.lstat(path)
        self.fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        opened = os.fstat(self.fd)
        self.identity = {"device": str(opened.st_dev), "inode": str(opened.st_ino), "uid": opened.st_uid,
                         "gid": opened.st_gid, "mode": stat.S_IMODE(opened.st_mode)}
        if before.st_dev != opened.st_dev or before.st_ino != opened.st_ino:
            self.close()
            raise Refused()
        self.stable()

    def stable(self):
        for info in (os.lstat(self.path), os.fstat(self.fd)):
            actual = {"device": str(info.st_dev), "inode": str(info.st_ino), "uid": info.st_uid,
                      "gid": info.st_gid, "mode": stat.S_IMODE(info.st_mode)}
            if not stat.S_ISDIR(info.st_mode) or actual != self.identity or info.st_uid != os.getuid() or actual["mode"] != 0o700:
                raise Refused()
        if os.path.realpath(self.path) != self.path:
            raise Refused()

    def close(self):
        os.close(self.fd)


def identity(pid):
    """Bracket start/parent/UID; never read argv, environment or process prose."""
    path = "/proc/%d" % pid
    def read():
        with open(path + "/stat", encoding="ascii") as stream:
            value = stream.read()
        fields = value[value.rfind(")") + 2:].split()
        return {"pid": pid, "start": fields[19], "uid": os.stat(path).st_uid,
                "parent": int(fields[1])}
    before, after = read(), read()
    if before != after:
        raise Refused()
    return after


def key(value):
    return value["pid"], value["start"], value["uid"]


def public(value):
    return {name: value[name] for name in ("pid", "start", "uid")}


def enable_subreaper():
    # No ignored SIGCHLD, SA_NOCLDWAIT or asynchronous/competing child reaper.
    # Python's sigaction(SIG_DFL) installs default flags; this process owns waitid.
    if signal.getsignal(signal.SIGCHLD) is not signal.SIG_DFL:
        raise Refused()
    signal.signal(signal.SIGCHLD, signal.SIG_DFL)
    libc = ctypes.CDLL(None, use_errno=True)
    flag = ctypes.c_int()
    libc.prctl.restype = ctypes.c_int
    if libc.prctl(ctypes.c_int(36), ctypes.c_ulong(1), ctypes.c_ulong(0), ctypes.c_ulong(0), ctypes.c_ulong(0)) != 0 or libc.prctl(ctypes.c_int(37), ctypes.byref(flag), ctypes.c_ulong(0), ctypes.c_ulong(0), ctypes.c_ulong(0)) != 0 or flag.value != 1:
        raise Refused()
    if not all(hasattr(os, name) for name in ("pidfd_open", "waitid", "WNOWAIT", "P_PIDFD")) or not hasattr(signal, "pidfd_send_signal"):
        raise Refused()
    # Harmless capability refusal before a child exists. Opening our own pidfd
    # and requesting child wait proves kernel support without delivering signals.
    fd = os.pidfd_open(os.getpid(), 0)
    try:
        try:
            os.waitid(os.P_PIDFD, fd, os.WEXITED | os.WNOHANG | os.WNOWAIT)
        except ChildProcessError:
            pass
        else:
            raise Refused()
    finally:
        os.close(fd)


class Supervisor:
    def __init__(self):
        enable_subreaper()  # Before fork; never exec this persistent owner away.
        self.self_identity = identity(os.getpid())
        self.children = {}
        self.fds = {}
        self.root = None
        self.echild = False
        self.gap = False
        self.signals = []
        self.run_deadline_ns = None
        self.output_custody = None

    def capture(self, pid):
        before = identity(pid)
        if before["parent"] != os.getpid() or key(identity(os.getpid())) != key(self.self_identity):
            raise Refused()
        fd = os.pidfd_open(pid, 0)
        try:
            after = identity(pid)
            if before != after or after["parent"] != os.getpid():
                raise Refused()
            child_key = key(after)
            if child_key not in self.children:
                if len(self.children) >= MAX_CHILDREN or any(value["identity"]["pid"] == pid and not value["reaped"] for value in self.children.values()):
                    raise Refused()
                self.children[child_key] = {"identity": public(after), "parentIdentity": public(self.self_identity),
                    "proof": "kernel-child", "wait": None, "reaped": False}
                self.fds[child_key] = fd
                fd = None
            return child_key
        finally:
            if fd is not None:
                os.close(fd)

    def poll(self):
        if key(identity(os.getpid())) != key(self.self_identity) or signal.getsignal(signal.SIGCHLD) is not signal.SIG_DFL:
            raise Refused()
        # Live adopted children are kernel-enumerated, not selected by markers.
        with open("/proc/self/task/%d/children" % os.getpid(), encoding="ascii") as stream:
            pids = stream.read(16385)
        if len(pids) > 16384:
            raise Refused()
        for value in pids.split():
            try:
                self.capture(int(value))
            except (FileNotFoundError, ProcessLookupError):
                # A previously unobserved *direct* child cannot vanish without
                # our wait owner reaping it. Treat this as lost custody.
                self.gap = True
        while True:
            try:
                event = os.waitid(os.P_ALL, 0, os.WEXITED | os.WNOHANG | os.WNOWAIT)
            except ChildProcessError:
                self.echild = True
                break
            if event is None:
                self.echild = False
                break
            # WNOWAIT retains /proc identity and prevents PID reuse until the
            # exact pidfd-specific reap has captured closed exit evidence.
            child_key = self.capture(event.si_pid)
            record = self.children[child_key]
            codes = {os.CLD_EXITED: "exited", os.CLD_KILLED: "killed", os.CLD_DUMPED: "dumped"}
            if record["reaped"] or record["wait"] is not None or event.si_code not in codes or not 0 <= event.si_status <= 255:
                raise Refused()
            confirmed = os.waitid(os.P_PIDFD, self.fds[child_key], os.WEXITED | os.WNOHANG | os.WNOWAIT)
            if confirmed != event or key(identity(event.si_pid)) != child_key:
                raise Refused()
            record["wait"] = {"code": codes[event.si_code], "status": event.si_status}
            reaped = os.waitid(os.P_PIDFD, self.fds[child_key], os.WEXITED | os.WNOHANG)
            if reaped != event:
                raise Refused()
            record["reaped"] = True
            os.close(self.fds.pop(child_key))

    def snapshot(self, refresh=True, uncertain=False):
        if refresh:
            self.poll()
        return {"version": VERSION, "supervisor": public(self.self_identity), "controller": self.root,
                "subreaperVerified": True, "gap": self.gap, "children": list(self.children.values()),
                "descendantsSettled": not uncertain and self.root is not None and all(record["reaped"] or key(record["identity"]) == key(self.root) for record in self.children.values()),
                "echild": None if uncertain else self.echild, "runDeadlineNs": str(self.run_deadline_ns),
                "outputCustody": self.output_custody}

    def signal_child(self, child_key, signum, deadline):
        if time.monotonic_ns() >= deadline:
            return "budget-expired"
        record = self.children.get(child_key)
        if record is None or child_key == key(self.self_identity) or record["reaped"] or record["identity"]["uid"] != os.getuid():
            return "ownership-refused"
        try:
            current = identity(record["identity"]["pid"])
            if key(current) != child_key or current["parent"] != os.getpid():
                return "ownership-refused"
            if time.monotonic_ns() >= deadline:
                return "budget-expired"
            signal.pidfd_send_signal(self.fds[child_key], signum, None, 0)
            return "sent"
        except (FileNotFoundError, ProcessLookupError):
            return "already-absent"


def spawn_root(supervisor, command, environment):
    parent, child = socket.socketpair()
    nonce = secrets.token_hex(32)
    pid = os.fork()
    if pid == 0:
        parent.close()
        fd = child.detach()
        if fd != 3:
            os.dup2(fd, 3)
            os.close(fd)
        os.set_inheritable(3, True)
        null = os.open("/dev/null", os.O_RDONLY)
        os.dup2(null, 0)
        if null != 0:
            os.close(null)
        os.execve(command[0], command, {**environment, "BROWSERDRIVER_M16_SUPERVISOR_NONCE": nonce})
    child.close()
    supervisor.root = public(supervisor.children[supervisor.capture(pid)]["identity"])
    parent.setblocking(False)
    return parent, nonce


def packet(value):
    encoded = json.dumps(value, separators=(",", ":")).encode("ascii") + b"\n"
    if len(encoded) > MAX_PACKET:
        raise Refused()
    return encoded


def decode_packet(raw, nonce, sequence, controller):
    def pairs(values):
        result = {}
        for name, value in values:
            if name in result:
                raise Refused()
            result[name] = value
        return result
    try:
        value = json.loads(raw, object_pairs_hook=pairs)
    except (ValueError, UnicodeError, RecursionError):
        raise Refused() from None
    candidate = value.get("controller") if isinstance(value, dict) else None
    if not isinstance(candidate, dict) or set(candidate) != {"pid", "start", "uid"} or type(candidate["pid"]) is not int or candidate["pid"] <= 0 or type(candidate["uid"]) is not int or candidate["uid"] < 0 or not isinstance(candidate["start"], str) or not candidate["start"].isascii() or not candidate["start"].isdigit() or not 1 <= len(candidate["start"]) <= 20:
        raise Refused()
    if not isinstance(value, dict) or set(value) != {"version", "nonce", "sequence", "controller", "operation", "sha256", "deadlineNs", "stage"} or value["version"] != VERSION or value["nonce"] != nonce or type(value["sequence"]) is not int or value["sequence"] != sequence or value["controller"] != controller or not isinstance(value["deadlineNs"], str) or not value["deadlineNs"].isascii() or not value["deadlineNs"].isdigit() or not 1 <= len(value["deadlineNs"]) <= 20:
        raise Refused()
    if value["operation"] not in ("snapshot", "stage", "final", "finish") or (value["operation"] != "finish" and value["sha256"] is not None) or (value["operation"] == "finish" and (not isinstance(value["sha256"], str) or len(value["sha256"]) != 64 or any(char not in "0123456789abcdef" for char in value["sha256"]))):
        raise Refused()
    if (value["operation"] == "stage" and value["stage"] not in ("normal-settle", "display-stop", "display-settle", "failure-term", "failure-term-settle", "failure-kill", "failure-kill-settle")) or (value["operation"] != "stage" and value["stage"] is not None):
        raise Refused()
    return value


def run(supervisor, command, environment):
    supervisor.run_deadline_ns = time.monotonic_ns() + RUN_NS
    connection, nonce = spawn_root(supervisor, command, environment)
    sequence, incoming, outgoing = 1, b"", b""
    finished_hash, final_deadline, eof, fault, cancelled = None, None, False, False, False
    finish_ack_queued, finish_ack_sent, protocol_complete = False, False, False
    phase, phase_deadline = "run", supervisor.run_deadline_ns
    stage_deadlines = {}
    allowed = {"normal-settle": ({"run"}, 30_000_000_000),
               "display-stop": ({"normal-settle"}, 3_000_000_000),
               "display-settle": ({"display-stop"}, SETTLE_NS),
               "failure-term": ({"run", "normal-settle", "display-stop", "display-settle"}, SIGNAL_NS),
               "failure-term-settle": ({"failure-term"}, SETTLE_NS),
               "failure-kill": ({"failure-term-settle"}, SIGNAL_NS),
               "failure-kill-settle": ({"failure-kill"}, SETTLE_NS)}
    def cancel(_signum, _frame):
        nonlocal cancelled
        cancelled = True
    signal.signal(signal.SIGTERM, cancel)
    signal.signal(signal.SIGINT, cancel)
    try:
        while True:
            supervisor.poll()
            root_record = supervisor.children[key(supervisor.root)]
            if cancelled or root_record["reaped"] and (finished_hash is None or root_record["wait"] != {"code": "exited", "status": 0}):
                raise Refused()
            protocol_complete = finished_hash is not None and finish_ack_sent and eof and not incoming and not outgoing
            if supervisor.echild and protocol_complete:
                break
            if time.monotonic_ns() >= phase_deadline:
                raise Refused()
            wait = min(0.025, max(0, (phase_deadline - time.monotonic_ns()) / 1_000_000_000))
            readable, writable, _ = select.select([] if eof else [connection], [connection] if outgoing and not eof else [], [], wait)
            if writable:
                outgoing = outgoing[connection.send(outgoing):]
                if finish_ack_queued and not outgoing:
                    finish_ack_sent = True
            if readable:
                chunk = connection.recv(MAX_PACKET + 1)
                if not chunk:
                    eof = True
                    if incoming or outgoing or finished_hash is None or not finish_ack_sent:
                        raise Refused()
                    continue
                if len(chunk) > MAX_PACKET - len(incoming):
                    raise Refused()
                incoming += chunk
                while b"\n" in incoming:
                    raw, incoming = incoming.split(b"\n", 1)
                    request = decode_packet(raw, nonce, sequence, supervisor.root)
                    if finished_hash is not None or (request["operation"] == "final" and final_deadline is not None) or (request["operation"] == "finish" and final_deadline is None):
                        raise Refused()
                    requested_deadline = int(request["deadlineNs"])
                    if request["operation"] == "stage":
                        target = request["stage"]
                        previous, maximum = allowed[target]
                        if phase not in previous or target in stage_deadlines or not time.monotonic_ns() < requested_deadline <= time.monotonic_ns() + maximum:
                            raise Refused()
                        phase, phase_deadline = target, requested_deadline
                        stage_deadlines[target] = requested_deadline
                    if request["operation"] == "final":
                        final_deadline = requested_deadline
                        if not time.monotonic_ns() < final_deadline <= time.monotonic_ns() + FINAL_NS:
                            raise Refused()
                        phase, phase_deadline = "final", final_deadline
                    if request["operation"] == "finish":
                        finished_hash = request["sha256"]
                        finish_ack_queued = True
                    response = packet({"version": VERSION, "nonce": nonce, "sequence": sequence, "operation": request["operation"], "custody": supervisor.snapshot()})
                    if len(response) > MAX_PACKET - len(outgoing):
                        raise Refused()
                    outgoing += response
                    sequence += 1
    except (Refused, OSError, ValueError, RecursionError):
        # An expired work deadline still has the original finite cleanup stages.
        # Reuse any already admitted stage/final deadlines; never renew them.
        fault = True
        incoming = outgoing = b""
        connection.close()
        for name, signum in (("failure-term", signal.SIGTERM), ("failure-kill", signal.SIGKILL)):
            stage = stage_deadlines.get(name, time.monotonic_ns() + SIGNAL_NS)
            if final_deadline is not None:
                stage = min(stage, final_deadline)
            settle = stage_deadlines.get(name + "-settle", stage + SETTLE_NS)
            if final_deadline is not None:
                settle = min(settle, final_deadline)
            while time.monotonic_ns() < settle and not supervisor.echild:
                try:
                    supervisor.poll()
                    # Keep the same signal stage alive across adoption/reap
                    # polls; killing a parent may reveal another owned child.
                    for child_key, record in supervisor.children.items():
                        if time.monotonic_ns() >= stage:
                            break
                        if not record["reaped"] and not any(key(value["identity"]) == child_key and value["signal"] == signal.Signals(signum).name for value in supervisor.signals):
                            state = supervisor.signal_child(child_key, signum, min(stage, time.monotonic_ns() + 3_000_000_000))
                            supervisor.signals.append({"identity": record["identity"], "signal": signal.Signals(signum).name, "purpose": "controller-failure", "state": state})
                except (Refused, OSError):
                    supervisor.gap = True
                select.select([], [], [], min(0.025, max(0, (settle - time.monotonic_ns()) / 1_000_000_000)))
        if final_deadline is None:
            final_deadline = time.monotonic_ns() + FINAL_NS
        while time.monotonic_ns() < final_deadline and not supervisor.echild:
            try:
                supervisor.poll()
            except (Refused, OSError):
                supervisor.gap = True
            select.select([], [], [], min(0.025, max(0, (final_deadline - time.monotonic_ns()) / 1_000_000_000)))
    finally:
        connection.close()
    try:
        final_custody = supervisor.snapshot()
    except (Refused, OSError, ValueError):
        supervisor.gap = True
        fault = True
        final_custody = supervisor.snapshot(refresh=False, uncertain=True)
    return {"custody": final_custody, "signals": supervisor.signals, "fault": fault,
            "finishedSHA256": finished_hash, "protocolComplete": protocol_complete}


def publish_qualification_report(destination, supervisor, result):
    destination.stable()
    report = None
    try:
        fd = os.open("qualification-node.json", os.O_RDONLY | os.O_NOFOLLOW, dir_fd=destination.fd)
        try:
            info = os.fstat(fd)
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1 or info.st_size > 131072:
                raise Refused()
            raw = os.read(fd, 131073)
            if len(raw) != info.st_size or hashlib.sha256(raw).hexdigest() != result["finishedSHA256"]:
                raise Refused()
            report = json.loads(raw)
            if not isinstance(report, dict) or report.get("version") != "browserdriver.m16-qualification.v1" or report.get("fixtureOnly") is not True or report.get("state") not in ("passed", "failed-or-unsettled"):
                raise Refused()
        finally:
            os.close(fd)
    except (OSError, ValueError, RecursionError, Refused):
        report = {"version": "browserdriver.m16-qualification.v1", "fixtureOnly": True, "state": "failed-or-unsettled"}
    root = supervisor.children[key(supervisor.root)]
    accepted = result["protocolComplete"] and result["custody"]["echild"] is True and not result["fault"] and not result["custody"]["gap"] and not result["signals"] and root["wait"] == {"code": "exited", "status": 0}
    report["supervisorCustody"] = result
    if not accepted:
        report["state"] = "failed-or-unsettled"
    destination.stable()
    fd = os.open("qualification.json", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=destination.fd)
    try:
        with os.fdopen(fd, "w", encoding="ascii") as stream:
            json.dump(report, stream, indent=2)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
    finally:
        pass
    os.fsync(destination.fd)
    destination.stable()
    return report


def qualify(output):
    if sys.version_info[:3] != (3, 14, 4) or not sys.flags.isolated or not sys.flags.no_site or not sys.flags.dont_write_bytecode or os.environ.get("BROWSERDRIVER_M16_QUALIFY") != "true" or not os.path.isabs(output) or os.path.normpath(output) != output or output == "/":
        raise Refused()
    if os.path.lexists(output) or len((output + "/tmp").encode("utf8")) + 64 >= 108:
        raise Refused()
    supervisor = Supervisor()  # Capability refusal precedes output creation.
    destination = ReportDirectory(output)
    supervisor.output_custody = destination.identity
    worktree = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    try:
        result = run(supervisor, [NODE, worktree + "/scripts/m16-qualify.mjs", output],
                     {"PATH": os.path.dirname(NODE) + ":/usr/bin:/bin", "LANG": "C.UTF-8", "CI": "1", "BROWSERDRIVER_M16_QUALIFY": "true"})
        report = publish_qualification_report(destination, supervisor, result)
        return 0 if report["state"] == "passed" else 1
    finally:
        destination.close()


if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            raise Refused()
        sys.exit(qualify(sys.argv[1]))
    except (Refused, OSError, ValueError):
        print("M16 qualification supervisor refused", file=sys.stderr)
        sys.exit(1)
