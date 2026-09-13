# M13 — Trusted browser verification

| Item | State | Notes |
| --- | --- | --- |
| M13.1 | `[+]` | Protocol v6, three trusted adapters and bounded provider network/frame policy; source reviewed. |
| M13.2 | `[+]` | Both approval orders, one POST, private closure readiness, deadlines and verification-only probe; fresh synthetic smoke passes. |
| M13.3 | `[+]` | Full offline tests, adversarial/privacy smoke, npm audit (zero vulnerabilities), docs and bounded review iteration 2 pass. |

The approved September 13 verification release covers Turnstile, reCAPTCHA v2
and hCaptcha, including invisible widgets activated by an approved Submit.
Background readiness advances to final approval; actual challenges remain human.
Keep production protection enabled. Detection proposes metadata; explicit review
grants bounded provider traffic separately from exact application destinations
and the one approved application POST. Tokens stay inside the browser.

Dependency order: UWS BRP/call 1.2 (tracked by W8M W16.4f) -> Browsertools A13
and Browserdriver M13 -> Udon M41 -> OpenUdon A30/E15 -> W8M W16.4g–k.
Preserve published 1.0/1.1 and UWS core. Add author-session/result v4, driver v6,
authoring-authority v2, operation-packet v3 and explicitly version expanded
review/transaction envelopes. Old consumers reject new versions before launch.

Provider policy binds HTTPS domain/path/method/frame rules and finite maxima:
256 requests, 32 MiB responses and 120 seconds, clamped by the operation deadline;
consumer authority may tighten them. Provider POSTs cannot consume or authorize
application submissions, popups, top-level navigation, downloads or other traffic.
Readiness is client evidence only; backend acceptance remains separate. Missing
or ambiguous widgets, expiry, unsupported integrations and early/duplicate POSTs
stop. Never replay a click, reload or automatically retry registration.

Each owner requires focused offline tests, one affected synthetic browser smoke,
privacy canaries and a bounded whole-diff review with no P1/P2 findings, maximum
ten iterations. Full acceptance v2 follows explicit dependency publication and
source freeze, once the integration candidate is ready; adopt exact tested bytes
and preserve the operating kit. Provider-network tests and real W8M authoring,
verification-only probing and registration require separate explicit authority.
The verification-only probe uses the trusted driver, no private inputs, zero
application mutations and clean teardown; it creates no registration claim.
Failure-report verification is distinct from successful-registration evidence.
reCAPTCHA v3/Enterprise assessments, solving services, fingerprint evasion and
production configuration changes are outside scope.

Implementation review closes at iteration 2 with no remaining P1/P2 finding.
Release qualification/adoption remains downstream in OpenUdon E15 and W8M.

Protocol v6, fixed provider policies, readiness probes, both approval sequences and a credential-free verify command are implemented. Offline policy/state/network tests pass. The fresh loopback smoke passes all providers in both modes plus missing/ambiguous/rejected/cancelled/premature states and diagnostic teardown. It found and fixed submission-boundary evaluation and delayed-navigation races.

Review fixed the exposed-binding trust issue and moved widget/form/response
identity into a browser closure held only by a trusted handle. A fabricated
ready argument and replacing the reviewed widget during approval both stop
without an application POST. Fresh smoke also covers actual expiry, blocked
initialization and duplicate callbacks; all three providers and both activation
orders pass. Bodies are bounded before browser delivery, not as a process heap
ceiling. Provider redirects remain unsupported. Official-key fixtures are
implemented, separately opt-in and unrun; no provider acceptance is claimed.
