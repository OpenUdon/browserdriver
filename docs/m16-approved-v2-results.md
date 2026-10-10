# M16 approved v2 results

The human approved the new M16 scopes in suggested.txt SHA256
`d62b01f32d99cc3a911be739c7b519c648c606db94112de9a3be5f911f7bdb8c`.
Both assigned invocation-limited grants were used once on 2026-10-10 UTC and
are consumed. No retry, publication, integration or closing acceptance occurred;
development audit logging remains disabled.

Before invocation, all 705 inputs matched the approved v2 manifest SHA256
`af6900c2c142d2df0bbd0ba1bd8f3796bf8f4364bf63f65bce1246acb4c0acc2`,
proposal `15e621a1e6e09f4b51c17f6cbf6a7805908cb12d09d1be1bdad20cb79330e359`,
launcher `dd13b73096665b4c70088686b8121abe4e34cded2e6bb1e95e11222a1ef554f9`
and audit guard
`fbb1bf8094e85386592f30e317a93a74d8dc01b960870f46cee22939972329af`.
The exact two empty npm config files retained owned single-link 0600 custody.
All 705 input bytes also matched after both operations.

Browser grant `browserdriver-m16-fixture-20261009-v2` failed with launcher exit 1.
The start authentication reached one Chromium launch call; its closed category
was `closed_before_connection`, with `driver_error`. No browser handle, renderer
sandbox observation, phase proof, candidate reuse or successful fixture evidence
was obtained. The qualification report state is `failed-or-unsettled`, elapsed
6694 ms, with fixture exit 1 and failed-check pidfd SIGTERM only to the captured
owned Xvfb. This cleanup signal prevents successful qualification.

The report records both observed PID/start/UID identities settled, no remaining
or potential owners, and positive display/auth/home/tmp removal. Independent
read-only inspection afterwards confirmed both identities absent, no X116
socket/lock, no owned private home/tmp/auth, and no listener on port 46061.
Display settlement preceded auth removal; normal display shutdown did not
qualify. No browser or helper was invoked again.

This is a launch-path failure before request/ACK synchronization. Exact-request
offline reproduction already proved validation, save digest matching and
permission consumption reach a stubbed launch. Static inspection retains headed
`chromiumSandbox: true`, resolves Chrome's linked libraries, and confirms the
root-owned 4755 helper. The inspecting shell has no inherited NoNewPrivs/seccomp;
a bounded kernel-journal read supplied no usable failure evidence. These checks
do not prove the underlying OS cause. The closed category retains no precise
exit/signal/fatal reason, so another identical invocation would not improve the
diagnosis.

Advisory grant `browserdriver-m16-dependency-audit-20261009-v2` passed: the exact
sealed, guarded `npm audit --omit=dev` invocation exited 0 and its plain report
states `found 0 vulnerabilities`. Receipts prove exactly one HTTPS bulk POST,
HTTP 200 and an empty advisory map. The approved gzip body covers the complete
production virtual-lock inventory: fsevents 2.3.2, playwright 1.62.1 and
playwright-core 1.62.1, uncompressed body SHA256
`a189c30333afaaa047e46d421c0ba11688768001f61e6396684772f286e9b297`.
There were no enrichment GETs, redirects, retries or additional requests. No
audit fix, installation, dependency/lock change or credential header occurred.

Private evidence remains under
`/dev/shm/kinet-stage12-leases-f8qot0xc/resources/browserdriver/`:

| Evidence | SHA256 |
| --- | --- |
| `m16-approved-fixture-20261009-v2/qualification.json` | `fd3891b3849df77f07147e02d003cdb312bd8e5f0d7d1accb6a58457c0c05270` |
| `m16-approved-fixture-20261009-v2/fixture-failure.json` | `603e991d6ca9dcd84be836eea0d6f29c4b6635642b8f48dddcc859a5960386b1` |
| `m16-approved-fixture-20261009-v2/fixture.log` | `4de2a38d26c02e0d5e243281e89fe4162f434b8f87f8329b2a362d0c2c837e5a` |
| `m16-approved-audit-20261009-v2/requests.jsonl` | `a264331e0fc5b47f382f86f7d8d87ffb3c57a01afe27db3b2499c5ec8e640a25` |
| `m16-approved-audit-20261009-v2/audit.stdout.log` | `6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3` |
| `m16-approved-audit-20261009-v2/audit.stderr.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

All 395 approved repository inputs (19,935,664 bytes), the v2 proposal and
manifest are also preserved under `m16-approved-v2-preserved`. Its preservation
record SHA256 is
`113e23967ec9deae136c8d103ff211f4e15a1865c6ee5f6d319823e321cb9cf7`.
The 310 absolute tool inputs remain at their approved paths and matched after
invocation; no redundant browser/tool installation or copy was created.

Original v1 inputs/results remain preserved. M16.4 stays in progress and
incomplete, with formal whole-review counter 0/10. Actual browser qualification
and coordinator publication/acceptance remain required gates. No new task
commit was created.
