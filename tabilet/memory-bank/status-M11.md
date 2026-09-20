# M11 — Private registration 1.1 execution

| Item | State | Notes |
| --- | --- | --- |
| M11.1 Add non-mixing v5 validation and private input exchange | `[+]` | Closed v5 definitions and snapshot validation implemented; initial acceptance precedes browser creation. Combined-tree offline and native tests pass. |
| M11.2 Execute typed inputs and bind submit approval | `[+]` | Native fill/check/select, conditional skipping and clearing, exact snapshot approval, one POST and joined teardown implemented and qualified. V2-v4 regressions pass. |
| M11.3 Qualify and review | `[+]` | Offline/audit, v4/v5 native Chromium and Udon consumer qualification pass. Scalar/conditional/wizard, stale and denied input, exact identity, clearing, legacy and privacy regressions pass; review closes at iteration 3 without P1/P2. |

Approved successor to M10. No real target execution is authorized by these
implementation rows. Review iteration 0; maximum ten iterations, no P1/P2
finding at closure. W8M remains a consumer test case; no target behavior belongs
in this driver.

The first implementation passes all 50 offline cases, the v4 Chromium
regression and a v5 Chromium matrix covering typed values, inactive-value and
optional-value clearing, denied/stale input, identity substitution and exact
submit binding. Audit reports zero vulnerabilities. Review iteration 1 finds
a P2 transport gap: v5 must explicitly refuse WebSocket channels so private
input execution retains the closed HTTP mutation boundary. This is being fixed
before source publication and downstream adoption.

Review iteration 2 finds two P2 input edge cases while tracing the full UWS
contract: valid slot names such as `constructor` require own-property lookup,
and a slot applied through more than one control needs its original control
kind retained for later clearing. These corrections remain inside v5.

Review iteration 3: no remaining P1/P2 findings after inspecting version unions,
snapshot copies, own-property lookups, control clearing, submit identity,
WebSocket refusal and one-POST teardown. `npm run check` passes: 51 offline
tests, two opt-in skips and zero audit vulnerabilities. Both opted-in Chromium
tests pass, and the Udon-to-v5 Chromium consumer test passes. A failed consumer
invocation used the system Node rather than the required Node 24; correcting
the test PATH resolves that prerequisite without a source change.

Commit units separate definition/validation, native execution, and qualification
evidence. Their combined working tree is the verified compatibility boundary;
publication occurs only after all three units are present.
