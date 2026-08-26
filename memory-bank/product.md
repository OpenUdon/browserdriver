# Product

Browserdriver is the trusted, private execution adapter that turns reviewed
UWS browser authentication and action macros into Playwright operations. It
supports sign-in and MFA while keeping all credential and live-session state
outside portable artifacts.

Protocol v2 remains the main-page runtime for UWS 1.7 profiles. Protocol v3
adds trusted UWS 1.8 authentication 1.1 with browser 1.5 main-page or browser
1.6 popup/frame replay and UWS 1.9 browser 1.7 typed accessibility outputs,
exact continuously revalidated context inventory, and child-context origin
enforcement. Runtime context absence or substitution returns the closed
`invalid_context` code, distinct from malformed profile/protocol input. It does
not accept authoring sessions or Playwright-Go handles.
For every accepted browser profile, only literal `presence: true` selects
Boolean match mode; `presence: false` retains the declared extraction type.

Protocol v4 adds trusted execution for the published UWS browser-registration
1.0 contract. It uses a new headed, unnamed context per attempt, reads
credentials only from inherited environment variables, brokers human and
submit checkpoints as Continue/Deny, permits one approved POST, returns only a
fixed registration status, and tears the context down before reporting.

Recovery, password changes, logout, arbitrary browser scripts, CAPTCHA bypass,
public session storage, registration retry after an approved submit, and
driver-managed account cleanup are non-goals.
