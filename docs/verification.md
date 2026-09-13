# Reviewed verification in driver v6

Registration/call 1.2 select `udon.browser-driver.v6`. V6 accepts typed
registration, its private checkpoint responses, `verify` and `close`. The
trusted caller supplies an absolute operation deadline. The inert
`humanVerification` descriptor binds one provider, activation order, exact POST
destination and immutable dependency policy. See the [UWS contract](https://github.com/OpenUdon/uws/blob/main/versions/browser-registration.1.2.md).

Provider requests have a separate allowance: at most 256 requests, 32 MiB of
response bodies admitted to the page and 120 seconds, tightened by the
descriptor and operation deadline. The phase starts at the first provider
request or widget binding, whichever occurs first; it cannot be renewed.
Playwright buffers each response before the body budget check, so this is not a
process heap limit. Provider redirects are refused. Application redirects must
lead to an exact reviewed navigation URL; 307/308 cannot replay the application
POST. Provider frames must descend from the selected main page through approved
provider frames. Popups, application frames, downloads, service workers,
WebSockets, EventSource and persistent streams are blocked.

The adapters support one standard provider widget within the uniquely selected
submit control's POST form. They compare the provider API response with the form
response field inside the website realm. Only `loading`, `awaiting_interaction`,
`ready`, `expired`, `failed` or `unsupported` leaves that probe. Ambiguous widgets,
missing response fields, changed response identity and custom/Enterprise
integrations stop. Human challenges stay in the headed browser. Client readiness
never establishes backend acceptance.

`before_approval` readiness automatically opens final approval and is rechecked
before Submit and at form handoff. `approved_submit` approval covers one control
activation and at most one application POST. A standard invisible callback may
call `form.submit()` later; the same gate protects that delayed handoff. Early
and duplicate callbacks stop. Custom fetch/AJAX submission without that handoff
is unsupported. Consent remains separate. There is no automatic click replay,
reset or reload. Failure after a released POST remains
`registration_indeterminate` and cannot authorize a retry.

`verification_progress` carries the provider, closed state, absolute deadline,
`providerRequests`, `providerPosts`, `providerResponseBytes`,
`applicationRequests` and `applicationPosts`. It contains no DOM text, token,
credential or exception prose. Closed failures are `verification_unsupported`,
`verification_not_ready`, `verification_expired`, `verification_failed`,
`verification_timeout`, `verification_policy` and `verification_budget`.

`verify` accepts only v6, request ID, source digest, profile, selected flow, exact
origins and deadline. It requires `before_approval`, uses no private inputs and
prohibits application mutations. Success follows context closure and returns
`{"verification":"ready","teardown":"complete","applicationPosts":0}`. It
creates no account claim or reusable token.

## Tests and separate provider scope

`npm test` is browser-free. The explicit synthetic smoke covers all three
providers and both approval orders, delayed callbacks, cancellation, missing or
ambiguous widgets, expiration, blocked initialization, premature/duplicate
callbacks, privacy canaries and diagnostic teardown, using loopback only:

```sh
BROWSERDRIVER_VERIFICATION_LIVE_TEST=1 node --test dist/test/verification-live.test.js
```

After separately authorizing provider contact, select one official-key fixture
per invocation and complete any visible verification manually:

```sh
BROWSERDRIVER_PROVIDER_NETWORK_TEST=turnstile node --test dist/test/verification-provider.test.js
BROWSERDRIVER_PROVIDER_NETWORK_TEST=recaptcha_v2 node --test dist/test/verification-provider.test.js
BROWSERDRIVER_PROVIDER_NETWORK_TEST=hcaptcha node --test dist/test/verification-provider.test.js
```

These use public test sitekeys and `verification-fixture.test`, mapped to
loopback by that Chromium process. They change no host configuration and create
no accounts. The local POST endpoint discards responses without inspection or
retention. They test client integration, not backend assessment or production
automation acceptance, and are excluded from ordinary/native qualification.
References: [Cloudflare testing](https://developers.cloudflare.com/turnstile/troubleshooting/testing/),
[Google testing](https://developers.google.com/recaptcha/docs/faq),
[hCaptcha testing and network requirements](https://docs.hcaptcha.com/).
