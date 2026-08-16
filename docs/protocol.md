# Udon browser-driver v2 and v3 protocols

The process reads and writes one JSON object per line. Every envelope carries
`version: "udon.browser-driver.v2"` and a `requestId`. The maximum line size is
1 MiB. Udon starts one process per workflow execution and serializes requests.
The additive v3 envelope uses `version: "udon.browser-driver.v3"`; v2 message
and execution behavior remains accepted and unchanged.

Input message types are:

- `authenticate`: exact recipe, selected flow, named session, allowed origins,
  symbolic credential bindings, environment-variable names, and an optional
  opaque reuse binding;
- `action`: one validated browser.1.5 action plus the named session;
- `challenge_response`: `approve`, `deny`, or `provide`; and
- `close`.

Output message types are:

- `status`: `resolving`, `logging_in`, `awaiting_mfa`, `refreshing`, or
  `executing`;
- `challenge`: a closed MFA kind and, for number matching, a numeric value; and
- `result`: success or one closed failure code.

Failure codes are `mfa_timeout`, `mfa_denied`, `credentials_invalid`,
`session_expired`, `driver_error`, `unsupported_challenge`,
`captcha_required`, `origin_rejected`, `ambiguous_locator`, and
`invalid_response`. There is no free-form error field.

## V3 portable contexts

V3 accepts only `uws.browser-authentication.1.1` authentication profiles and
internal `udon.browser-driver.v2` actions lowered from `uws.browser.1.6`. It
supports the implicit `main` target plus the reviewed `contexts` graph. Every
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

The v3 navigation guard covers main-page, popup, and child-frame navigation,
including redirect intermediates. V2 intentionally retains its prior
top-level-only navigation guard. V3 context handles, cookies, storage, page
content, and challenge values remain execution-private exactly as in v2.

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
