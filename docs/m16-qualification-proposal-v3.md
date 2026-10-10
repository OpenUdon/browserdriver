# M16 browser diagnostic successor v3 — proposed only

Both v1/v2 browser scopes are consumed. V2 failed during its first launch with
`closed_before_connection`/`driver_error`, without sandbox or saved/reused
fixture proof. Its observed owners and display/auth/home/tmp were joined and
removed. The exact v2 advisory scope passed: one complete-production-lock bulk
POST, HTTP200 empty advisory map, exit0 and zero vulnerabilities. Preserve that
advisory proof; this successor requests no advisory scope. Development audit
logging stays disabled.

The failure stage is actual Chromium launch before request/ACK synchronization.
Exact original synthetic requests reach a stubbed launch after real validation,
save digest matching and one-use consumption. Safe static inspection resolves
Chrome's linked libraries, confirms headed/sandbox true and unchanged root4755
helper, and finds no usable bounded kernel-journal evidence. These checks prove
no OS cause or repair. An identical invocation would only repeat the generic
close category; v3 prepares materially richer closed observations.

The only requested new grant is
`browserdriver-m16-fixture-20261010-v3`, assigned-agent executor. It would permit
one invocation of `scripts/m16-qualify.mjs` in the retained lease
`/home/peter/Workspace/browserdriver.goal/M16`, branch `goal/M16`, committed core
`6b2348d61d79587e924a0d344955ae55518fc31f` plus declared uncommitted M16.4.
Captured integration identity remains `refs/heads/main` at
`b3a6287249ca8bb13fc3e063cad34ad3b9c2bd16`; primary/original goal identity is
unchanged. Exact proposed fresh output:
`/dev/shm/kinet-stage12-leases-f8qot0xc/resources/browserdriver/m16-approved-fixture-20261010-v3`.
The final hashes are recorded below after offline verification. They cover all
runtime/test inputs and existing browser companions; every byte/custody must
match before any future invocation. This proposal activates no authority.

The qualification-only reducer emits
`browserdriver.m16-launch-failure.v2`, with the existing eight closed categories,
an input state and termination state. Exit codes are integers0–255 only; signals
are exactly SIGABRT, SIGBUS, SIGFPE, SIGHUP, SIGILL, SIGINT, SIGKILL, SIGQUIT,
SIGSEGV, SIGSYS, SIGTERM, SIGTRAP, SIGXCPU or SIGXFSZ. A canonical installed
Playwright exit record is required for exited/signaled evidence. Repeated
identical call-log records coalesce; differing PID/outcome records are ambiguous.
Malformed, truncated or absent records retain no partial exit/signal values.
No PID, exception prose/stack, command, path, data or exception hash enters this
diagnostic. These hints do not replace positive process-custody/join evidence.

Fatal-feature IDs are exactly crashpad_database_required,
crashpad_handler_marker, profile_singleton_marker, temp_directory_operation,
disk_space_marker, disk_quota_marker, memory_thread_marker, sandbox_marker,
namespace_marker, display_marker, dependency_marker, executable_marker and
permission_marker. They are sorted unique observed markers, not causal claims.
Only the first direct error line and installed Playwright stderr records are
feature sources; echoed launch commands and cleanup lines are excluded. Generic
close prefixes cannot mask subsequent fatal markers or termination records.
Static source grounding records byte offsets/lengths and whole-source hashes;
no raw exception is recorded or hashed.

Input bounds: 65,536 UTF16 code units, 1,024 lines, 8,192 units per line. Oversize
or invalid text is refused as a whole, without retaining a parsed prefix. Getter
failure/nonstring input is unavailable. Diagnostics use exact validated keys,
fixed enumerations and data properties only; freeform fields, serialization
hooks, unknown signals/features, duplicate IDs and inconsistent states refuse.
Deterministic controls exercise generic-prefix masking, every feature ID,
duplicate/conflicting processes, malformed/truncated/oversize input and private
canaries. The closed failure file remains private, with no production logging or
protocol change.

Existing Chrome, crashpad handler, cached sandbox companion and actual approved
root4755 helper bytes are pinned. V3 additionally verifies the captured exact
owner/group/mode/single-link custody of those existing executables. The static
errno source libc is pinned for source grounding. This performs read-only
custody checks, not installation, repair, privilege changes or standalone helper
execution. Node24.14.1/PW1.62.1/Chromium151.0.7922.34 remain identical. The exact
unchanged production lock and three-package inventory retain the v2 advisory
result; no advisory query, enrichment, fix or install belongs to v3.

Retain the original exact browser bounds: only disposable
http://127.0.0.1:46061, GET /start, /reuse and /favicon.ico; two sandboxed headed
Chromium launches/authentications with private candidates and joined raw reuse
without renewing expiry. Direct owned Xvfb :116/private Xauthority; independently
positive Seccomp2/NoNewPrivs1/distinct user namespace for each exact main launch
and renderer; no sandbox-disable flags or fallback. Atomic private phase packets,
coherent /proc parent/start/UID ownership and retained lineage, sealed empty
private home/tmp, exact browser cache/root helper, bounded pidfd teardown and
positive display/auth/home/tmp cleanup remain unchanged.

Test120s/run180s, display-ready10s, phase ACK30s, normal browser settlement30s,
signal stages5s with controller≤3s inside the remaining stage budget,
settlement10s and final reconciliation30s. Normal owned pidfd SIGTERM to exact
Xvfb only after browser settlement may qualify. Timeout/cancel/escalation/browser
signals or ambiguous/missing proof reject qualification. Never signal marker-only
or reused/foreign PIDs; unavailable ownership retains staging as a cleanup gap.
Failure or uncertainty consumes this one invocation, with no retry.

Future command from the exact lease (only after exact human approval), with
umask077 and fresh output, is the existing sealed launcher form:

```text
env -i PATH=/home/peter/.nvm/versions/node/v24.14.1/bin:/usr/bin:/bin LANG=C.UTF-8 CI=1 BROWSERDRIVER_M16_QUALIFY=true /home/peter/.nvm/versions/node/v24.14.1/bin/node scripts/m16-qualify.mjs /dev/shm/kinet-stage12-leases-f8qot0xc/resources/browserdriver/m16-approved-fixture-20261010-v3
```

The launcher seals fixture DISPLAY/XAUTHORITY, private HOME/TMPDIR, browser cache,
existing helper and report/proof selectors under that output. No ambient auth,
proxy, provider or model values; no real site/account/credential/user ledger,
sudo, SSH, helper standalone, dependency/tool/browser installation, download,
advisory request, publication or deployment. Child source-push authority remains
absent; coordinator publication grants do not transfer. Root publication authority
exists but its qualification preconditions remain unmet. M16.4 stays blocked and
formal whole review remains0/10. V1/v2 proposal/manifest/results are preserved.

Offline `npm test -- --test-concurrency=1` passes235 total/219 pass/16 opt-in
skips. Focused exact-request/diagnostic controls pass8/8; syntax/diff checks pass.
No browser, advisory query, network request, signal or helper invocation occurred
during v3 preparation. Production source/lock/tool bytes are unchanged. Only six
existing v2 inputs change: reducer, launcher, live/diagnostic test source and their
compiled test files; the source-grounding record and existing libc source are
added. Original v2 approved artifacts/results retain their exact hashes.

| Frozen artifact | SHA256 |
| --- | --- |
| `docs/m16-qualification-inputs-v3.json` (707 files) | `a53300cc8428cda46a32b229745e88707e236000a78abfd3f39c36854a36c5ef` |
| `scripts/m16-qualify.mjs` | `c9ce1ee7cc6247f24f99a1f8f092bde3da57de1ecc262068d67a401673de63c1` |
| `scripts/m16-launch-diagnostics.cjs` | `3002515b7e38fec676705a01832052eb8b3b6d5d9e2311801303aefb9e1cd504` |
| `docs/m16-launch-diagnostic-sources-v3.json` | `728356c8362b631b09c3ecceb2e837c2df9d2892e3f845ea7a3c74b44031bc9e` |
| private `m16-v3-offline-tests.log` | `77a08661c9bc54e10bc49b21ffaa7666560279598959733b3c1503fc2ce19efb` |

The fixed lock SHA256 remains
`3dba6e3e0923d1b67fc2b5d139cfe0f3c50f15b16ba19465fe0c8e3f888a9be0`.
Its complete virtual inventory remains fsevents2.3.2/playwright1.62.1/
playwright-core1.62.1, so the already successful v2 advisory gate is retained.
