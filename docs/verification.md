# Reviewed verification in driver v6

Registration/call 1.2 select `udon.browser-driver.v6`. V6 accepts typed
registration, its private checkpoint responses, `verify` and `close`. The
trusted caller supplies an absolute operation deadline. The inert
`humanVerification` descriptor binds one provider, activation order, exact POST
destination and immutable dependency policy. See the [UWS contract](https://github.com/OpenUdon/uws/blob/main/versions/browser-registration.1.2.md).

Provider requests have a separate allowance: at most 256 requests, 32 MiB of
response bodies fetched (including checked redirect bodies) and 120 seconds, tightened by the
descriptor and operation deadline. The phase starts at the first provider
request or widget binding, whichever occurs first; it cannot be renewed.
Playwright buffers each response before the body budget check, so this is not a
process heap limit. GET/HEAD provider subresources may follow at most five
redirects, each within the same HTTPS origin and the existing provider path
policy. Every hop consumes a request; every accepted body consumes bytes.
Ambiguous Location, loops, cross-origin/path escapes, document redirects and
all provider POST redirects stop before another request. Application redirects must
lead to an exact reviewed navigation URL; 307/308 cannot replay the application
POST. Provider frames must descend from the selected main page through approved
provider frames. Ancestor validation strips only the URL fragment, which is
not sent in HTTP requests, and checks the remaining raw URL at admission, each
redirect hop and delivery. Blank/srcdoc, detached, unapproved and over-depth
ancestries stop with a closed diagnostic category. Popups, application frames,
downloads, service workers,
WebSockets, EventSource and persistent streams are blocked.

The adapters support one standard provider widget within the uniquely selected
submit control's POST form. They compare the provider API response with the form
response field inside the website realm. Only `loading`, `awaiting_interaction`,
`ready`, `expired`, `failed` or `unsupported` and a closed diagnostic reason leave
that probe. API presence before the response field is rendered remains loading;
it never counts as readiness and retains the original deadline. Ambiguous
widgets, unbound response fields, changed response identity and custom/Enterprise
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

The driver, provider fixtures and local presentation diagnostic all require
`chromiumSandbox:true` through the same launch-policy helper. Launch failure
propagates without an unsandboxed fallback or automatic retry. The existing
administrator-owned sandbox helper remains supplied by the supervising launcher;
no dependency installation or host configuration change is performed. A report's
`chromiumSandbox:true` records the required launch setting, not an independent
kernel sandbox attestation.

Provider reports are now `browserdriver.provider-fixture.v5`; local presentation
reports are `browserdriver.fixture-presentation.v2`. Their independent claim files
are provider claim v3 and presentation claim v2 and bind the requested report version. Launchers must supply the exact
`BROWSERDRIVER_PROVIDER_REPORT_VERSION` or
`BROWSERDRIVER_FIXTURE_VISIBILITY_REPORT_VERSION` respectively. Missing or older
versions stop before claims and browser launch. Frozen older reports and supervisors remain unchanged. Driver wire v6 remains
unchanged; new provider reports embed verification diagnostics v4.

Both fixtures share the Ready-page observer. Provider v5 embeds
`browserdriver.fixture-window.v1` under `presentation`; local v2 retains its
`samples` and `omittedSamples`. Samples contain only phase, elapsed milliseconds,
Chromium outer-window bounds and closed page visibility/focus values. They never
read page `screen` geometry or infer desktop containment, workspace membership,
occlusion or compositor focus. This removes v1's invalid comparison against
Playwright's emulated screen. Only an actual trusted Ready click confirms human
visibility in a manually operated fixture.

Observation occurs before/after the single foreground request and while waiting
for Ready or Cancel, then stops before provider loading. Waiting samples are
throttled to 500 ms; retain the first two and most recent 30 changed samples,
count omissions, and emit at most 32 reduced progress samples. Null window data
stops before verification with closed presentation failure. Sampling time counts
against the fixed confirmation deadline; expiry and page closure are rechecked
before accepting a decision. No resizing, movement, workspace switching, repeated
focus requests, clicks, reloads or timing extensions are introduced. No DOM,
titles, screenshots, tokens, raw exceptions or other-window content is retained.

The independent local presentation diagnostic serves only GET /ready with a
local-only notice and blocked other page traffic/WebSockets. Its Ready click
confirms visibility and closes; no provider loading or submission path exists.
Select `BROWSERDRIVER_FIXTURE_VISIBILITY_TEST=1`, a new absolute
`BROWSERDRIVER_FIXTURE_VISIBILITY_REPORT`, and
`BROWSERDRIVER_FIXTURE_VISIBILITY_REPORT_VERSION=browserdriver.fixture-presentation.v2`
with `node --test dist/test/fixture-presentation-live.test.js` after separate
browser authorization. It keeps five-minute confirmation clamped by 330 seconds
overall, 350-second runner and 360-second outer supervision plus ten-second cleanup.

`npm test` is browser-free. The explicit synthetic smoke covers all three
providers and both approval orders, delayed callbacks, cancellation, missing or
ambiguous widgets, expiration, blocked initialization, premature/duplicate
callbacks, privacy canaries and diagnostic teardown, using loopback only:

```sh
BROWSERDRIVER_VERIFICATION_LIVE_TEST=1 node --test --test-concurrency=1 \
  dist/test/verification-live.test.js dist/test/verification-repair-live.test.js
```

A bounded development smoke can select one synthetic Turnstile before-approval
case from the repair stage. Set `BROWSERDRIVER_VERIFICATION_LIVE_TEST=1`,
`BROWSERDRIVER_VERIFICATION_REPAIR_CASE=turnstile-before_approval` and a fresh
absolute `BROWSERDRIVER_VERIFICATION_REPAIR_REPORT`, then run only
`dist/test/verification-repair-live.test.js`. This opt-in case consumes an exclusive
synthetic claim, starts one sandboxed browser, uses the actual provider fixture
with every provider fetch replaced by loopback transport, automatically clicks
only the local synthetic Ready control, and produces a v5 report even on failure.
It creates no real account and contacts no provider. It tests execution, not
human visibility. Missing selection or an existing report/claim stops before
browser launch. The selected case skips all other provider/mode rows and the
extra cancellation browser. Its runner limit is 120 seconds; outer supervision
must bound it to 150 seconds plus ten-second cleanup. The original full synthetic
matrix remains available when no single-case selector/report is supplied.

After separately authorizing provider contact, select exactly one provider and
activation mode per invocation, with a new absolute private report path:

```sh
BROWSERDRIVER_PROVIDER_NETWORK_TEST=turnstile \
  BROWSERDRIVER_PROVIDER_ACTIVATION=before_approval \
  BROWSERDRIVER_PROVIDER_REPORT=/absolute/private/turnstile-before.json \
  BROWSERDRIVER_PROVIDER_REPORT_VERSION=browserdriver.provider-fixture.v5 \
  node --test dist/test/verification-provider.test.js
```

The initial local instruction screen requires an actual click on **I'm
ready—start verification**. It explains that the person must click any checkbox
and complete visible challenges. Provider scripts and widgets are not loaded
until confirmation. There is a separate five-minute confirmation limit, then
one nonrenewable two-minute verification phase, including loading, with a visible
countdown. Cancel or closing the window stops before provider loading. A queued
confirmation received after expiry cannot extend it. The overall fixture limit
is 450 seconds plus teardown; the test runner limit is 480 seconds. A new
supervisor scope must accommodate these limits and explicitly request and accept v5 reports;
the old frozen supervisor/candidate must not be edited or reused for this code.
This readiness prompt belongs to disposable fixtures; runtime registration
approval/consent protocols and their existing deadlines remain unchanged.

These use public test sitekeys and `verification-fixture.test`, mapped to
loopback by that Chromium process. They change no host configuration and create
no accounts. The local POST endpoint discards responses without inspection or
retention. They test client integration, not backend assessment or production
automation acceptance, and are excluded from ordinary/native qualification.
Select `turnstile`, `recaptcha_v2` or `hcaptcha` and `before_approval` or
`approved_submit`. No implicit second mode is run. The old provider-only command
fails before launch. An exclusive `.claim.json` beside the result is consumed
before launch; failure or a missing crash report cannot authorize reuse.

The fixture explicitly renders from the documented SDK onload callback, keeps
the returned widget ID in its page and executes it once only in approved-Submit
mode. Visible verification, including a test-key checkbox when required, is
human-operated. Turnstile test pages disable its configurable automatic retry
and expired-response refresh. Other provider-internal requests remain bounded
by the same guard; the fixture never resets, reloads or repeats a Submit click.

`browserdriver.provider-fixture.v5` records one mode's outcome, failing phase,
duration, confirmation and verification deadlines, final local POST count, request counts and context/browser/server
closure on failure as well as success. `lastObservedCallbacks` contains only
fixed flags, saturated counts, a 32-event lifecycle trace, omitted-event count
and first error (retained independently of trace eviction). It is the last
observation before navigation, not a complete callback history. Closed error
sources distinguish script/render/handle failures, premature or duplicate
triggers, execute exceptions and asynchronous rejection, provider error callbacks
and local completion-submission exceptions. Callback arguments and exception
prose are ignored. Execute-promise fulfillment is an observation, never readiness.
Snapshot properties are copied once and validated inside the browser before
crossing Playwright; invalid snapshots stop with a closed label. A process supervisor must independently
verify joined teardown and explicitly report a missing final report after a
crash. These are development diagnostics, not qualification or registration
evidence.

The internal `browserdriver.verification-diagnostics.v3` snapshot separates
probe states/reasons and return kinds (`unobserved`, `undefined`, `string`,
`null`, `other`), policy rejections, response status classes and transport
failures. It retains at most 32 probe transitions and 32 network observations,
omission counts and the first network failure. Endpoints, methods, resource
types, frame relationships and transport errors reduce to closed labels; no
hostname, URL, header, response, page content or exception text is exported.
Provider responses and dropped reads are recorded separately from failures.
V2 distinguishes active and shutdown network observations, records the exact
closed frame-ancestry rejection category, and reports whether context closure,
API request disposal and callback joining completed. Successful checked
redirects are observations, not failures. Shutdown freezes admissions before
cancelling API requests and closing the context, then joins route, binding and
CDP callbacks. Pre-shutdown failures remain terminal; later observations retain
the shutdown phase without replacing the first active failure. A failure or
five-second overrun of cleanup fails the operation; final success is emitted
only after joined teardown. These labels establish timing, not the cause of
every provider error. See Playwright's [request disposal](https://playwright.dev/docs/api/class-apirequestcontext#api-request-context-dispose)
and [route fetch redirect controls](https://playwright.dev/docs/api/class-route#route-fetch).

An evaluation failure during post-release navigation can appear in the trace
without indicating provider rejection. Existing v6 progress and result shapes
remain unchanged.

Local regression tests exercise API-before-render initialization, terminal API
errors after rendering, callback timing/identity, diagnostic bounds/privacy,
transport versus redirect/frame failures, incomplete selection and consumed
claim rejection. Provider failures from the first adopted candidate remain
failed evidence; the initialization correction is not yet a proven explanation
of any specific provider run. Retest providers against a reviewed development
candidate before repeating the complete downstream acceptance/adoption gate.
References: [Cloudflare testing](https://developers.cloudflare.com/turnstile/troubleshooting/testing/),
[Google testing](https://developers.google.com/recaptcha/docs/faq),
[hCaptcha testing and network requirements](https://docs.hcaptcha.com/).
Lifecycle references: [Turnstile rendering](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/),
[reCAPTCHA rendering](https://developers.google.com/recaptcha/docs/display),
[reCAPTCHA invisible execution](https://developers.google.com/recaptcha/docs/invisible),
[hCaptcha onload and widget APIs](https://docs.hcaptcha.com/configuration).

The redirect correction enforces the existing UWS 1.2 requirement to validate
every hop. It adds no host, path, method, frame type, budget or application
mutation to immutable provider v1 authority. Cross-origin and document redirect
support would need further design/review and remains unsupported. Fragment-aware
frame validation is a locally reproduced correction; the consumed hCaptcha
reports did not identify their precise failed ancestor, so live resolution is
unproven. The two consumed Turnstile reports likewise retained no redirect
location. Synthetic tests cannot establish acceptance of those actual targets.


### M13.7 initial-response compatibility and diagnostic isolation

Turnstile may return `undefined` before its first response is ready, as documented
in the [Cloudflare API reference](https://github.com/cloudflare/skills/blob/main/skills/cloudflare/references/turnstile/api.md).
Only Turnstile receives this pending-state exception, and only for the uniquely
bound widget with an empty response field and no prior ready response. It grants
no submission. Missing/replaced readiness invalidates existing approval;
contradictory fields and unsupported types stop. No value is coerced into a token.

The fixture retains reCAPTCHA's documented onload/explicit-render sequence and
one execute against the returned handle. There is no speculative delay, reload,
reset or retry. [Google documents onload as a v2 loading gate](https://developers.google.com/recaptcha/docs/loading).
The three previous failures remain consumed; their reports cannot establish the
actual Turnstile return kind or distinguish the reCAPTCHA error source. Prepare
one separately authorized reCAPTCHA approved_submit diagnostic, then require an
evidence-backed local correction when indicated and final six-case validation.
V3 diagnostics/reports require a new strict supervisor; frozen v1/v2 evidence and
the currently adopted runtime stay unchanged. Driver v6 and UWS remain unchanged.

### Native form properties

Verification reads action, method and target through native form getters and
checks widget containment through the native Node method. Named controls cannot
replace those properties. The submission boundary also uses native appendChild
when preserving the successful submitter value. Exact resolved destination,
POST method, target, form identity and submitter overrides are rechecked.

The loopback verification suite includes six colliding control names, all
three simulated providers in both modes, destination/method/target escapes and
zero-POST rejection of forms that mask `getAttribute` or `hasAttribute`. Those shapes break
the installed Playwright accessibility reader and remain unsupported with a
closed driver failure; no locator fallback or automatic retry is introduced.

## Verification-only v7 diagnostics

V7 accepts only a complete `verify` request with the same fields as v6 verify.
Registration and all existing v2-v6 message shapes remain unchanged. Older
drivers reject v7 before browser execution. V7 does not extend UWS, provider
permissions, widget adapters or the one-POST registration state machine.

After cleanup: final `verification_progress` when a guard exists, exactly one
`verification_diagnostics` message, then `result`. The diagnostic message contains
`version`, `type`, `requestId`, `diagnostics` and `counts`. `diagnostics` is the
existing `browserdriver.verification-diagnostics.v3` snapshot with shutdown flags;
`counts` has the same five integer fields as progress. Both are null when failure
precedes guard creation. Consumers distinguish absent crash output from these
explicit nulls and cannot infer readiness from failure or clean shutdown.

The snapshot has at most 32 observations and 32 network events, omission counts
and the first active network failure; later shutdown events cannot overwrite it.
It returns closed state/reason/response-kind labels, endpoint/method/frame/status/
transport classes and shutdown booleans. It does not capture provider error text,
error codes, challenge content, response tokens, URLs or exception prose. Empty
responses after a visible provider error can still time out; the diagnostics
improve the next investigation without claiming to identify that earlier cause.

The opt-in `BROWSERDRIVER_PROBE_LIVE_TEST=1 node --test
dist/test/verification-probe-live.test.js` runs two local synthetic probes: ready
and API failure. No provider endpoints or accounts are used and every application
POST is forbidden. Explain before launch: leave the pages alone; do not fill or
submit anything; the test closes them automatically. Browser execution needs
separate explicit authorization and the existing sandbox helper.


## Verification-only v8 and diagnostics v4

M13.20 adds verification-only `udon.browser-driver.v8`. Its request and message
sequence are the same as v7; the diagnostic payload selects
`browserdriver.verification-diagnostics.v4`. V7 continues to emit the exact v3
shape, and registration remains v6. W8M's matching consumer writes probe v4 and
requires v8/v4 for new preparation. Historical v3 diagnostics remain verifiable
but cannot satisfy that new prerequisite.

V4 adds three required fields:

- `frame`: latest pending-response frame observation, with `visibility` equal to
  `unavailable`, `visible`, `hidden` or `ambiguous`, and `associatedFrames` from
  zero through 32. Frame discovery checks the existing provider URL policy,
  direct parent and composed ancestry to the reviewed widget. Element handles
  include supported shadow roots; no challenge content is inspected. Readiness
  and expiry are evaluated first; other observations export unavailable/zero.
- `lifecycle`: application-page SDK observations. `availability` is unavailable,
  partial, or observed; observed means all six existing callbacks were wrapped
  during an observed explicit render. `hooks` records successfully instrumented
  hooks, not continuous coverage or absence of unobserved events. Implicit or
  late hooks are at most partial. Existing callback receiver, arguments, return,
  throw and ordering are preserved. Missing hooks are never installed. Counts
  for success/error/expired/timeout/before_interactive/after_interactive and six
  fixed error families saturate at 1,000,000 with an explicit `saturated` flag.
  Error families are configuration, timeout, clock_or_cache, frame_load,
  challenge and unknown. First/last error retain only a family or none. Callback
  indications never establish readiness and never trigger recovery or a retry.
- `summary`: `unit` is diagnostic_events. Sixteen fixed phase/endpoint counters
  retain events, blockedReads, provider4xx, provider5xx and fatal; fixed
  fatalReasons counts and firstAbnormal/lastAbnormal reduced events survive
  the 32-event ring. Counters saturate at 1,000,000 with `saturated`. Active and
  shutdown phases remain distinct. Provider request/POST/byte counts keep their
  existing meanings. Null firstFailure still excludes neither blocked reads nor
  HTTP errors; status classes do not establish a provider failure's cause.

Provider-fixture v5 embeds v4 and requires claim v3; synthetic fixture claims
are v2. Old v4 reports and consumed claims are immutable. No provider fixture is
armed by a version update. Private enclosing readers must select the new version
in a freshly reviewed scope before use.

Default `npm test` is browser-free. The maintained
`verification-observability-live.test.js` is selected only by the explicitly
authorized native registration_driver stage. It checks synthetic shadow frames,
callback errors with an empty response, matching readiness, API exceptions,
zero provider requests/zero probe application POSTs and joined teardown. Frame
responses are locally fulfilled. No real CAPTCHA or account operation occurs.
