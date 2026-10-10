# M16 remaining qualification proposal

This is a prepared proposal, not human approval or an effective grant. M16.1–.3
have local task commits; M16.4 stays in progress and unaccepted. The original
Stage12 request supplies local work/task commits only, effective grants `{}`,
`EXTERNAL_MUTATIONS: none`. No M51 browser grant remains.

The candidate includes uncommitted M16.4 preparation over task tip
`6b2348d61d79587e924a0d344955ae55518fc31f` and captured integration baseline
`b3a6287249ca8bb13fc3e063cad34ad3b9c2bd16` (`refs/heads/main`).
Prepared input manifest `docs/m16-qualification-inputs.json` has687 files,
SHA256 `91f423747becae57b27c001d07875d903c3aefb2fcc1cc7e9ac27be0cf832d20`.
A changed source/tool input requires fresh reconciliation before invocation.

The browser proposal is one invocation of `scripts/m16-qualify.mjs`, assigned
Browserdriver:M16 executor only, grant ID proposed as
`browserdriver-m16-fixture-20261009-v1`. It runs one explicitly selected native
fixture under an isolated Xvfb display: `test/session-save-live.test.ts`, at
exact origin `http://127.0.0.1:46061`. Port collision refuses. Allow only fixture
GET `/start`, `/reuse` and incidental `/favicon.ico`; local fixture cookie and
localStorage state, two successful named authentications, exactly two headed
Chromium launches/contexts, one private snapshot/candidate per authentication,
and test-only joined raw-state reuse. Each launch remains alive up to30seconds
while its owner-private phase request awaits the controller's independent
sandbox acknowledgement; this is fixture-only I/O, not a protocol field. Both
request and ACK use complete fsynced private JSON publication: exclusive0600
temporary, immediate inode capture, atomic no-clobber final link, guarded owned
temp removal and directory sync. Final names never expose partially written
JSON; publisher promises join cleanup/sync/close. Collisions or foreign temp
replacement preserve foreign bytes and fail qualification, not overwrite/retry. Zero application POST/other mutations,
provider/real-site traffic, real credentials or ledger access. The120-second
test has a180-second run cap including display setup. It admits only directly
owned `/usr/bin/Xvfb :116 -screen 0 1280x800x24 -nolisten tcp -auth PRIVATE_FILE`.
Display socket/lock collision refuses; no alternate display is selected. Private
Xauthority is generated in-process (FamilyLocal, hostname, display116,
MIT-MAGIC-COOKIE-1 and random16-byte cookie), exclusive0600 under private0700
xauth directory. No cookie appears in argv/logs; no xvfb-run or xauth child.

Normal successful shutdown first waits up to30seconds for the fixture/browser
owners to settle naturally. The sole planned signal eligible for qualification
is pidfd-bound SIGTERM to the exact captured Xvfb PID/start/uid, after browser
settlement and while original Xauthority custody is still positive. Server
join (exit0 or expected SIGTERM), display socket/lock absence and preserved
Xauthority are verified before erasing auth/home/tmp. No browser signal or
escalation qualifies. A closed per-target Python alarm is a timeout failure.

Timeout/cancel/inspection failure permits SIGTERM then SIGKILL only for exact
owned PID/start/uid identities whose descent from the captured launch roots was
positively observed and retained across reparenting. Signal stages use absolute5-second monotonic deadlines, including inspection
and the last controller. Each Python worker receives the lesser of the exact
remaining stage deadline and3seconds; its own timer uses that absolute Linux
monotonic deadline and checks again before sending. No later controller
admission extends the stage. Settlement windows likewise retain absolute
monotonic deadlines (10seconds per failure stage, final30second reconciliation). A path marker alone is a potential gap, never signalling
scope. Child and exact parent process identities are coherently bracketed and
revalidated before new lineage; parent PID reuse during inventory refuses.
Existing unprivileged Python3.14.4 stdlib pidfds bind kernel process identity;
no numeric-PID kill fallback, implicit Node timeout kill, reused-PID signalling,
privilege or arbitrary process action. Any timeout/cancel/escalation/browser
signal rejects qualification. Missing safety refuses teardown, preserves
uncertain owners/state and exits finitely. One failed/uncertain invocation is
consumed and receives no automatic retry.

Exact existing inputs are Node24.14.1 at
`/home/peter/.nvm/versions/node/v24.14.1/bin/node` SHA256
`bf9112eb83a827dc9f9c8d19bb7bddcbf00f7b2fedae18fdcaee05406981f20a`,
Playwright/core1.62.1 and unchanged lock SHA256
`3dba6e3e0923d1b67fc2b5d139cfe0f3c50f15b16ba19465fe0c8e3f888a9be0`,
Chromium151.0.7922.34 at cached chromium1234 SHA256
`0b20b130e7edd9dd51873be867761295fe0cfad490c2b9a64f95bd3cfc08fa71`,
and existing root-owned4755 `/opt/google/chrome/chrome-sandbox` SHA256
`be9f5d4be90fa60b985ad3069812b144ba7331fed0c3f980c6d9399d37d60314`.
The launcher rechecks all prepared bytes and helper custody. Chromium's sandbox
is mandatory; only Chromium invokes the existing helper via
CHROME_DEVEL_SANDBOX. No standalone helper, sudo, installation, alternate
browser or unsandboxed fallback.

The launcher creates a fresh owner-only output directory and isolated home/tmp.
Its exact child environment contains only PATH, HOME/TMPDIR to those private
paths, LANG, CI, exact cached PLAYWRIGHT_BROWSERS_PATH, exact sandbox helper,
fixture selector, private report path, private sandbox-proof directory,
DISPLAY=:116 and private XAUTHORITY.
It directly launches the existing Xvfb under non-TCP display; its bytes are in
the manifest. Python pidfd control and existing Xau encoding verification
inputs are also pinned. No ambient tokens,
credential/provider/proxy variables reach browser descendants. It retains
value-free fixture evidence and observed PID/start identities. Renderer proof is bound by positively observed ancestry to each exact Chromium
main PID/start/uid. Both distinct main launches must have their own positive
Seccomp2/NoNewPrivs1/distinct-user-namespace renderer proof and distinct phase
acknowledgements. Aggregate first-launch observations cannot cover the second.
Live EACCES/EIO or other uncertain inspection refuses; only ENOENT/ESRCH or
proved identity change means the inspected renderer is gone. Renderer proof
requires a user namespace distinct from launcher/broker;
missing live /proc proof or any sandbox-disable flag refuses qualification. All
observed identities must be absent without browser/forced signals for success;
only the declared normal display pidfd stop may qualify. Xvfb
display sockets/locks and private Xauthority directories must be absent; listener,
fixture root, private browser home and temporary tree must be removed. Staging
erasure occurs only after process settlement, with logs/reports retained.
Unsettled process/candidate cleanup refuses qualification, not replay.

The separate audit proposal is one credential-free `npm audit --omit=dev`
query under installed npm11.18.0, proposed grant
`browserdriver-m16-dependency-audit-20261009-v1`, assigned M16 executor. Exact
endpoint: HTTPS POST
`https://registry.npmjs.org/-/npm/v1/security/advisories/bulk`, gzip JSON body
`{"playwright":["1.62.1"],"playwright-core":["1.62.1"]}`.
If returned advisories need metadata, allow only HTTPS GET
`https://registry.npmjs.org/playwright` and
`https://registry.npmjs.org/playwright-core`. Installed npm uses no quick-audit
fallback. Send no token, repository bytes, private project metadata, credential
values or captures. Seal npm environment/config: registry fixed to that origin,
user/global config /dev/null, project .npmrc absent, notifier/fund/scripts off,
no proxies/auth variables, retries0 and15-second fetch timeout. Use isolated
cache/output only. This is an advisory read, never npm audit fix, dependency
installation, update or browser download.

Offline `npm audit` was run and returned exit0/zeros, but installed Arborist
explicitly returns `null` for offline mode; its debug log confirms `audit report
null`. That output is not cached advisory evidence and does not pass the audit
gate. The prior interrupted npm-ci notifier GET is retained as an earlier gap;
resumed npm-ci used exact cache with notifier disabled and no fetch entries.

Source publication remains coordinator-only and ungranted. Native qualification,
valid advisory verification and authoritative whole source review precede a
concrete source-publication request. The coordinator reconciles the commit
boundary for a reviewed source checkpoint and authorized local integration,
then proposes only fast-forward publication of that exact reviewed revision to
`/home/peter/Workspace/browserdriver`, origin
`git@github.com-tabilet:OpenUdon/browserdriver.git`, destination
`refs/heads/main`, followed by independent exact remote-tip proof. Required
publication must be performed/proven before M16.4 closure or retirement; final
closure/publication proof remains coordinator-owned. Do not claim acceptance
before any required publication handoff completes.

Publication approval must explicitly reconcile `EXTERNAL_MUTATIONS: none`;
a proposed push grant cannot override it. Git SSH transport permits no arbitrary
remote command. No child push, release/tag, deployment, host/provider/model/mail
or production action. The exact source revision and any final closure-publication
handoff are resolved only after required checks/source review and coordinator
reconciliation; this proposal activates neither.
