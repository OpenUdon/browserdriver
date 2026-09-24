# M14 — Browser 1.8/1.9 action execution

Requested downstream adoption from `/home/peter/uws-downstreams.md` and the
September 24 UWS 1.11 adoption plan. Browserdriver owns one independent row;
Udon owns lowering and pinned cross-repository integration.

| Task | Status | Acceptance |
| --- | --- | --- |
| M14.1 | `[+]` | Added persistent v10 authentication/action path and inner action v3 for explicit Browser 1.8/1.9. Typed/defaulted parameters and approved templates resolve before any browser macro. Earlier wires retain their behavior. Offline synthetic and regression tests, audit, diff check and bounded whole-diff review pass. |
| M14.2 | `[+]` | Browser 1.5–1.7 inner action v2 executes on the same v10 persistent session using existing v3 action behavior; inner v3 remains exclusive to Browser 1.8/1.9. Mixed-session execution and crossed-pair rejection pass. Offline regression, audit, diff check and bounded review pass. |

## Review gate

Maximum ten whole-diff iterations. Close only when no P1/P2 finding remains
and the evidence above is recorded. No live browser/provider or external
target operation is authorized by this row.

Review iteration 1 inspected the complete source, test, wire, docs, and ledger
diff against the published Browser 1.8/1.9 clauses. It corrected an optional
schema omission and malformed-action admission before closeout. No P1/P2
finding remains. `npm test` passes 150 offline tests with 15 opt-in browser
tests skipped; `npm audit --omit=dev` reports zero vulnerabilities;
`git diff --check` passes. No Chromium, provider SDK or target service ran.
Udon's separate v10 consumer and cross-repository qualification remain its
own acceptance work.

Review iteration 2 inspected the M14.2 wire dispatch, mixed-session synthetic
test, current-truth corrections and evolution amendment. The v10/inner-v2 path
uses the existing v3 action and output behavior; crossed version/profile pairs
return `invalid_response` before browser execution. No P1/P2 finding remains.
`npm test` again passes 150 offline tests with 15 opt-in browser skips;
`npm audit --omit=dev` reports zero vulnerabilities and `git diff --check`
passes. No live browser or target service ran.
