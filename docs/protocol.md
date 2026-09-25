# Udon browser-driver persistent action protocols

The process reads and writes one JSON object per line. Every envelope carries
`version: "udon.browser-driver.v2"` and a `requestId`. The maximum line size is
1 MiB. Udon starts one process per workflow execution and serializes requests.
The additive v3 envelope uses `version: "udon.browser-driver.v3"`; v2 message
and execution behavior remains accepted and unchanged.

The registration-only v4 envelope uses
`version: "udon.browser-driver.v4"`. It is additive: v2/v3 authentication,
action, challenge, session, and result paths remain unchanged.

Input message types are:

- `authenticate`: exact recipe, selected flow, named session, allowed origins,
  symbolic credential bindings, environment-variable names, and an optional
  opaque reuse binding;
- `action`: one validated browser 1.5/1.6/1.7 action plus the named session;
- `challenge_response`: `approve`, `deny`, or `provide`; and
- `close`.

Output message types are:

- `status`: `resolving`, `logging_in`, `awaiting_mfa`, `refreshing`, or
  `executing`;
- `challenge`: a closed MFA kind and, for number matching, a numeric value; and
- `result`: success or one closed failure code.

Failure codes are `mfa_timeout`, `mfa_denied`, `credentials_invalid`,
`session_expired`, `driver_error`, `unsupported_challenge`,
`captcha_required`, `origin_rejected`, `ambiguous_locator`, `invalid_context`, and
`invalid_response`. There is no free-form error field.

## V3 portable contexts

V3 accepts only `uws.browser-authentication.1.1` authentication profiles and
internal `udon.browser-driver.v2` actions lowered from `uws.browser.1.5` or
`uws.browser.1.6`, and accepts `uws.browser.1.7` only through this v3 path.
The internal action carries the exact portable `profile` discriminator;
omission remains accepted only for compatibility with older v3 callers.
Browser 1.5 uses only the implicit `main`; browser 1.6/1.7 may add the reviewed
`contexts` graph. Every
locator-bearing authentication step, wait, challenge, browser step, and output
may name a context; navigate may use `{ "url": "...", "context": "..." }`.
Authentication success may name a context and exact path.

Frames resolve among direct children of their declared parent by exact origin
and reviewed path and/or name. Zero matches fail; multiple matches are
ambiguous. A popup exists only after an explicit click with `opensContext` and
must be the sole page opened by that click. Automatic, missing, duplicate,
changed, closed, or extra contexts fail closed. Context graphs are acyclic,
bounded to depth four, and every origin must be canonical and present in the
request allowlist.

Missing, undeclared, closed, detached, or substituted runtime contexts return
`invalid_context`. Malformed protocol envelopes and malformed profile/context
definitions return `invalid_response`; origin escapes remain
`origin_rejected`, and multiple matching targets remain `ambiguous_locator`.

Resolved handles are caches, never continuing authority. Before every use, a
page must still be present, open, and on an allowed exact origin; a popup must
still match its declaration. A frame must remain attached, a direct child of
the current declared parent, and the sole exact origin/path/name match.
Authentication and action completion resolve the full declared inventory so a
late missing, duplicate, changed, detached, or extra context cannot be hidden
by an earlier successful lookup.

The v3 navigation guard covers main-page, popup, and child-frame navigation,
including redirect intermediates. V2 intentionally retains its prior
top-level-only navigation guard. V3 context handles, cookies, storage, page
content, and challenge values remain execution-private exactly as in v2.

For browser 1.7 non-presence accessibility outputs, the driver reads the
uniquely matched text, trims Unicode whitespace at both edges, and converts it
to the declared string, JavaScript-safe integer, finite strict-JSON number, or
lowercase Boolean. Empty or noncanonical text, unsafe integers, non-finite
numbers, and composite accessibility types fail with `invalid_response`.
Presence remains a Boolean match and does not read text. Browser 1.5/1.6
extraction behavior is unchanged, and v2 rejects browser 1.7.

Credential and OTP values are runtime-private. Credential values are resolved
by the driver from the named process environment. OTP responses travel only on
stdin and are discarded after use. Session bindings, browser storage, raw page
material, screenshots, and driver stderr never appear in protocol results.
An opaque reuse binding is resolved only against the driver's private
`--session-store`; inline or protocol-carried Playwright storage state is not
accepted.

Human challenge reads are self-bounded to 120 seconds by default. A trusted
operator can set a different positive duration, up to 24 hours, with
`--challenge-timeout` (for example, `--challenge-timeout 5m`). For
`push_number_match`, a headless driver must extract the short numeric value and
send it in the structured challenge: comparing that browser value with the
phone prompt is the security property of number matching. The optional trusted
driver argument `--number-match-selector <css>` scopes extraction on pages that
also show dates, counts, or totals. It is driver configuration, not recipe
syntax; authentication profiles still cannot carry CSS selectors for this
challenge kind.

For v2, the origin allowlist governs top-level navigations, including redirect
intermediates. It intentionally does not block non-navigation subresources or
child-frame navigations, which common sign-in pages require. `visitedUrls`
attests the bounded top-level navigation window for one action; it is neither a
complete network log nor an exfiltration boundary. Operators that require a
network-wide boundary must enforce it outside the browser driver.

## V4 registration

For additive registration 1.2/v6 verification, including closed progress and the
verification-only diagnostic, see [verification](verification.md).

V4 accepts only `register`, `registration_checkpoint_response`, and `close`
inputs. A register request carries one complete, already validated
`uws.browser-registration.1.0` profile, selected flow, exact origin allowlist,
symbolic slot-to-binding and binding-to-environment-name maps, and the fixed
registration call controls. It cannot carry a session, credential value,
verification value, selector, script, cookie, storage state, page material, or
arbitrary control.

The driver independently closes and validates that input, resolves credential
values from inherited environment variables, and opens a fresh context in a
headed Chromium process. Registration never loads storage state and the fresh
context is never assigned a session name. Every transmitted context request must
use an exact declared origin. Unapproved HTTP(S) GET/HEAD subresources are
aborted without poisoning the registration; navigation and mutation escapes
remain fatal. Redirect responses are paused before Chromium follows Location,
and a 307/308 cannot repeat the approved POST. GET and HEAD are allowed; all other methods are blocked
except for exactly one POST while executing the profile's sole `submit` step.
Only the fresh main frame may navigate. Every authored target is a unique accessibility locator.

A profile `human_checkpoint` emits `registration_checkpoint` with its closed
kind. The human acts directly in the visible browser; Udon replies with only
`continue` or `deny`. A second `registration_checkpoint` with kind
`submit_approval` is emitted immediately before opening the one-POST submit
window. The default checkpoint timeout is 120 seconds and may be changed with
the trusted `--registration-checkpoint-timeout` duration argument.

Before submit approval, denial and timeout return
`registration_checkpoint_denied` and `registration_checkpoint_timeout`.
After Continue is returned for submit, any failure or uncertain completion is
`registration_indeterminate`; the driver does not automatically retry and
rejects another register request for the same operation/source pair in that
process. Success is emitted only after the exact origin/path/accessibility
proof passes and the context closes. Its complete response is
`{"status":"success"}`. No identifier, URL, session, output, page value,
browser state, or driver prose is returned.


Verification-only v9 adds the required bounded initialization block in diagnostics
v5. It accepts only verify requests, retains the v8 request shape, and does not
change registration v6. See [initialization diagnostics](verification.md).

## V10 Browser 1.8 and 1.9 actions

The additive `udon.browser-driver.v10` persistent envelope accepts
`authenticate`, `challenge_response`, `action`, and `close`. Authentication
uses the v3 authentication 1.1 shape, context behavior, and closed MFA replies.
Registration remains v6 and verification-only diagnostics remain v9.

V10 action requests carry an inner `udon.browser-driver.v3` action with the
explicit `uws.browser.1.8` or `uws.browser.1.9` discriminator, or an inner
`udon.browser-driver.v2` action for Browser 1.5–1.7 using the existing v3
execution behavior. The two action/profile pairings cannot be crossed. The
existing fields remain: selected operation, source digest, action name, exact origins,
supplied parameter values, optional contexts, and the selected portable action.
The portable action's optional `parameters` field is the sole parameter-schema
source; omission permits no named parameters.
Its sequence and confirmation prompt arrive unresolved; Udon retains the
preceding approval and full JSON Schema checks. The driver resolves all
approved template sinks and validates placement, scalar types, defaults,
unsafe text, dot segments, URL encoding, and exact origins before any macro.
Invalid input returns only `invalid_response` or `origin_rejected` as
appropriate. Inserted parameter values are never rescanned.

Browser 1.8 permits signed 64-bit integer parameters. V10 preserves their
original JSON numeric tokens with Node 24's lossless parse context, rejecting
out-of-range values. Browser 1.9 uses the safe-integer range, accepts its
four-brace literal escapes, and rejects controls and bidirectional controls in
resolved `type_text.value` and confirmation prompts. Browser 1.8 and 1.9
retain v3 context replay and typed accessibility outputs. V2/v3 action versions
and their profile admission remain unchanged.

## V11 Browser 1.10 count actions

The additive `udon.browser-driver.v11` persistent envelope keeps the v3
authentication, challenge, and context behavior. It accepts inner
`udon.browser-driver.v4` actions with the exact `uws.browser.1.10` profile.
The v11/v4 pairing is exclusive: v10 continues to admit only inner v2/v3, and
v11 rejects inner v2/v3 before any browser step.

V11 is a count-only action contract. Each declared output must use
`matchCount: true`, `source: css`, `type: integer`, a non-empty selector, and
`visibility: all` or `rendered`. An optional `within` selector scopes the count
to the descendants of one unique element; that root is not counted. The
`validation` object declares a minimum of at least zero and an optional maximum
no greater than the JavaScript safe-integer limit. Zero, one, and multiple
matches are ordinary exact results. The response uses the outer v11 version and
returns count outputs as JSON integers; page text and element attributes are not
returned by this action contract.
Count validation schemas must be self-contained; `$ref`, `$dynamicRef`, and
`$recursiveRef` are rejected with `invalid_response` because the driver receives
only the selected action and does not resolve references against the full
profile.

An action success retains the closed persistent result keys `version`, `type`,
`requestId`, `result`, and `response`; the response contains `status`, `outputs`,
`visitedUrls`, and `ambiguities`. A failure contains only `version`, `type`,
`requestId`, `result: "failure"`, and the fixed `failureCode`. M15.1 temporarily
rejected output-bearing v11 actions before macros; M15.2 replaces that staging
check with count extraction.

Malformed selectors, a missing or ambiguous scope root, invalid or unsafe
counts, and values outside declared bounds fail with the closed
`invalid_response` code. The existing `origin_rejected`, `invalid_context`, and
`session_expired` failures keep their meanings. The portable rendered-count
rules are owned by [UWS Browser 1.10](../../uws/versions/browser.1.10.md).
