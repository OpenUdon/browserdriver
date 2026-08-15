# Udon browser-driver v2 protocol

The process reads and writes one JSON object per line. Every envelope carries
`version: "udon.browser-driver.v2"` and a `requestId`. The maximum line size is
1 MiB. Udon starts one process per workflow execution and serializes requests.

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

The origin allowlist governs top-level navigations, including redirect
intermediates. It intentionally does not block non-navigation subresources or
child-frame navigations, which common sign-in pages require. `visitedUrls`
attests the bounded top-level navigation window for one action; it is neither a
complete network log nor an exfiltration boundary. Operators that require a
network-wide boundary must enforce it outside the browser driver.
