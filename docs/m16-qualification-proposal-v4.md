# M16 short-path qualification successor v4 — proposed only

All v1/v2/v3 browser scopes are consumed. V3 records SIGTRAP before connection,
no recognized fatal-feature ID and no accepted sandbox/session proof. Its
observed owners and display/auth/home/tmp were joined/removed. The underlying
runtime cause remains unproved. V4 corrects a supported qualification path
defect without claiming that the consumed failure is causally resolved.

The [static diagnosis](m16-v4-static-diagnosis.md) binds the exact unchanged
Chromium151 binary and local disassembly. Chrome reads TMPDIR, creates its
singleton directory, appends `SingletonSocket`, and requires the resulting
path to be shorter than108 bytes; excessive length reaches a fatal `int3`.
The selected suffix `/org.chromium.Chromium.XXXXXX/SingletonSocket` is45 bytes.
V3's99-byte TMPDIR gives144 bytes (145withNUL). The proposed entire output
`/dev/shm/bdm16-v4` gives TMPDIR `/dev/shm/bdm16-v4/tmp`,21 bytes, and socket66
bytes (67withNUL). No separate temporary root is introduced.

The minimal qualification-only guard refuses
`Buffer.byteLength(tmpdir, 'utf8') + 64 >= 108` before manifest reads, directory
creation or spawning. The64-byte conservative reserve exceeds the pinned
suffix; equality refuses. Offline regression tests accept43 bytes and reject44,
including multibyte paths whose JS code-unit count would admit them incorrectly,
and reject the exact former v3 TMPDIR. Failure text is fixed and value-free.

The only requested new grant is
`browserdriver-m16-fixture-20261010-v4`, executor assigned-agent. It would cover
one invocation of `scripts/m16-qualify.mjs` in
`/home/peter/Workspace/browserdriver.goal/M16`, branch `goal/M16`, committed core
`6b2348d61d79587e924a0d344955ae55518fc31f` plus declared uncommitted M16.4.
Captured integration remains primary `/home/peter/Workspace/browserdriver`,
`refs/heads/main` at `b3a6287249ca8bb13fc3e063cad34ad3b9c2bd16`, original goal
base `ffbb9bd716093143106cf4a2c356a7ef05fda55d`. Exact fresh output is
`/dev/shm/bdm16-v4`. All frozen bytes and executable companion custody must match
before any future invocation. This proposal grants no authority.

Retain all earlier approved bounds: only disposable http://127.0.0.1:46061,
GET /start, /reuse and incidental /favicon.ico, two sandboxed headed Chromium
launches/authentications maximum, one private candidate per authentication,
joined raw-state reuse with original expiry. Application POST count0. Node24.14.1,
PW1.62.1, Chromium151.0.7922.34, exact cache and existing root4755 helper remain
unchanged. No unsandboxed fallback, profile/session/wire/production change,
installation, download, binary or privilege repair, or standalone helper.

Direct owned Xvfb :116 with private in-process Xauthority, fresh0700 output/
home/tmp, output marker, sealed environment and collision refusal remain.
Require independent positive Seccomp2/NoNewPrivs1/distinct user namespace for
each exact main-launch PID/start/UID and renderer, rejecting sandbox-disable
flags and unavailable proof. Keep coherent /proc parent/start/UID validation,
retained positive lineage, atomic private phase packets, owned staging and
joined cleanup. No marker-only/foreign/reused PID may become a signal target.
The short entire output preserves these existing custody/marker semantics.

Test120s/run180s including display setup, display-ready10s, each sandbox ACK30s,
normal browser settlement30s, failure signal stages5s with controller≤3s within
remaining stage budget, per-stage settlement10s and final reconciliation30s.
Normal pidfd SIGTERM only to exact captured Xvfb after browser settlement may
qualify; positively join before erasing auth/home/tmp. Failure/cancel uses
bounded pidfd SIGTERM then SIGKILL only for coherently proved owned lineage.
Timeout/cancel/escalation/browser signals or uncertain proof reject
qualification. Erase only joined positively owned disposable staging; retain
logs and unresolved custody. Failure or uncertainty consumes this one invocation
without retry.

The v3 closed reducer and source-grounding bytes remain unchanged:
`browserdriver.m16-launch-failure.v2`, eight categories, bounded input/termination
states, canonical exit0–255 or14 whitelisted signals and13 sorted fixed
fatal-feature IDs. No raw exception prose/stack, command/argv, path, PID,
credential/browser data or exception hash enters this new failure block. No new
diagnostic ID or collection is proposed. Earlier qualification reports retain
their approved value-free process-custody fields.

The successful consumed v2 advisory proof remains sufficient for the identical
lock SHA256
`3dba6e3e0923d1b67fc2b5d139cfe0f3c50f15b16ba19465fe0c8e3f888a9be0`
and complete fsevents2.3.2/playwright1.62.1/playwright-core1.62.1 inventory.
One exact bulk POST returned HTTP200 empty advisory map, exit0/zero
vulnerabilities. This successor has no audit/advisory scope; no query, enrichment,
fix or install is repeated. Development audit logging stays disabled.

Future command from the exact lease, only after exact fresh human approval,
with umask077 and absent output, is:

```text
env -i PATH=/home/peter/.nvm/versions/node/v24.14.1/bin:/usr/bin:/bin LANG=C.UTF-8 CI=1 BROWSERDRIVER_M16_QUALIFY=true /home/peter/.nvm/versions/node/v24.14.1/bin/node scripts/m16-qualify.mjs /dev/shm/bdm16-v4
```

The launcher seals DISPLAY/XAUTHORITY, private HOME/TMPDIR, browser cache,
existing helper and proof/report selectors under that exact root. No ambient
auth/proxy/provider/model values; no real target/account/credential/user ledger,
provider traffic, sudo, SSH, repair, deployment or publication. Child source-push
authority remains absent. Coordinator publication authority exists, but its
browser qualification preconditions remain unmet. V1/v2/v3 approved inputs,
proposals/manifests and failed results remain preserved. M16.4 stays blocked and
formal whole review0/10. No task commit/integration/closure is proposed here.

Offline `npm test -- --test-concurrency=1` passes236 total/220 pass/16 opt-in
skips, including exact ASCII/UTF8 boundary and old-v3-path rejection controls.
Build, launcher/helper syntax and diff checks pass. No browser selector,
browser/helper/Xvfb, advisory/network, privilege operation or commit occurred.
All708 prepared file bytes and companion custody match; exact future output is
absent, including any dangling link. Only four existing v3 inputs change:
display helper, launcher, display test source and its compiled test. The static
diagnosis note is added. Earlier approved artifacts/results remain unchanged.

| Frozen artifact | SHA256 |
| --- | --- |
| `docs/m16-qualification-inputs-v4.json` (708 files) | `c5594bf368632bc01c17ccb21afc29ba75bba826724027db0a0e64f8325aad1a` |
| `scripts/m16-qualify.mjs` | `2bf640a400254c2abb26f02435f965418f8a68b9db14478f4ecb58ba47544b70` |
| `scripts/m16-display.cjs` | `235d77775908cbf0416d93fe08708fb4733c7715259ed2e7e7ae2be0bd8e840d` |
| `docs/m16-v4-static-diagnosis.md` | `9209da8ec65ca6b67ebfe2a7ac857b7333be0d07f8e236a4ebd8a93f3fffd9ec` |
| unchanged reducer | `3002515b7e38fec676705a01832052eb8b3b6d5d9e2311801303aefb9e1cd504` |
| unchanged source grounding | `728356c8362b631b09c3ecceb2e837c2df9d2892e3f845ea7a3c74b44031bc9e` |
| private `m16-v4-offline-tests.log` | `df403163d73e2de51b5240b51aada86fb2f5570426f0af9f3b94759f9ad96ad9` |
