# M13 — Trusted browser verification

| Item | State | Notes |
| --- | --- | --- |
| M13.1 | `[+]` | Protocol v6, three trusted adapters and bounded provider network/frame policy; source reviewed. |
| M13.2 | `[+]` | Both approval orders, one POST, private closure readiness, deadlines and verification-only probe; fresh synthetic smoke passes. |
| M13.3 | `[+]` | Full offline tests, adversarial/privacy smoke, npm audit (zero vulnerabilities), docs and bounded review iteration 2 pass. |
| M13.4 | `[!]` | Local diagnostics/initialization implementation and review pass. The separately authorized six-case provider retest completed once per pair: reCAPTCHA approved_submit passed; both Turnstile cases hit script-redirect policy, both hCaptcha cases hit provider-frame policy, reCAPTCHA before_approval timed out awaiting readiness. All teardowns verify; original and successor claims remain consumed. Provider repair and renewed qualification remain pending. |
| M13.5 | `[+]` | Local repair and bounded review iteration 2 pass: checked same-origin GET/HEAD subresource redirects, fragment-aware ancestry with precise reasons, explicit shutdown/join, and confirmation before fixture loading/countdown. 72 offline tests and both fresh affected Chromium smokes pass; npm audit reports zero vulnerabilities. Real-provider acceptance, a new frozen fixture scope, publication and renewed qualification/adoption remain pending; all prior invocations remain consumed. |
| M13.6 | `[!]` | Fresh six-case provider batch ran once per pair: three pass (reCAPTCHA before_approval, both hCaptcha modes), three fail (both Turnstile modes: response_type; reCAPTCHA approved_submit: error after execute). All 78 process identities/listeners closed without force; three discarded local POSTs. Scoped run review iteration 1 passes; all six permissions are consumed. Provider integration and renewed qualification remain blocked on the two remaining initialization/activation findings. |
| M13.7 | `[+]` | Local Turnstile pending-response correction and fixture/diagnostics v3 pass 79 offline tests, affected synthetic matrices and bounded review iteration 2. One frozen reCAPTCHA approved_submit diagnostic proposal is prepared; no provider invocation authorized. |
| M13.8 | `[+]` | The one authorized reCAPTCHA approved_submit diagnostic passed: readiness, one local POST, 13 process identities absent, listener/guard teardown clean and scoped review iteration 1 passes. Authorization consumed. Original failure remains unexplained; final six-case validation is a separate pending gate. |
| M13.9 | `[+]` | Six-case scope v4 prepared against the unchanged frozen M13.7 candidate. Offline supervisor/admission/evidence/cleanup tests, candidate preservation preflight and bounded review iteration 1 pass. Proposal awaits separate owner authority; no browser/provider run or new claim. |
| M13.10 | `[!]` | Batch stopped at case 1 Ready confirmation timeout, before all provider traffic/submission. First invocation consumed; five unstarted, no executable continuation. Valid failure evidence, twelve process identities absent, clean listener/guard teardown and scoped review pass. Owner confirms the original window was invisible; separately authorized local visibility check passed with actual confirmation, recorded bounds and thirteen-process cleanup. A fresh provider scope remains pending. |
| M13.11 | `[+]` | Authorized local diagnostic confirmed visibility and clean teardown; P2 emulated-screen comparison corrected and verified by M13.12 offline tests and one fresh synthetic browser smoke. Bounded review passes. Historical invisibility remains unexplained; diagnostic authority consumed. |
| M13.12 | `[+]` | Shared sandbox-required launch and Ready-only versioned observations verified: 89 offline passes and one separately authorized frozen synthetic Turnstile smoke passed (4.268 s, one discarded local POST). Fourteen process identities absent, two listeners closed without force; bounded execution review passes. Smoke authority consumed. Fresh six-case provider scope/authorization and qualification/adoption remain pending. |
| M13.13 | `[+]` | Fresh six-case scope/authority/result v5 prepared against the unchanged M13.12 candidate and passing smoke. Required report v4/claim v2, bounded Ready progress, strict predecessor bindings and PID/listener closure. Ordered fake cases, nineteen failure scenarios, cancellation tests, preservation and bounded review pass. No browser/provider execution or new authority. |
| M13.14 | `[+]` | Authorized v5 batch ran all six official-key provider/mode pairs once: six passes, six discarded local POSTs. Exact reports/claims, 93 worker and six supervisor identities, six closed listener inodes and bounded execution review verify without force. All permissions consumed; publication, complete qualification/adoption and production acceptance remain pending. |
| M13.15 | `[+]` | Published source aefdd875633b passes focused owner checks, fresh complete acceptance v2 and independent exact-byte adoption under W8M W16.4i.2. Integration review iteration 2 closes with no open P1/P2. Earlier failed and consumed evidence remains preserved. |

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

## Provider integration successor — September 13

The later adopted runtime passed synthetic acceptance v2, then its three
separately authorized official-key fixture invocations failed: Turnstile
`verification_policy`, reCAPTCHA v2 `verification_timeout`, hCaptcha
`verification_failed`. All closed cleanly. These codes do not establish root
causes or failing modes; original reports and consumed claims stay intact.

The owner approved proceeding with diagnosis, narrow fixes, local verification,
and preparation of a bounded provider retest before renewed full qualification.
M13.4 owns a separate versioned fixture diagnostic report; existing driver v6
wire envelopes and portable contracts remain unchanged. Record closed probe,
network and phase reasons, per-mode POST counts and teardown on failure without
tokens, page content, raw traffic or exception prose. Check official provider
render/execute lifecycle documentation and reproduce defects locally before
changing policy. Provider re-execution requires its concrete separately scoped
approval. Full dependency publication, freeze, acceptance v2 and exact-byte
adoption follow passing provider integration; W8M contact remains separate.

Local implementation and review complete: `browserdriver.provider-fixture.v1`
and internal `browserdriver.verification-diagnostics.v1` report closed phases,
probe reasons, network/transport categories, bounded observations, final local
POST counts and teardown on failure. Explicit onload rendering keeps returned
widget IDs inside the local fixture. A missing initial response field now waits
without invoking uninitialized provider APIs; errors after rendering still stop.
No provider policy or v6 wire authority was expanded. Each invocation requires
one explicit provider/mode and an exclusive report/claim path. Review corrected
existing-report collisions before any contact, with a regression preserving both
prior results and consumed claims.

Full browser-free suite: 66 pass, 10 explicitly opt-in skips; npm audit: zero
vulnerabilities. Fresh affected synthetic browser smoke passes all three
providers/both modes and existing adversarial/privacy cases in 31.622 seconds
(32.740-second runner). The changed claim-collision helper's three focused
tests pass afterward; no browser rerun or complete qualification was needed for
that helper-only change. Bounded source review iteration 1 has no open P1/P2.
Evidence, local review and the isolated development candidate are under
`/home/peter/.local/state/w8m-browser/w16-provider-repair-20260913`.
This source correction is not yet a proven cause of any original provider
failure. Candidate/provider success, full publication/qualification and runtime
adoption remain separate gates. No new provider or W8M execution occurred.

## Authorized six-case retest results — September 13

The owner subsequently authorized the concrete proposal in
`/home/peter/.local/state/w8m-browser/w16-provider-repair-20260913`.
All six provider/mode pairs ran once, sequentially, against its immutable
561-file development candidate. One passed and five failed:

| Provider | before_approval | approved_submit |
| --- | --- | --- |
| Turnstile | `verification_policy`: script GET returned 3xx; provider redirect refused; zero local POSTs. | Same script-redirect rejection before activation; zero local POSTs. |
| reCAPTCHA v2 | `verification_timeout`: SDK/widget rendered, last state awaiting_interaction, no observed completion; zero local POSTs. | Passed client readiness and exactly one local POST; one execute and three separate provider POSTs observed. |
| hCaptcha | `verification_policy`: fetch from a child provider frame rejected after loading/rendering; zero local POSTs. | Same provider-frame rejection after one execute; zero local POSTs. |

All 76 observed process identities are independently absent, all fixture
listeners closed, and no forced cleanup occurred. Valid driver reports remain
bound through nonzero exits. The passing reCAPTCHA handoff also has late
response-fulfill/redirect errors recorded during teardown; do not describe its
network trace as error-free. The reports establish Turnstile's script-redirect
restriction and hCaptcha's frame gate as current blockers, but retain no
redirect target or precise rejected frame-ancestry condition. The reCAPTCHA
timeout does not establish what the owner saw or clicked; that clarification
is pending. hCaptcha's initial response_pending interval remained loading and
the previous API-exception symptom did not recur.

Scoped run review iteration 1 passes authority, report bindings, deadlines,
one-POST ceilings and teardown verification; provider integration is not closed.
Next local work concerns bounded reviewed redirect handling, precise frame
diagnosis (fragment normalization remains a hypothesis), and distinguishing late
shutdown errors from terminal verification failures. Preserve immutable policy
and version authority. No current pair may be repeated; further provider
execution needs its own concrete scope. Full qualification/adoption and W8M
operations remain pending. Candidate bytes and earlier evidence are unchanged.
Private `retest-summary.json`, `retest-review.md`, `retest-verification.log` and
the exclusive `runs/` reports preserve this batch without tokens or raw traffic.

### Owner clarification: before-approval reCAPTCHA

The owner confirmed seeing this case's window but not completing its checkbox.
The timeout is consistent with the unfinished human step; it does not establish
an adapter defect or verify readiness after a completed checkbox. The original
failure report, zero local POSTs and consumed invocation remain unchanged.
An append-only private `recaptcha-before-approval-owner-observation.json` binds
the statement to the original supervisor/driver reports and summary, whose
hashes remain unchanged. This resolves the pending visibility/interaction
question and grants no repeat. Turnstile redirect and hCaptcha frame findings,
late shutdown diagnostics and the unverified before-approval handoff remain
separate follow-up work. Documentation diff checks pass; no browser was run.


## Redirect/frame/shutdown local repair — September 13

M13.5 implements bounded same-origin GET/HEAD subresource redirects within the
existing provider v1 domain/path policy, with at most five checked hops, shared
request/body/deadline accounting, no POST replay and no document/cross-origin
redirect support. UWS 1.2 already requires enforcement at every redirect; no
portable policy authority, driver v6 envelope or application allowance changes.
Raw encoded traversal is rejected before URL normalization. Frame checks remove
only the fragment and revalidate every ancestor before fetch, at every hop and
before delivery. Closed rejection reasons distinguish ancestry conditions.
This reproduces and fixes a local fragment defect; the old hCaptcha reports did
not retain their exact ancestor, and the old Turnstile reports did not retain
the redirect target. Their real-provider resolution remains unproven.

Guarded shutdown freezes new admissions and submit/binding entry, cancels the
context's API fetches, closes the context and joins pending route, binding and
CDP callbacks before final evidence. A five-second cleanup overrun or closure
failure fails execution. Active failures survive cleanup; observations arriving
after shutdown have a separate phase and cannot replace the first active
failure. These are timing classifications, not proof of a provider error's
cause. Both v6 registration and verification-only execution use this closure.
Internal diagnostics and fixture reports advance to v2; v6 wire stays unchanged.

The disposable fixture now opens a clear local instruction/confirmation screen.
It explicitly asks the person to operate any checkbox or visible challenge.
Only a trusted click starts provider loading and the fixed 120-second phase;
a separate five-minute confirmation limit and the overall 450-second bound
remain finite. Cancel/window closure stop; late confirmation cannot extend its
deadline. The verification page displays the remaining time. Fixture progress
streams immediately instead of being deferred until Node test completion.
Runtime consent and approval deadlines are unchanged. The old frozen supervisor
is incompatible with v2 reports/timing and must not be reused or edited.

Review iteration 1 corrected a late queued confirmation edge and guarded
binding/Submit entry during shutdown, and made the synthetic fixture callback
one-shot. Iteration 2 whole-diff review has no open P1/P2. Final browser-free
suite: 72 pass, 11 explicit opt-in skips (83 total); npm audit: zero
vulnerabilities. Final affected fresh Chromium stage passes both the existing
v6 adversarial/state matrix (40.853 seconds) and the new all-six-mode fixture
matrix plus cancellation (21.584 seconds), 65.240 seconds overall. The new
matrix replaces provider transport with loopback responses and covers initial
confirmation/no early loading, permitted redirects, real nested provider-origin
frames with fragments, one local POST per mode, late in-flight requests and
joined context/browser/server teardown. No provider contact occurred. W8M
`make fast` and both repository diff checks pass.

Private source/evidence bindings and review are under
`/home/peter/.local/state/w8m-browser/w16-provider-redirect-frame-20260913`.
The old candidate's read-only integrity check and all six report bindings pass;
original adopted bytes and consumed claims remain unchanged. Local source work
is uncommitted/unpublished. Next prepare a new immutable candidate and explicit
v2 supervisor scope with adequate confirmation/verification/cleanup bounds,
then obtain fresh provider execution authority. Provider integration, full
publication/qualification/adoption and W8M authoring/probe remain separate gates.


### Fresh six-case provider retest authorized — September 13

The owner instructed “let's proceed with a fresh six-case provider retest”.
This explicitly authorizes the new three-provider/two-mode batch within the
preceding local-form, no-account and human-verification scope. Browserdriver
M13.6/W16.4i bind that instruction to a new immutable 565-file candidate and
v2 scope under
`/home/peter/.local/state/w8m-browser/w16-provider-retest-v2-20260913`.
The copied dist exactly reproduces a fresh compilation of the reviewed M13.5
source; no dependencies were installed or runtime bytes replaced. Separate
supervisor report v3 and fixture/diagnostic v2 validation preserve failures,
consumed claims and independent process/listener teardown. Supervisor review
and offline checks precede the fresh authorization record and first launch.
Five-minute confirmation waits precede fixed 120-second verification phases;
the batch has a finite one-hour authority, and each row needs 540 seconds
remaining. These are fixture bounds, not changes to W8M operation packets.
No old invocation is reused, no W8M/real-account operation is authorized, and
publication/complete qualification/adoption remain separate gates.


## Fresh v2 six-case retest closeout — September 13

The owner's fresh batch authorization bound scope v2 and a separate immutable
565-file candidate. Supervisor review iteration 2 and its offline tests passed;
all six cases then ran exactly once in the specified order. Every case received
the owner's trusted initial confirmation before provider loading.

| Provider | before_approval | approved_submit |
| --- | --- | --- |
| Turnstile | `verification_unsupported` / `response_type` during initialization; zero local POSTs. | Same failure before execute; zero local POSTs. |
| reCAPTCHA v2 | Pass: ready, one local POST. | `verification_failed` after one execute; one error recorded, zero local POSTs. |
| hCaptcha | Pass: ready, one local POST. | Pass: ready, one local POST after one execute. |

Turnstile's checked script redirect now reaches a 2xx script and rendered widget;
its next blocker is the response-type check. The exact initial JavaScript type
is not retained and must not be assumed. Both hCaptcha frame/hand-off paths now
pass for the official-key fixture. reCAPTCHA before-approval now completes its
human/readiness path in this new invocation; the old uncompleted-checkbox
failure remains consumed. The new invisible reCAPTCHA error has no recorded
active policy/transport refusal, only five provider GETs and no provider POST.
The fixture's shared error count cannot distinguish an execute exception from
a provider error callback, so neither provider rejection nor a timing race is
established. Its earlier invisible pass remains distinct historical evidence.

All six reports show joined guard shutdown; all 78 observed PID/start-time
identities are independently absent and all listeners closed without force.
Exactly three discarded local POSTs occurred. One Turnstile pending request was
classified in shutdown; all first active network failures are null. Two passing
before-approval cases have a post-release navigation evaluation_failed probe
observation, the already supported navigation race rather than provider failure.
Last-observed callback counters are snapshots, not complete histories.

Scoped execution review iteration 1 passes authority, one-shot semantics,
privacy, report binding and teardown with no open P1/P2. The 24 exclusive claim
and report files, frozen candidate, prior batches, twenty qualified source
inventories and eight adopted runtime hashes remain intact. All six invocation
permissions are consumed. Evidence and review are under
`/home/peter/.local/state/w8m-browser/w16-provider-retest-v2-20260913`;
`retest-summary.json` SHA-256 is
`ca2a02c0fce78c50bb97cfbe1fa42c373a7b42165975b57ba8855e2705932910`.
Both repository diff checks pass; no runtime implementation changed during the
batch and no full qualification/adoption or W8M operation occurred.

Next local diagnosis concerns Turnstile's initial response semantics and precise
reCAPTCHA execute/error-callback classification and activation readiness.
Keep tokens private; reproduce any fix offline and in the affected synthetic
smoke before a newly scoped provider invocation. M13 provider integration stays
incomplete; do not publish/qualify/adopt this candidate as fully accepted.


### M13.7 initial-response repair and diagnostic isolation — September 13

The owner approved the planned implementation. Browserdriver M13.7 owns the
Turnstile pending-response correction, closed response-kind and fixture lifecycle
diagnostics v3, focused offline tests, one affected synthetic stage and bounded
review. W16.4i coordinates preparation of one immutable reCAPTCHA
approved_submit diagnostic proposal, followed by evidence-backed correction and
a separately authorized final six-case validation. Provider execution is not
authorized by this implementation request. Existing confirmation/countdown,
network budgets, one-POST authority and all consumed history stay intact.
Implementation, verification and review are in progress; integration, publication,
qualification/adoption and W8M operations remain incomplete.


### M13.7 local closure and single-case diagnostic preparation — September 13

Turnstile's documented initial undefined response now remains pending only for
the bound empty widget before first readiness. Losing/replacing readiness still
invalidates approval. Internal diagnostics v3 add closed response kinds; fixture
report v3 adds bounded lifecycle ordering and a separately preserved first error
for render/handle/trigger/execute/promise/provider-callback/completion failures.
The reducer copies each untrusted property and array length once before checking
closed values in the page. No token, widget handle, callback value or exception
prose is exported. Driver v6/UWS, provider authority and deadlines stay unchanged.

Final browser-free checks: 79 tests pass, 11 explicit opt-in skips; audit reports
zero vulnerabilities. Both affected synthetic Chromium matrices pass (50.534
seconds); after the snapshot privacy review fix, the changed six-case fixture
matrix plus cancellation passes again (19.544 seconds). W8M make fast passes.
Bounded local review iteration 2 and single-case supervisor review iteration 1
have no open P1/P2. Fresh isolated compilation reproduces all copied runtime
outputs. Supervisor offline cases cover success, failure, missing/invalid crash
evidence, cancellation, POST ceiling, version/canary/bounds rejection, absent
authority, wrong mode, consumed claims and executable tampering.

The new private kit is
`/home/peter/.local/state/w8m-browser/w16-provider-initial-state-20260913`;
`provider-diagnostic-proposal.md` describes exactly one reCAPTCHA approved_submit
invocation, using a local form, no real accounts and human verification. Scope
v3 and supervisor result v4 bind fixture/diagnostics v3. The candidate and
preflight manifests bind the exact frozen bytes and review/test evidence. No
authorization file or provider claim exists; all historical invocations remain
consumed. Preparation is complete, execution awaits separate owner authority.

The historical Turnstile return type and original reCAPTCHA error source remain
unproven. A diagnostic failure needs evidence-backed local correction; a pass
does not explain the prior failure. Final fresh six-case validation, explicit
publication, renewed acceptance-v2 qualification/adoption and English W8M
authoring/probe remain downstream. No provider/W8M contact, real account, commit,
push or adoption occurred. The original operating kit and inherited W17 edits
are unchanged; W16.4e stays failed/consumed and W16.5 remains incomplete.


### M13.8 single-case reCAPTCHA diagnostic authorized — September 13

The owner explicitly authorized the prepared Submit-triggered reCAPTCHA case,
using a local form, no real accounts and human-operated visible verification.
Fresh launch preflight verifies the 566-entry frozen M13.7 candidate, v3 scope,
all preparation evidence and preserved operating kit/consumed reports.
Candidate SHA-256: `43f14b651a2094fa66c815aa3e99991d260a608bbbc9fbdf43106dfb22ce05f3`.
Scope SHA-256: `b0345b512cc96ef54a68277c787411f19bfe7c4efa880ebb4b83cc974bd2d687`.
A new exclusive v3 authorization at 2026-09-13T23:44:38.872585+00:00 grants only
recaptcha_v2 / approved_submit once, with a 20-minute expiry. The supervisor
consumes the invocation before launch. Record is in
`/home/peter/.local/state/w8m-browser/w16-provider-initial-state-20260913`.
M13.8/W16.4i own execution, bound failure/success evidence and independent
process/listener teardown. No old attempt, other provider/mode, real account,
publication, full qualification/adoption or W8M operation is authorized.


### M13.8 single-case reCAPTCHA diagnostic closeout — September 13

The separately authorized recaptcha_v2 / approved_submit invocation ran once
and passed against the frozen M13.7 candidate. The owner confirmed window
visibility; its trusted Ready click preceded provider loading. The fixture
executed once, the guard established readiness and exactly one discarded local
POST reached the local form endpoint. No real account, private input, W8M
request or backend assessment occurred. This one authorization is consumed.

There were 14 provider requests, three provider POSTs and 3,627,740 response
bytes. The last-observed lifecycle records onload/render/trigger/execute return,
zero errors and no first error. Its zero completion counter reflects the
pre-navigation snapshot, not complete callback history. One provider 4xx response
and one dropped unapproved read were recorded without a terminal fixture or
active policy/transport failure. Their cause is not retained; do not infer that
they explain the earlier failed invocation or establish backend acceptance.

The valid fixture v3 report is hash-bound through supervisor v4 and both
exclusive claims. All 13 observed PID/start-time identities are independently
absent; the supervisor reports its one local listener closed and no forced
cleanup. Guard context/request/callback shutdown and browser/server teardown
pass. All 653 preserved files, twenty qualified source inventories and eight
runtime hashes in all three retained passes remain unchanged, including the
inherited W17 edit. Scoped execution review iteration 1 has no open P1/P2.

Evidence is under
`/home/peter/.local/state/w8m-browser/w16-provider-initial-state-20260913`.
Summary SHA-256: `d5f2f52cc9bc7f7d5b8f1446e2fa42727daffd1e86fba275b0f805500ea8a4b4`.
Closeout SHA-256: `a99e7f37d47abd2ceeaf4c8863726788398c5c1ec42ba10f65535f4e1f5d31d1`.

This pass leaves the original reCAPTCHA failure unexplained and does not yet
verify the Turnstile correction against provider services. No speculative timing
change is indicated. The next planned gate is a fresh, separately authorized
six-case validation against the reviewed candidate, then explicit publication,
renewed acceptance-v2 qualification/adoption and separately scoped English
authoring/probe. No additional invocation is authorized by the consumed permit
or its informational batch flag. M13 remains active; W16.4e remains failed and
consumed, and W16.5 remains incomplete. No commit, push or adoption occurred.


### M13.9 final six-case validation preparation — September 13

The owner requests preparation for separate authorization. M13.9/W16.4i
prepare a new ordered six-case scope against the same frozen 566-entry M13.7
candidate that passed the single reCAPTCHA diagnostic. No runtime rebuild,
provider launch or authority reuse is included. Supervisor admission/order,
report bindings, offline checks, preservation and bounded review precede a
concrete disabled proposal. M13.8 and all older invocation permits stay consumed.
Preparation and review are in progress; full qualification/adoption and W8M
operations remain separate downstream gates.


### M13.9 six-case preparation complete — September 13

The requested new six-case validation is prepared, not authorized. Its scope v4
selects Turnstile, reCAPTCHA v2 and hCaptcha in that order, each before_approval
then approved_submit, at most once per pair. It reuses the exact existing
566-entry frozen M13.7 candidate without rebuilding or replacing bytes. The
separate M13.8 reCAPTCHA pass and every older invocation remain consumed.

Candidate manifest SHA-256: `43f14b651a2094fa66c815aa3e99991d260a608bbbc9fbdf43106dfb22ce05f3`.
Scope SHA-256: `84db549f93f026f35bcea5f29953f2a2fa1f26c8539c4de04acce84fcf6951f5`.
Preflight SHA-256: `13d9619e7002df31a7287043bbf31e44607f0b2964890f7eca803d72fbbafe80`.
Proposal: `/home/peter/.local/state/w8m-browser/w16-provider-final-validation-20260913/provider-validation-proposal.md`.

Scope/authorization v4 explicitly bind the batch and preserved diagnostic
evidence; fixture/diagnostics v3, supervisor report v4 and driver v6 remain
unchanged. Each next row requires every prior bound final report and both claims
from the same scope/candidate/authorization, its exact in-batch report path, a
valid executor result and clean teardown. Exclusive claims reject concurrent
replays. Ordinary verification failure may advance to the next independent row,
but any failed row prevents acceptance. Cancellation, confirmation timeout,
missing/invalid evidence, unexpected executor result, ceiling breach and forced
or incomplete cleanup stop the batch. No implicit authority renewal or retry.

Offline supervisor tests pass: all six once in order, skipped/replayed rows,
missing/old/mismatched/short authority, valid nonzero failure evidence, absent/
invalid reports, POST ceiling, cancellation, confirmation timeout, actual harmless
child forced-cleanup, mixed authorization, swapped prior claims/report paths or
hashes, executable/scope/preservation tampering. No browser or provider was used.
Bounded preparation review iteration 1 has no open P1/P2; read-only candidate
preflight and preservation checks pass. The current operating kit's twenty
source inventories and eight runtime hashes across three retained passes, the
consumed diagnostic files and inherited W17 edit all remain unchanged. Prior
runtime tests remain bound evidence; no unchanged browser stage or full
qualification was repeated during this helper/documentation preparation.

There is no authorization file or new run claim. The owner will separately
authorize the concrete six-case scope; actual human Ready clicks and any visible
verification remain required. Each row keeps five-minute confirmation, then a
fixed 120-second phase, 256 provider requests, 32 MiB responses and at most one
discarded local POST (six total). No real accounts, W8M, backend assessments,
provider settings, publication or adoption are included. Final provider
integration requires all six fresh rows to pass; the historical reCAPTCHA cause
remains unexplained and its single pass cannot replace the new row. Full
publication/qualification/adoption and English authoring/probe remain downstream.


### M13.10 fresh six-case validation authorized — September 13

The owner explicitly authorizes all six prepared provider/mode cases once each,
using local forms, no real accounts and human-operated visible verification.
Fresh launch preflight verifies the exact frozen candidate, all scope/preparation
bindings, 1,255 preserved files, twenty qualified source inventories and eight
runtime hashes across three retained passes. The original operating kit and
all prior consumed attempts remain unchanged.

Candidate SHA-256: `43f14b651a2094fa66c815aa3e99991d260a608bbbc9fbdf43106dfb22ce05f3`.
Scope SHA-256: `84db549f93f026f35bcea5f29953f2a2fa1f26c8539c4de04acce84fcf6951f5`.
The exclusive v4 authorization is recorded at 2026-09-14T00:03:48.398809+00:00,
with a one-hour expiry. Each row needs 540 seconds remaining and consumes its
exclusive claim before launch. M13.10/W16.4i track the ordered execution, closed
reports and independent process/listener teardown. Private kit:
`/home/peter/.local/state/w8m-browser/w16-provider-final-validation-20260913`.
No retry, account operation, W8M contact, publication, full qualification or
adoption is authorized. Any failed row prevents final validation acceptance.


### M13.10 validation stopped at initial confirmation — September 13

The first case, Turnstile before_approval, started once and stopped at the
five-minute local Ready confirmation limit. Its valid v3 report records
`provider_fixture_confirmation_timeout`, confirmedAt=null and no verification
deadline. No SDK loaded or rendered: zero provider requests, zero provider POSTs,
zero response bytes and zero local POSTs. The sole application request loaded
the local Ready page. This is not evidence of a Turnstile provider/probe failure.

Confirmation timeout is an explicit whole-batch stop condition. Supervisor v4
records batch_may_continue=false. Case 1 and its two claims are consumed; the
other five cases have no claims and were never started. They must not be called
consumed attempts. The stopped scope has zero executable remaining invocations
despite its later original authorization expiry. No retry or subsequent launch
was attempted, and no candidate or scope bytes changed.

The timeout report remains hash-bound on nonzero executor exit through the
matching candidate/scope/authorization and both exclusive claims. All twelve
observed PID/start-time identities are independently absent. The supervisor's
one local listener closed without forced cleanup; guard context/request/callback
joining and fixture browser/server teardown all pass. All preparation/candidate
bindings, 1,255 preserved files, twenty qualified source inventories and eight
runtime hashes in all three retained passes match. The inherited W17 edit is
unchanged. Scoped execution review iteration 1 has no open P1/P2 findings.

Private evidence: `w16-provider-final-validation-20260913/validation-review.md`.
Summary SHA-256: `e528276793b416e3dd99b9499246594806694177549f7fc605a512aaeec9a4b0`.
Closeout SHA-256: `67297f1e1e6cc5b61efa4c9694029bbbd37860294d7071abbe217a3d9852ed9a`.

Six-case validation is incomplete. The reason the Ready click was not received
is unknown; current-window visibility was queried but has not been confirmed.
Resolve that interaction issue before preparing a fresh scope. The earlier
M13.8 reCAPTCHA pass and M13.6 provider failures remain distinct consumed
evidence. No real account, W8M request, publication, full qualification/adoption,
commit or push occurred. W16 stays active; W16.4e stays failed/consumed and
W16.5 remains incomplete.


### Owner reports invisible Turnstile window; local visibility check prepared — September 13

The owner answered the pending M13.10 visibility question: “No—I cannot see the
window.” This observation is appended in the private batch owner-observation.json
and bound to the original scope and both reports. It explains why the owner
could not make the initial Ready click; the desktop presentation cause remains
unproven. The original timeout, claims, summary, review and closeout are unchanged.
One invocation remains consumed, five remain unstarted, and the stopped scope
permits no executable continuation. Verification never began.

Read-only checks find the current local GNOME Wayland session active and unlocked,
Xwayland at DISPLAY=:0, one 3840x2160 monitor and two desktops; no Xvfb process was
observed. The exact fixture source uses headed Chromium and page.bringToFront().
These checks do not reconstruct the vanished window's position, desktop or focus.
The prior reCAPTCHA window's confirmed visibility cannot prove this window was
visible. No new browser, fixture, provider request or local POST was started.

A concrete one-window local visibility diagnostic is prepared at
`/home/peter/.local/state/w8m-browser/w16-provider-visibility-20260913/visibility-proposal.md`.
It reuses the unchanged W8M helper and exact frozen candidate runtime, with an
in-memory page, blocked page network, an actual owner confirmation button,
numeric bounds and owned-process teardown evidence. It has a ten-minute wait,
660-second outer limit and ten-second cleanup allowance; it is not a provider
retest or a runtime qualification. The owner observation is not new browser
authority. Separate permission is required because the previous batch stopped
and W8M AGENTS.md excludes browser execution from documentation/diagnostic context.

Browser-free candidate preflight, helper syntax and byte checks, preserved-evidence
checks and scoped preparation review pass with no open P1/P2 in this preparation.
The desktop visibility blocker remains unresolved pending an authorized local
check and actual owner confirmation. Existing W17 edits and all consumed
provider/registration evidence remain intact. No source/runtime change, full
qualification/adoption, commit or push occurred.


### Authorized local visibility check passed and window located — September 13

The owner authorized the prepared local check and requested locating its window.
Exactly one unchanged helper invocation ran using the frozen candidate runtime
and reviewed reduced DISPLAY=:0 environment. The trusted owner confirmation
button was clicked, and both helper and supervisor passed in 22.758 seconds.
The helper recorded its own normal window bounds at left 76, top 42, width 1288,
height 805, within the current single 3840x2160 display. The window closed after
confirmation before the separate X11 inspection began; no X11 workspace/focus
claim is made, and no other desktop window was inspected. No second launch,
provider fixture, local form server or registration operation occurred.

The in-memory diagnostic page has no external resources and blocks page network;
it recorded zero blocked page requests. All thirteen recorded PID/start-time
identities are independently absent. Browser disconnection and process teardown
pass without forced cleanup, with zero observed/remaining listeners. Authority,
exclusive claim, helper report and supervisor bindings verify. All 37 preserved
files, including the inherited W17 edit and the stopped provider batch, match.
Scoped execution review iteration 1 has no open P1/P2 in this diagnostic.

Private report: `w16-provider-visibility-20260913/visibility-report.json`.
Report SHA-256: `b5453551dd6eff7383199515d7d2316c36447e2458d26f9c1445286c6f2164ab`.
Closeout SHA-256: `7bbd4553e954eed86fc770479486c569840f5dd410cab335507eb594e1e4f8d8`.
The local visibility authority is consumed. This confirms owner access to this
particular diagnostic window; the earlier Turnstile invisibility cause remains
unproven, and each future fixture still requires its actual Ready click. M13.10
remains stopped with one consumed invocation and five unstarted, with no further
provider authority. Provider validation, complete qualification/adoption and W8M
English authoring/probe remain pending. No source/runtime modification, provider
retry, account operation, commit or push occurred; W16.5 stays incomplete.


### M13.11 fixture-window diagnosis implemented; local reproduction pending — September 13

The owner requested tackling the still-unexplained Turnstile invisibility.
Read-only comparison establishes an evidence gap: the failed invocation retained
Ready-page/confirmation state but no window bounds, minimized state or focus.
It cannot be located retroactively. The later successful helper was not an exact
comparison: it enabled chromiumSandbox, used setContent and omitted the fixture's
host-mapping/proxy arguments. The pinned Playwright fixture default leaves the
sandbox disabled; this is a distinct launch-policy issue to align before further
provider execution, not an established invisibility cause. Both callers request
page.bringToFront(), which activates a tab and does not attest desktop visibility.

Browserdriver now provides a separate local-only fixture-presentation v1 diagnostic
and v1 exclusive claim. It shares the unchanged fixture launch-option factory and
trusted Ready waiter, with a local diagnostic notice. It can serve only GET /ready,
blocks other page traffic/WebSockets, and has no provider-loading or application-
submission path. It retains closed bounds/window/page/focus state before/after
foreground and while waiting; at most 32 changed samples preserve the first two.
Actual owner confirmation remains required. No automated window move, resize,
workspace change, repeated focus, click, reload or retry is added. Historical
provider reports remain v3 and the driver wire remains v6; production src bytes
match the earlier candidate. This diagnostic deliberately preserves the old
fixture's local-only launch baseline; it cannot qualify a runtime.

Typecheck passes. The initial focused offline run passed 15 tests with one
unselected browser case; after the final diagnostic-only adjustment, its six
focused tests pass with the browser case skipped. Privacy/getter canaries,
bounded history, request admission, confirmation/cancellation, setup teardown
and selector/claim rejection pass. A read-only 576-entry candidate freezes the
exact tested source/dist overlays, and its launch options match the original
compiled fixture argument. Existing candidate/runtime and 50 recent evidence
files, including the inherited W17 edit, are verified unchanged. Scoped local
preparation review iteration 1 has no open P1/P2; manual browser validation is
still pending and M13.11 must not be closed as verified in a real browser.

Private proposal:
`/home/peter/.local/state/w8m-browser/w16-fixture-window-diagnosis-20260913/presentation-proposal.md`.
Candidate SHA-256: `9285d5a5095d42cf422c12cee742c914300c2e1d1413c6b6d27548b56877b47d`.
The proposal covers one instrumented local Ready window, a five-minute
confirmation bounded by 330 seconds overall, 360-second outer supervision and
ten-second cleanup. It streams reduced location evidence while the window exists.
Separate browser authority is required by W8M AGENTS.md; no new authority,
claim, browser/provider invocation, qualification, adoption, commit or push was
created. M13.10 remains stopped: one consumed invocation and five unstarted.
The prior visibility-check permission is also consumed. W16 remains active,
W16.4e failed/consumed and W16.5 incomplete.


### M13.11 one authorized Ready-page diagnostic confirmed — September 13

The owner explicitly authorized the prepared instrumented local diagnostic once.
Fresh preflight verifies the exact 576-entry candidate, source/dist and runtime
bindings, and 50 preserved files. The one invocation completed in 29.252 seconds
with an actual trusted Ready click, one local GET, zero blocked page requests,
no provider execution and no application submission. All twelve recorded
PID/start-time identities are independently absent. The context/browser/server
and one listener closed without forced cleanup. Authority, both exclusive claims
and report/supervisor bindings verify. The one-run permission is consumed.

Four samples (before foreground, after foreground, waiting, decision) show normal
bounds at (76,42), size 1288x805, page visibility visible and page focus true.
No changed waiting-state samples or omissions occurred. Human confirmation proves
this window was usable; page focus alone does not prove compositor focus. The
window closed before separate X11 inspection, which exited without inspecting
other windows. No automated move, resize, workspace switch, repeated foreground
request or click was used. The historical invisibility did not reproduce; neither
its cause nor the fixture's sandbox default as a cause has been established.

A new P2 diagnostic finding, presentation_coordinate_spaces, remains open:
fullyWithinAvailableScreen compares CDP window bounds with page screen.avail*
values from Playwright's default 1280x720 emulated viewport/screen. Read-only
xrandr shows one 3840x2160 physical display. Its false value must not be treated
as proof of physical off-screen placement. The original report is immutable;
separate review records this interpretation. Correct/remove that comparison or
use compatible trusted desktop geometry, with focused coverage, before using it
for an operational decision. This defect does not invalidate the actual owner
click or verified teardown. Sandbox alignment remains a distinct follow-up before
future provider execution. M13.11 stays open for the diagnostic correction.

Scoped execution review iteration 1 has no P1/P2 in authority, one-invocation
semantics, reduced evidence or teardown; the source finding above remains open.
Private review: `w16-fixture-window-diagnosis-20260913/execution-review.md`.
Report SHA-256: `5784918b4adf739fb91167b402a536451c8d0032777134fdd089a9ee920c6925`.
Closeout SHA-256: `589a95d916641afb7a8fac36b179f97c3454f28a2aeac327f20e64df5bd989b6`.
All frozen candidate and prior evidence bytes, including W17, are unchanged.
No source change, further browser/provider run, registration, publication,
qualification/adoption, commit or push occurred during this execution. The
M13.10 batch remains stopped (one consumed, five unstarted); W16 stays active,
W16.4e remains failed/consumed and W16.5 incomplete.


### M13.12 sandbox and window-observation correction prepared — September 13

The owner approved the planned source correction and browser-free preparation.
The P2 presentation_coordinate_spaces finding is corrected locally: the shared
Ready-page observer no longer reads emulated screen geometry or infers desktop
containment. Provider fixtures now retain closed outer bounds/window state and
page visibility/focus before/after foreground, while awaiting Ready and at the
decision. Observations stop before SDK loading; history stays bounded to 32
samples. A failed window probe stops before provider traffic. Sampling cannot
extend confirmation or accept a queued decision after expiry/window closure.

Trusted driver, provider fixture and local diagnostic share chromiumSandbox:true;
launch rejection stops with no unsandboxed fallback. This is a launch-policy
correction, not an established cause of the historical invisibility. Reports
advance to provider-fixture v4 and fixture-presentation v2, with v2 exclusive
claims and an explicit requested report version checked before browser execution.
The Ready-window subreport is fixture-window v1. Driver wire v6 and UWS/provider
policies remain unchanged. chromiumSandbox in reports describes required launch
configuration, not independent proof of the kernel's sandbox state.

Typecheck and the full browser-free driver suite pass: 89 tests, zero failures,
12 opt-in browser skips. Closed report/privacy/version tests pass, including actual
mocked-launch failure reports. New offline admission tests reject candidate
tampering, absent/mismatched/expired authority, consumed paths and invalid selected
smokes with every launcher mocked. W8M make fast passes. No dependency bytes were
changed or installed. Bounded source/preparation review iteration 1 has no open
P1/P2 finding; real-browser verification of this change remains pending, so M13
and M13.12 are not closed. The historical diagnostic/report is unchanged.

A read-only 586-entry candidate freezes the reviewed source/dist and existing
modules/Node. Candidate SHA-256:
`a17814b98c5fba401a99ea2e65388575e7f88022f04d9ceec359625c1ff531f1`.
The one-case proposal is
`/home/peter/.local/state/w8m-browser/w16-window-sandbox-repair-20260913/smoke-proposal.md`.
It selects one synthetic Turnstile before_approval browser invocation: provider
fetches are substituted with loopback responses, local Ready is automated and
one local form POST is discarded. The test is bounded to 120 seconds and the
outer supervisor to 150 seconds plus ten-second owned-process cleanup. Separate
browser authorization is required by the agreed sequence and W8M AGENTS.md.
No authority/claim or browser/provider invocation was created during preparation.

After passing local smoke and independently verified teardown, finalize a fresh
version-aware six-case provider scope for separate authorization. Its conditional
draft is in the same private kit. M13.10 remains stopped with one consumed
invocation and five unstarted; neither prior visibility authorization can be
reused. Prior evidence and the inherited W17 edit are preserved. No qualification,
adoption, target contact, account operation, commit or push occurred. W16 stays
active, W16.4e failed/consumed and W16.5 incomplete. The original invisible window
has not been reproduced or explained.


### M13.12 one authorized synthetic smoke passed — September 13

The owner explicitly authorized the prepared one-case local smoke once, using
simulated provider responses, one local form submission and no real accounts.
Fresh preflight verified all 586 candidate entries, the bound tooling/runtime,
desktop launch prerequisites and 592 preserved evidence files. A new exact
expiring authorization and exclusive supervisor/driver claims were recorded;
this invocation is now consumed and grants no retry or provider-network run.

The frozen Turnstile before_approval synthetic case passed once in 4.268 seconds
(2.953 seconds inside the fixture). Its three provider-classified requests,
including one POST and 1,208 response bytes, were served by the loopback
substitution. Exactly one local application POST was received and discarded.
Initial pending state, checked redirect, readiness, canary exclusion and joined
late-request shutdown assertions pass. No actual provider SDK/service, W8M
page, private input or account operation was used.

The v4 report retains three closed Ready-only observations: before foreground,
after foreground and the decision. Each records a normal window at left 76,
top 42, width 1288 and height 805, with page visibility visible and page focus
true. It exports no emulated screen geometry or desktop-containment inference.
Sandbox-required launch succeeds without fallback. The synthetic Ready click
is automated, so this smoke does not attest that the owner saw the window or
independently establish the kernel sandbox state. Historical invisibility
remains unreproduced and unexplained.

Context/browser/server teardown and all four guard shutdown flags pass.
All fourteen recorded PID/start identities are independently absent. The bound
supervisor reports both owned listeners closed, zero remaining processes or
listeners and no forced cleanup. Report, claims, authorization, candidate and
scope hashes verify; bounded execution review iteration 1 has no open P1/P2.
M13.11's local diagnostic correction and M13.12's source/offline/affected-browser
verification gates are complete; M13 and W16 remain active for later acceptance.

Private execution evidence lives in
`/home/peter/.local/state/w8m-browser/w16-window-sandbox-repair-20260913`.
Report SHA-256:
`8033aebb5328bc3ccfdc64e52844376432f1c583e3edf4dd40025a1af3644c7d`.
Closeout SHA-256:
`5a5c1bd1a1df0153f24b57ee01ec103327fa807f0525f23b0ee5421dc9f6a1ae`.
The next gate is finalizing the fresh six-case provider scope and v4-aware
supervisor from the conditional draft, followed by separate owner authorization.
No such provider batch was authorized, claimed or executed here. The prior
M13.10 batch stays stopped with one consumed invocation and five unstarted.
The current operating kit and all prior evidence, including W17, remain intact.
No executing source change, qualification, adoption, commit or push occurred.
W16.4e remains failed/consumed and W16.5 incomplete.


### M13.13 fresh six-case v5 validation prepared — September 13

The owner requested finalizing a fresh six-case provider validation for separate
authorization. A new private kit binds the exact unchanged 586-entry M13.12
candidate and its passing one-case synthetic smoke, including independently
checked fourteen-process closure and the bound two-listener cleanup evidence.
All 136 source bindings and pinned runtime/module bytes still match; no rebuild,
installation or repeated browser qualification was needed.

The order is Turnstile before_approval/approved_submit, reCAPTCHA v2
before_approval/approved_submit, then hCaptcha before_approval/approved_submit.
Scope, authority and supervisor results advance explicitly to v5. The supervisor
requires fixture report v4 and driver claim v2 before execution, supports closed
fixture-window v1 Ready progress, and binds valid failure reports on nonzero
executor exits. Old report/claim/scope/authority versions and mismatched source,
runtime, smoke or predecessor evidence are rejected. No earlier authority can
admit this batch.

The owner must click the initial Ready control within five minutes before SDK
loading and the two-minute verification countdown. Actual provider challenges
remain human-operated. Keep the existing provider v1 network/frame policies,
256 requests/32 MiB per phase, one local application POST per case, at most six
across the ordered batch, and no retries. Operation/test/supervisor bounds remain
450/480/510 seconds, with one ten-second cleanup deadline. Authority lasts at
most one hour and every next case requires more than nine minutes remaining.

Ready observations contain closed window bounds/state and page visibility/focus,
never emulated-screen containment or provider/challenge content. The supervisor
reduces progress before display, caps output at 64 KiB, and records its own
PID/start identity for exact cancellation. Results retain owned process identities
and listener inodes; the next case rechecks closure rather than trusting only a
Boolean. A valid ordinary verification failure may permit the next distinct
pair after clean teardown. Budget breach, cancellation, invisible window, Ready
timeout, presentation failure, invalid/absent report, unexpected executor result,
expired authority or forced/incomplete cleanup stops the batch. Consumed cases
and unstarted cases remain distinct after any stop.

Browser-free supervisor verification passes: six ordered disposable fake
executions once each; nineteen failure scenarios; old-version, privacy/canary,
sandbox, coordinate-field, budget, request/POST ceiling, predecessor binding,
replay/skip, authority, executor and teardown rejection tests. A separate exact
supervisor SIGTERM test passes with owned-child cleanup, explicit absent-report
evidence and blocked continuation. Fake executors are disposable Python programs
and cannot launch Chromium. Bounded preparation review iteration 1 has no open
P1/P2; the budget-continuation, cleanup-bound and active-cancellation issues are
resolved in this new supervisor without changing any old evidence or runtime.

Private proposal:
`/home/peter/.local/state/w8m-browser/w16-provider-sandbox-validation-20260913/provider-retest-proposal.md`.
Candidate SHA-256:
`a17814b98c5fba401a99ea2e65388575e7f88022f04d9ceec359625c1ff531f1`.
Scope SHA-256:
`c3e8c5959fde3cfd45940a5636820c65b2b3f07504b7c9342d80c87b6bd8134e`.
Proposal SHA-256:
`333b36f5ecc930dc621677a9e34e43e50408a104562c54a714b78691630ae69b`.
Review SHA-256:
`923582dc7019a28d9b397186ae85033a530fb77cffaf99ebb46f3e10c657b9a5`.
The final read-only preflight verifies 1,251 predecessor evidence files and the
inherited W17 edit unchanged. New kit tooling, scope and proposal are frozen for
review; no authorization.json or runs directory exists there. M13.13 preparation
is complete; M13.14 owns the separately authorized six-case execution/closeout.

No browser/provider invocation, account operation, driver source/runtime change,
publication, qualification/adoption, commit or push occurred in this preparation.
M13.10 stays stopped with one consumed invocation and five unstarted. M13.12's
smoke permission stays consumed. Historical invisibility remains unexplained;
test-key results still cannot establish production acceptance. W16 remains active,
W16.4e failed/consumed and W16.5 incomplete.


### M13.14 authorized six-case provider validation passed — September 13

The owner explicitly authorized the fresh six-case v5 proposal. Fresh preflight
verified its exact candidate/tooling/smoke/preservation bindings and desktop
prerequisites before recording new authorization v5. All six cases then ran
once each in the reviewed order, with actual Ready clicks before SDK loading,
human-operated visible verification, no private registration inputs and no real
accounts. No retry, reload or extra invocation occurred.

| Provider | before_approval | approved_submit |
| --- | --- | --- |
| Turnstile | Pass, 8.262 seconds | Pass, 9.456 seconds |
| reCAPTCHA v2 | Pass, 12.473 seconds | Pass, 37.356 seconds |
| hCaptcha | Pass, 28.726 seconds | Pass, 27.969 seconds |

Each case reached readiness and released exactly one discarded local application
POST. The batch totals are 48 provider requests, ten provider POSTs and 11,154,868
provider response bytes, plus six separate local application POSTs. Every case
stayed within its own reviewed budgets and deadlines. All six initial Ready
windows retained bounded before/after/waiting/decision observations; the owner
also explicitly confirmed case 4 was visible. These reports export no emulated
screen comparison or challenge/token content. The earlier invisible window's
cause remains unexplained; its historical failure is unchanged.

The exact report/claim/candidate/scope/authority bindings, selected test totals,
exits, readiness and cleanup were verified before each next invocation. Complete
batch verification also independently rechecked all 93 recorded worker PID/start
identities, six supervisor identities and six listener inodes: all are absent or
closed, with no forced cleanup. All fixture context/browser/server and guard
shutdown flags pass. There are exactly 24 run files: six supervisor claims/results
and six driver claims/reports. Bounded execution review iteration 1 has no open
P1/P2 finding; M13.14 provider validation is complete.

Private evidence:
`/home/peter/.local/state/w8m-browser/w16-provider-sandbox-validation-20260913/batch-closeout.json`.
Closeout SHA-256:
`463603e4b51a02f11ad4da87792c5d5ed3bb9ed7ba7745a87e166449f51f9052`.
Authorization SHA-256:
`889427bfea58606fa3054c5ed9d3fecf86e2f77ed973b593ae3713a39dcbf8b6`.
All six invocation permissions are consumed, no cases remain unstarted, and the
batch grants no further browser/provider execution despite its historical expiry.
The final batch continuation flag is false; per-row continuation evidence never
creates a seventh invocation or authorizes replay.

All 586 frozen candidate entries, 136 executing source bindings, 1,251 prior
evidence files and the inherited W17 edit remain unchanged. The earlier M13.10
batch remains stopped with its one consumed invocation and five unstarted, and
the M13.12 synthetic smoke stays consumed. No W8M contact, real account operation,
production change, executing source modification, publication, qualification,
adoption, commit or push occurred during this provider execution.

This validates the three official-key provider integrations in both modes on
local forms; it does not establish production bot acceptance. The next gates
remain explicit dependency publication, fresh complete acceptance-v2 qualification
and exact-byte adoption, then separately authorized English iCoT authoring and
verification-only probing before fresh identity/readiness and one separately
authorized registration. M13 and W16 remain active; W16.4i still awaits those
remaining gates, W16.4e stays failed/consumed and W16.5 incomplete.


## M13.15 reviewed publication candidate — September 14

W8M W16.4i.2 authorizes publication to the existing origin and renewed synthetic
acceptance-v2 qualification/adoption. All 41 runtime/test/launcher/package source
files match the frozen six-case passing provider candidate. Fresh default tests
pass: 89 offline cases, zero failures, twelve explicitly opt-in skips. No browser
or provider fixture was started by that check. Publication review iteration 1
reconciles the existing bounded source reviews, exact candidate comparison and
new test result; no open P1/P2 remains before dependency publication. The release
retains protocol v6, fixed reviewed network budgets, human challenge handling,
required Chromium sandbox and one-application-POST semantics. Existing failed
and consumed invocations remain literal history.

Publication precedes OpenUdon pinning and W8M source freeze. Complete qualification
and exact-byte adoption remain pending in W16.4i.2; this source commit itself
creates no operating authority. No new provider run or real account is included.


M13.15 integration review iteration 2 starts against the published aefdd87
source and W8M W16.4i.2 r4 freeze. All 39 fresh native stages pass, including
three loopback and registration handoff repeats. The three W8M journeys,
independent evidence verification and exact-byte adoption remain pending.
Review preserves protocol/authority boundaries and every consumed invocation.

## M13.15 qualified adoption closure — September 14

The renewed W8M W16.4i.2 r4 gate passes all 39 fresh native stages and three
fresh consumer journeys (nine workflow receipts). Independent aggregate and
retained-binary report verification pass; twenty frozen source inventories and
eight identical runtime hashes across all three retained passes match. Exact
pass-one bytes are adopted without rebuilding. Prior kits and consumed attempts
remain preserved. This is synthetic qualification, not production acceptance.

Private evidence: `/home/peter/.local/state/w8m-browser/w16-renewed-qualification-20260914-r4`.
Acceptance SHA-256: `d461337cb623f53614aa361971f96b2b510d61a8d28a97f18be013c722288d32`.
Adoption SHA-256: `6de112f1d14461fc80464c5d534c31c2f53376730663b4028bacd7d6a5c3569a`.
No new provider fixture, real account operation or deployment occurred. Later
coordination-only commits leave the frozen executable-source pins unchanged.

Bounded integration review iteration 2 passes with no open P1/P2.
Owner acceptance and the full changed-source range were reviewed. Existing
evolution direction is retained; no new contract or product scope was added.
The selected executable source remains `aefdd875633bbf880ec5138feed5fb227da896a0`.
