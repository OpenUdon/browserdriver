# Status M15 — Browser 1.10 count action protocol

**State:** Active. M15.1 is complete; M15.2 is pending.

**Goal.** Add an additive persistent driver action protocol for Browser 1.10
CSS-selector match counting, returning only a typed nonnegative integer.

**Dependencies.** Published Browser 1.10 from UWS M05 and typed support from
Browsertools M32.

**Boundary.** Retain v10 and earlier protocol behavior. Do not return page text
or element attributes. No live target action is included.

## Tasks

| Item | State | Notes |
| --- | --- | --- |
| M15.1 Define additive count protocol | `[+]` | Define outer persistent v11 and inner action v4 for exactly Browser 1.10; leave outer v10 and earlier action pairs unchanged. Specify count output and closed result/failure shapes. Output-bearing v11 actions fail before macros until M15.2 provides count extraction. |
| M15.2 Implement and cover synthetic count execution | `[ ]` | Test exact count output plus missing, ambiguous, invalid and over-bound behavior; verify no page text or attributes escape. |
| M15.3 Verify, review and publish | `[ ]` | Run focused and full checks, vet and bounded review; publish for Udon M43. |

## M15.1 outcome

The additive `udon.browser-driver.v11` persistent envelope accepts the existing
closed v3 authentication, challenge and context behavior. Its action pairing is
exclusive: only inner `udon.browser-driver.v4` with `uws.browser.1.10` is
admitted. Count declarations require `matchCount: true`, CSS integer output,
selector, fallback reason, integer validation bounds and `all` or `rendered`
visibility; optional scope and context must be non-empty. Non-count fields and
extra declaration fields are rejected. Until M15.2 installs the count executor,
any output-bearing v11 action stops with `invalid_response` before browser
macros, preventing the older CSS text path from being used.

The v11 success result keeps the existing persistent response fields
`status`, `outputs`, `visitedUrls`, and `ambiguities`, with integer count values.
The failure result keeps only the protocol version, type, request ID, fixed
failure result and closed failure code. V10 and older action/profile pairings
retain their prior admission rules.

Verification: `npm run build` passed. The focused protocol, driver and template
suite passed 37/37 tests using the installed Node 24 dependencies. An initial
focused run exposed a test message-buffer reset omission; the test was corrected
and the same suite passed. `git diff --check` passed.
