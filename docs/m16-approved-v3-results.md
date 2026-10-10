# M16 approved v3 results

The human approved suggested.txt SHA256
`bf85283bcda883e21f4904e02ba554744a1ee2c6562edfbfa45284babb9b0b36`.
The assigned grant `browserdriver-m16-fixture-20261010-v3` was invoked exactly
once on 2026-10-10 UTC and is consumed. No retry, advisory invocation, repair,
new task commit, publication, integration or closing acceptance occurred.
Development audit logging remains disabled.

All 707 approved input files and executable companion custody matched before
and after invocation. The proposal SHA256 remains
`6e066b9641e512b3ce6ce0722dc497807eafc0f0d2825f638b4a12f34134aa2d`;
the manifest remains
`a53300cc8428cda46a32b229745e88707e236000a78abfd3f39c36854a36c5ef`.
Production source/wires, tools and lock are unchanged. Successful v2 advisory
proof remains retained for the identical production lock/inventory; v3 supplies
no further advisory authority.

The launcher exited 1 and its report is `failed-or-unsettled`. Start
authentication reached exactly one actual Chromium launch. The private closed
failure block reports:

```json
{"inputState":"complete","category":"closed_before_connection","termination":{"state":"signaled","exitCode":null,"signal":"SIGTRAP"},"features":[]}
```

The overall fixture stage is `launch`, with `driver_error`. This establishes
trap termination before connection. It records no recognized fatal-feature
marker and does not establish the underlying OS/component cause. Exact-request
offline reproduction already proves prelaunch validation/hash consumption, and
the real failure precedes the request/ACK handshake. No browser handle, renderer
sandbox observation, phase proof, candidate reuse or successful fixture evidence
was obtained. No OS fix or successful browser qualification is claimed.

The report elapsed 6139 ms. There was no timeout, cancellation, inspection gap
or recorded sandbox violation. Failed-check pidfd SIGTERM targeted only the
captured owned Xvfb; its close result was code0. The fixture close result was
code1. Forced failure cleanup prevents qualification; normal display shutdown
did not qualify.

The two observed process identities settled, with no remaining/potential
owners. The report positively records display settlement before erasing auth
and removal of private home/tmp/auth plus X116 socket/lock. Independent read-only
checks confirm both observed identities absent, those paths removed and no
listener on46061. These facts concern recorded custody; they do not convert the
failed run into accepted browser/session evidence. No core file was present in
the lease after the check.

Private evidence is under
`/dev/shm/kinet-stage12-leases-f8qot0xc/resources/browserdriver/m16-approved-fixture-20261010-v3`:

| Evidence | SHA256 |
| --- | --- |
| `qualification.json` | `45d2708ea2b49681c9e22af26d8b1211db6076d1a0caeea2cd4bdff23307fe06` |
| `fixture-failure.json` | `073526fed7a01ef4724a111355448d947aeae3f50563fdcbe0834d22281f0be0` |
| `fixture.log` | `d27c250fb544f770ed8db79f96d9151b3b38837c38b9a416e87be5eb44dff8c4` |

All 396 approved repository inputs (19,965,460 bytes), proposal and manifest
are preserved under the private sibling `m16-approved-v3-preserved`.
Preservation-record SHA256 is
`089f0fee9fb432e3005483a3883cea1db5ac30ee62619c7982de788f8b2c221a`.
The 311 absolute inputs remain unchanged at their approved paths.

The sibling launcher log is empty, SHA256
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
Earlier v1/v2 inputs/results remain preserved. M16.4 stays blocked/incomplete;
formal whole-review counter stays0/10. Root publication authority exists, but
browser qualification and its publication preconditions remain unmet.
