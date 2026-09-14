# Tech Stack

W16.4i.9 published the reviewed diagnostic repair and exact pins, but its
qualification launch stopped at the native offline driver_unit prerequisite.
Fresh source preparation omitted Browserdriver's installed node_modules;
validation stopped before driver tests or acceptance-v2 browser stages.
The invocation is consumed and no runtime was adopted. The previous kit stays
selected. Clean teardown and preservation verify. A separate corrected local
preparation builds and passes 94 driver tests with 13 browser skips; complete
qualification still needs new authority. W16.4i.10 now prepares the corrected
twenty-source/499-dependency-entry successor; positive and missing-prerequisite
preflights pass. W16.4i.11 awaits separate authority. See the latest owner status record.

M13.18 reuses the passing 94 offline tests and once-consumed two-context synthetic smoke as prerequisites. Complete acceptance v2 uses the existing Node/Playwright/Chromium toolchain and sandbox helper in a fresh kit; its publication and execution require separate authorization.

M13.17 uses the existing Node/Playwright pins. npm test includes browser-free fake-boundary driver tests; the actual driver/guard/reducer produce wire data that W8M checks through W8M_PROBE_WIRE_FIXTURE. BROWSERDRIVER_PROBE_LIVE_TEST=1 selects the separately authorized two-context loopback probe smoke. No provider SDK, account data or application POST is needed. Full qualification remains pending. M13.17a’s one authorized synthetic browser smoke now passes both ready and API-failure cases, frozen W8M wire checks and sixteen-process teardown without force; publication and qualification/adoption remain pending.

M13.16 repairs verification form-property shadowing using native getters,
containment and submitter-field insertion. Exact destination, method, target
and one-POST authority remain enforced. Ninety offline tests and the affected
all-provider/both-mode synthetic smoke pass; bounded source review iteration 2
closes. DOM-API shapes unsupported by Playwright still stop. Published Browserdriver fb207237a001 now passes
complete fresh qualification and exact-byte adoption under W16.4i.4. See [status-M13.md](status-M13.md).

M13.15 completes publication, fresh three-repeat integration qualification
and exact tested-byte adoption under W8M W16.4i.2. Browserdriver aefdd875633b
retains the six-case-tested provider repairs and required Chromium sandbox.
All 39 native stages and three W8M journeys pass; bounded integration review
iteration 2 closes. Earlier consumed fixture failures and the unexplained
historical window visibility remain preserved. See [status-M13.md](status-M13.md).

M12 keeps Node/Playwright pins unchanged. Optional v5 `deadline` metadata is
private runtime timing, absent from UWS profiles and reduced results. Native
v4/v5 loopback tests remain opt-in and need an existing headed display.

V5 uses the same pinned browser and TypeScript implementation. Its opt-in
loopback test is `BROWSERDRIVER_REGISTRATION_LIVE_TEST=1 node --test
dist/test/registration-inputs-live.test.js`; a usable headed display and the
already installed Chromium runtime are prerequisites. Qualification performs
no installation or source mutation.

- Node.js 24
- TypeScript 5.9.2 in strict mode
- Playwright 1.62.1, Chromium
- Node's built-in test runner

Default verification is offline and does not install or launch a browser:

```bash
npm ci --ignore-scripts
npm test
npm audit --omit=dev
git diff --check
```

The single TypeScript implementation serves protocols v2 through v5. V2 keeps
the UWS 1.7 main-page contract; v3 accepts UWS 1.8 authentication 1.1 followed
by browser 1.5/1.6 or UWS 1.9 browser 1.7, adds portable context qualification,
cached-target revalidation, and normative scalar conversion, and does not add
another browser implementation.

V4 consumes UWS browser-registration 1.0 without changing the UWS schema. Its
strict TypeScript boundary validates the closed profile/call shapes and runs a
fresh headed Playwright context with a registration-specific exact-origin and
one-POST guard. The opt-in synthetic live gate is:

```bash
npm run build
xvfb-run -a env BROWSERDRIVER_REGISTRATION_LIVE_TEST=1 \
  node --test dist/test/registration-live.test.js
```

The v2/v3 closed failure vocabulary includes `invalid_context` for absent,
undeclared, closed, detached, or substituted runtime contexts. Malformed
protocol/profile shapes remain `invalid_response`.

V4 adds only `registration_indeterminate`,
`registration_checkpoint_timeout`, and `registration_checkpoint_denied` to the
shared closed vocabulary. Its success response is the fixed
`{"status":"success"}` object.

Output extraction treats only `presence === true` as Boolean match mode. A
present-but-false flag is semantically identical to omission and therefore
preserves the output's declared type across browser 1.5, 1.6, and 1.7.

## Verification candidate (September 13)

The active coordinated verification work adds BRP and registration-call 1.2,
author-session/result v4, review v3, transaction v4, authoring-authority v2,
driver v6 and execution-report v4. Published older contracts remain unchanged.
The candidate covers one standard Turnstile, reCAPTCHA v2 or hCaptcha widget
bound to the reviewed submit form. Explicit dependency review grants finite
provider traffic; it grants no application mutation. Readiness remains client
evidence and actual challenges remain human-operated. The source candidate is
not yet a qualified or adopted runtime. Provider integration and production
acceptance have separate authorization gates.
