# Product

Browserdriver is the trusted, private execution adapter that turns reviewed
UWS browser authentication and action macros into Playwright operations. It
supports sign-in and MFA while keeping all credential and live-session state
outside portable artifacts.

Protocol v2 remains the main-page runtime for UWS 1.7 profiles. Protocol v3
adds trusted UWS 1.8 popup/frame replay with exact context inventory and
child-context origin enforcement; it does not accept authoring sessions or
Playwright-Go handles.

Enrollment, recovery, password changes, consent grants, logout, account
creation, CAPTCHA bypass, arbitrary browser scripts, and public session storage
are non-goals.
