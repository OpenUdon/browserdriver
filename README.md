# OpenUdon Browser Driver

This repository provides the trusted Playwright process for
`udon.browser-driver.v2`, additive `udon.browser-driver.v3`, and the closed
registration-only `udon.browser-driver.v4`. One process lives for one Udon workflow execution, so
an explicit `uws.browser-authentication-call.1.0` operation can establish a
named in-memory session and later `uws.browser.1.5` actions can consume it. V3
adds UWS 1.8 authentication 1.1 followed by browser 1.5 main-page, browser 1.6
popup/frame replay, or UWS 1.9 browser 1.7 typed accessibility outputs, while
v2 continues to execute the unchanged UWS 1.7 contracts. V4 consumes the
published UWS browser-registration 1.0 profile and call controls in one fresh
headed context; it never creates a named session.

Registration 1.1 uses protocol v5 and Udon's separate private input form. Explicit
Start accepts the initial snapshot before browser creation; later Apply/Stop
checkpoints retain the running deadline. The accepted snapshot supplies both
credentials and ordinary string, Boolean, integer and number fields. Conditional
and omitted values are handled through native fill/check/select actions, and
the final submit approval binds the exact current snapshot. V4 remains the
registration 1.0 environment-credential path.

The driver accepts only reviewed, closed browser macros. Credentials are read
from environment-variable names mapped by Udon; values never appear in UWS,
arguments, reports, or failure messages. MFA is mediated by Udon's local
terminal or authenticated challenge API. Sessions are not persisted by
default. An operator may provide an opaque reference for reuse together with a
private driver-owned storage directory; cookies and Playwright storage state
never cross the protocol.

## Build

Node.js 24 is required. Playwright is pinned to 1.62.1.

```bash
npm ci --ignore-scripts
npm test
npx playwright install chromium
```

The executable is `dist/index.js` after `npm run build`. Configure Udon with an
absolute executable wrapper or the generated executable file and protocol v2:

```bash
udon \
  --workflow ./workflow.uws.yaml \
  --browser-driver /absolute/path/to/openudon-browser-driver \
  --browser-driver-protocol v2 \
  --browser-credential-env member_username=MEMBER_USERNAME \
  --browser-credential-env member_password=MEMBER_PASSWORD \
  --approve-browser-authentication authenticate_member
```

Use `--browser-driver-protocol v3` with Udon's UWS 1.8/1.9 lowering. V3
requires authentication 1.1 and the internal action v2 envelope, which may
carry browser 1.5, 1.6, or 1.7; browser 1.7 adds locale-free scalar conversion
and is rejected by the v2 session path.

Use `--headed` as a trusted driver argument when WebAuthn or operator-visible
browser interaction requires a window.

Registration requires `--headed` and Udon protocol v4. Credential values are
resolved only from the inherited environment names in the request. Human
registration checkpoints and the distinct pre-submit approval accept only
Continue or Deny; no verification value crosses NDJSON. The optional trusted
`--registration-checkpoint-timeout 5m` argument changes the default 120-second
bound. Every registration context closes before its fixed Boolean/status
result is emitted and is never entered in the named-session map.

Reusable sessions require the trusted `--session-store /absolute/private/dir`
driver argument. The store contains Playwright storage-state JSON under the
SHA-256 digest of the opaque reference (`<digest>.json`); files are regular,
non-symlink entries no larger than 1 MiB. Udon sends only the opaque reference,
and the driver performs the lookup locally.

## Security boundary

- Exact application and identity-provider origins are enforced across all
  redirects.
- V3 also enforces declared origins for child-frame and popup navigations,
  requires one uniquely resolved frame, and accepts one popup only when an
  explicit `opensContext` click declares it.
- Every cached page/frame is revalidated before reuse and at authentication or
  action completion; closure, detachment, origin/identity drift, renewed
  ambiguity, or an incomplete/extra inventory fails closed.
- Authentication locators are accessibility-only. Browser-action CSS remains
  limited to a reviewed output fallback already allowed by `uws.browser.1.5`.
- Driver-controlled exception text is collapsed to a closed failure code.
- CAPTCHA is detected and rejected; bypass is not supported.
- Named contexts, cookies, and storage remain process memory only.
- Push, number matching, TOTP, SMS/email/voice OTP, passkeys, and security keys
  are explicit flow choices. The driver never guesses an MFA alternative.
- V4 registration accepts only the closed registration macro, exact reviewed
  origins, accessibility locators, symbolic environment bindings, and fixed
  call controls. It permits GET/HEAD plus exactly one POST in the sole submit
  window. Submit approval is the irreversible boundary: a later failure is
  `registration_indeterminate`, and the operation/source pair is not retried.
- Registration emits no URL, page value, identifier, cookies, storage,
  session, request body, or browser state. Cleanup remains a separately
  selected disposition and is not performed by the driver.

See [docs/protocol.md](docs/protocol.md) for the private process contract.

## Registration window and checkpoint timing

The headed registration page requests foreground presentation at launch and
each input, human and final submit checkpoint. The desktop window manager may
still require operator attention; foreground presentation grants no consent or
submission decision.

V5 checkpoint messages include an optional `deadline` timestamp. Matching Udon
uses the earliest driver, broker or workflow deadline for its private form
countdown. The driver rejects replies after its own deadline; transport and UI
delays never restart that wait. V2-v4 wire shapes remain unchanged. Use the
reviewed matching Udon/Browserdriver pair when adopting this additive v5 wire.
