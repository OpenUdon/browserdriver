# Status M15 — Browser 1.10 count action protocol

**State:** Active. Implementation, verification and review are complete; M15.3 publication is pending.

**Goal.** Add an additive persistent driver action protocol for Browser 1.10
CSS-selector match counting, returning only a typed nonnegative integer.

**Dependencies.** Published Browser 1.10 from UWS M05 and typed support from
Browsertools M32.

**Boundary.** Retain v10 and earlier protocol behavior. Do not return page text
or element attributes. No live target action is included.

## Tasks

| Item | State | Notes |
| --- | --- | --- |
| M15.1 Define additive count protocol | `[+]` | Define outer persistent v11 and inner action v4 for exactly Browser 1.10; leave outer v10 and earlier action pairs unchanged. Specify count output and closed result/failure shapes. During M15.1, output-bearing v11 actions failed before macros; M15.2 replaces that staging check with count extraction. |
| M15.2 Implement and cover synthetic count execution | `[+]` | Test exact count output plus missing, ambiguous, invalid and over-bound behavior; verify no page text or attributes escape. |
| M15.3 Verify, review and publish | `[~]` | Full checks and bounded review pass; publish the clean source for Udon M43. |

## M15.1 outcome

The additive `udon.browser-driver.v11` persistent envelope accepts the existing
closed v3 authentication, challenge and context behavior. Its action pairing is
exclusive: only inner `udon.browser-driver.v4` with `uws.browser.1.10` is
admitted. Count declarations require `matchCount: true`, CSS integer output,
selector, fallback reason, a nonnegative minimum, optional safe maximum, and `all` or `rendered`
visibility; optional scope and context must be non-empty. Non-count fields and
extra declaration fields are rejected. In M15.1, output-bearing v11 actions
stopped before browser macros; M15.2 replaces that staging rejection with the
count executor, so the older CSS text path cannot be used.

The v11 success result keeps the existing persistent response fields
`status`, `outputs`, `visitedUrls`, and `ambiguities`, with integer count values.
The failure result keeps only the protocol version, type, request ID, fixed
failure result and closed failure code. V10 and older action/profile pairings
retain their prior admission rules.

Verification: `npm run build` passed. The focused protocol, driver and template
suite passed 37/37 tests using the installed Node 24 dependencies. An initial
focused run exposed a test message-buffer reset omission; the test was corrected
and the same suite passed. `git diff --check` passed.

## M15.2 implementation

Count outputs use native `querySelectorAll` through a fixed Playwright page
evaluator, preserving native CSS selector semantics. `all` counts connected
matches; `rendered` also checks positive-area client rectangles and computed
visibility on the element and its ancestors. `within` must resolve to exactly
one root and counts only its descendants. Counts must be nonnegative safe
integers and satisfy the declared integer validation constraints. Selector,
scope and count errors collapse to `invalid_response`; the count path never
calls text or attribute extraction. Integer validation applies standard
numeric bounds and combinators supported on the selected action; unresolved
JSON Schema references fail closed because the full profile is not sent to the
driver.

## M15.3 bounded review

Review iteration 1 identified that Playwright's CSS locator parser accepts
Playwright-only selector extensions outside UWS's CSS contract. The count
implementation now passes selectors only to the browser's native
`querySelectorAll` through fixed code, and checks a unique scope root and its
descendants in one evaluation. The affected driver suite passes 26/26 tests.
The full gate passes on the reviewed source with no open P1/P2 findings.

Verification: `npm run build` passed. The focused driver suite passed 26/26
tests, covering zero/one/multiple results, hidden and detached elements,
rendered visibility, scope-root exclusion and ambiguity, CSS-only selectors,
invalid and unsafe counts, schema bounds/combinators, and text/attribute
non-disclosure. `git diff --check` passed.

## M15.3 final verification and review

`npm test` passed: 172 tests, 157 passed, 15 optional browser/provider tests
skipped, zero failures. The command rebuilt the TypeScript source before running
the suite. `npm audit --omit=dev` found zero vulnerabilities. `git diff --check`
passed. Review iteration 1 is closed with no remaining P1/P2 findings. The
reviewed source commits are `1545256`, `dbb330e`, and `1f0e0d8`; publication is
the remaining M15.3 step.
