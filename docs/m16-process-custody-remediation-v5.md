# M16 offline process-custody remediation candidate v5

Standing attempt1/v4 remains failed and consumed. Its two potential-only
identities have no retained historical parent proof; later settlement cannot
repair that evidence. Crashpad is a plausible component, with no proved causal
attribution. The standing browser grant remains **STOPPED**, with **1 used / 2
unused**. This candidate was prepared and tested offline only. No browser,
Xvfb, helper, advisory, network, install, privilege or publication action occurred.

## Persistent wait owner

The future fixture entry point is the existing exact Python3.14.4 interpreter
with `-I -S -B`, running `scripts/m16-supervisor.py`. Python stays alive as Node's
parent through all fixture descendants. It sets and GET-verifies
`PR_SET_CHILD_SUBREAPER` before any child exists, preserves default waitable
SIGCHLD, and refuses missing pidfd/waitid kernel capability before fork. It
never execs away the wait owner, uses `Popen.poll`/`wait`, or adds an asynchronous
reaper. Node/libuv continues to own its own direct children.

Python binds its own PID/start/UID, the direct Node controller, and direct
kernel children. `/proc/self/task/<pid>/children` and bracketed `/proc` identity
with a pidfd establish live adoption. Exited children remain pending through
`waitid(WNOWAIT)` while their exact identity, supervisor parent and pidfd are
captured. The pidfd-specific WNOWAIT result must match before a pidfd-specific
reap. Closed exit code/status and positive reap evidence are retained for every
child; no argv, environment, exception prose, credentials or browser data are
exported. Evidence is bounded to256 child identities.

This addresses the scanner's inability to observe a fast-reparented child
before its first scan. Kernel adoption establishes current custody and descent
from the persistent fixture supervisor; it does not reconstruct the child's
earlier browser-main or renderer ancestry. Existing positive browser/worker
lineage remains necessary for each unchanged per-launch sandbox phase proof.
Markers, UID equality, timing and later absence still establish no ownership.
When adoption occurs between the supervisor and /proc inventories, Node obtains
one bounded fresh supervisor snapshot before declaring a potential-marker gap.
Only an exact PID/start/UID kernel-adoption match can resolve that gap.

## Private handoff and complete settlement

A private inherited socketpair connects Python and Node. A fresh256-bit nonce,
exact controller identity, version, monotonically increasing sequence,
canonical bounded frames and closed operations bind each request/reply. No IPC
operation signals an arbitrary supplied PID. Duplicate keys, mismatched roots,
replays, conflicting live identities, excessive/truncated frames, early EOF,
false settlement and changed/retracted reap records refuse qualification.
The nonce is removed from Node's environment before fixture children start.
Receive capacity is checked before allocating concatenated frames; failure
clears retained bytes, destroys the socket and refuses all subsequent chunks.
Deep bounded JSON becomes a closed refusal while Python retains wait ownership
and performs the existing finite cleanup stages.

Node admits retained kernel adoption into its qualification-only lineage,
excluding both supervisor and controller roots from signalable/remaining-owned
sets. Previously observed browser ancestry is retained. Existing pidfd
controllers refuse either root and still have no numeric-PID fallback or
process-group kill. Python handles controller failure/cancellation with its
own positively captured child pidfds and closed failure signal evidence.

Before any controller child starts, Python exclusively creates the approved
0700 output directory after its capability checks and retains the directory FD.
Its device/inode/owner/mode identity binds Node's root through private IPC; Node
validates this parent-created root before setup, erasure and report publication.
Parent report I/O uses the retained FD, no-follow/exclusive files and stable
path/inode checks. Early Node failure or persistent inspection gaps can therefore
retain failed known-identity/unknown-ECHILD evidence even before Node setup;
foreign roots, replacement and overwrite never become a report destination.
Node also retains a verified directory FileHandle. Its own setup/auth/proof/log/
report I/O and joined erasure use that descriptor's filesystem anchor, so a
canonical-root replacement between validation and asynchronous operation cannot
redirect mkdir/write/rm into foreign staging. Dispatch and scans still recheck
canonical custody; drift refuses qualification. Actor HOME/TMPDIR/Xauthority/
fixture selectors retain their approved canonical paths, and production
SessionSave realpath checks are unchanged. The private ACK publisher's anchored
route is limited to the owned `tmp/sandbox-proofs/acks` directory; ordinary
two-argument packet publication retains its existing checks.

Node first requires descendant settlement except itself, preserving the
display/auth/staging join order. It writes a provisional value-free
`qualification-node.json`, binds its SHA256 in an acknowledged finish packet,
then closes both halves of the private FD and exits. A half-close was found to
keep Node alive while its parent awaited ECHILD; the synthetic Node fixture
caught it and the client now releases the FD completely. Python alone writes
final `qualification.json` after reaping Node and observing ECHILD. A provisional
Node pass, absent ECHILD, abnormal controller exit, IPC/custody gap or supervisor
failure cleanup cannot qualify. All adopted exit evidence stays in the final
supervisor custody report.
Final acceptance also requires the finish acknowledgement fully sent, observed
clean peer EOF and empty receive/transmit buffers. ECHILD alone cannot bypass
truncated trailing data or a pending acknowledgement.

The original test120s/run180s, display-ready10s, phase ACK30s, normal browser
settlement30s, failure stages5s/controller≤3s, stage settlement10s and final30s
bounds are retained. Run/display scans and IPC use their remaining monotonic
budgets. Node sends the original absolute final deadline to Python; descendant
settlement, report/finish, Node exit and Python's final ECHILD share that same
30s, including failure cleanup. Python does not start another final30s.
Only the original normal, exact-Xvfb pidfd SIGTERM may qualify.
Python establishes the admitted run180 deadline before Node starts; Node reuses
it rather than starting another180s. The existing named cleanup stages carry
their original absolute deadlines over IPC, with closed transitions and no
stage replay. There is no270s work allowance. Expired admitted work retains its
original finite failure cleanup stages, and each5s TERM/KILL stage remains alive
across adoption polls so newly adopted children can be signalled within the same
budget. Existing stage/final deadlines are never renewed after a controller fault.
If process inspection remains unavailable through cleanup, final serialization
returns the last trusted identity/wait/reap records with `gap:true`, unsettled
descendants and `echild:null`. It does not call the failing inspection again
outside the guard or infer absence from unavailable proof. The final composite
requires ECHILD exactly true; malformed provisional report shapes also refuse.

## Offline evidence and frozen tool closure

The meaningful synthetic fixtures use only exact existing Python3.14.4 and
Node24.14.1. They cover double fork, rapid parent exit, already exited children
before scanning, live adopted children, Node/libuv handoff, controller crash,
cancellation, malformed/oversized IPC, foreign ancestry, PID/start substitution,
ignored SIGCHLD, kernel capability refusal, WNOWAIT retention after unavailable
identity, replay, duplicate/conflicting/retracted records and expired budgets.
They also cover late-adoption reconciliation, acknowledged-finish corruption,
deep JSON, post-failure receive chunks, stalled work and TERM-ignoring parent/
child adoption after KILL. Reduced test-only constants make those deadline
fixtures fast; qualification constants remain180/5/10/30 seconds.
Run-level persistent EACCES, EIO and identity-refusal fixtures verify bounded
unknown-settlement evidence. Their private test processes settle only after the
test restores inspection and separately performs positive pidfd cleanup.
Wrapper-level fake Node checks cover exit before its own mkdir and persistent
EACCES/EIO, asserting an owned0600 failed report with retained identities and
no invented ECHILD/reaps. They call only ordinary module functions; no
qualification selector, browser launcher or futurev5 output is invoked.
Controlled check-to-operation root replacement verifies that owned mkdir/report/
ACK write/removal remain in the retained inode and preserve foreign home/tmp/
files. Only controller-owned filesystem operations use the descriptor alias.
All fixture children are positively reaped; no browser selector or network
fixture is involved.

The final build and focused custody/client controls pass. Full offline tests
pass244 total /228 passed /16 unchanged opt-in skips. Required browser
qualification and milestone closing review remain unperformed; review0/10
and row M16.4`[~]` remain unchanged. The successful v2 advisory result is retained
for the identical lock; no query or installation repeats.

`m16-supervisor-tool-closure-v5.json` seals83 regular existing Python import
source/cache, native-module and loaded-library files. It includes existing
`_ctypes`/libffi bytes and excludes site/user packages and inspection-only
imports. These are additional pins for the existing interpreter's required
runtime closure; no tool, dependency, version or installed byte is changed.
All original311 absolute v4 tool inputs and397 preserved repository inputs
independently verify. Launcher and private packet publisher change among the
original708 inputs;
new supervisor/client/test/design/closure files are separate candidate inputs.

The exact future output `/dev/shm/bdm16-v5` is absent and was never created.
This preparation uses no attempt and supplies no browser resumption authority.
Independent candidate review and explicit coordinator handling of the human's
uncertain-ownership stop are still required before any future invocation.
