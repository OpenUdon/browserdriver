# M09 Status - Registration-Capable Driver Protocol V4

| Item | State | Notes |
| --- | --- | --- |
| M09.1 Baseline, v4 wire, and evolution start | `[x]` | Froze v2/v3 authentication/action behavior, added the closed `udon.browser-driver.v4` register envelope and fixed result/checkpoint vocabulary, indexed M09, and created evolution prompt v6 without changing UWS registration 1.0. Protocol build and compatibility tests pass. |
| M09.2 Fresh-context registration execution | `[x]` | Validates the closed registration profile/call semantics, exact origins and redirects, query-safe navigation, symbolic environment bindings, unique accessibility locators, one submit, and fixed controls. Registration uses one fresh context, closes it before emitting the fixed result, and creates no named session or browser-state export. Unit and full compatibility tests pass. |
| M09.3 Human checkpoints and post-submit uncertainty | `[x]` | Headed-browser checkpoints accept only Continue/Deny and reject verification-value or alternate-decision shapes. Submit approval is emitted immediately before the sole POST; denial/timeout remain closed pre-submit failures, while every post-approval failure becomes `registration_indeterminate` and the operation/source pair cannot be invoked again in-process. Driver-level tests prove ordering, denial, timeout, uncertainty, retry refusal, teardown, and non-disclosure. |
| M09.4 Loopback qualification, documentation, and review | `[x]` | Offline tests preserve v2/v3 and cover the complete v4 validation/checkpoint matrix. Headed loopback Chromium proved ordinary checkpoint and submit Continue, one approved POST, deny/timeout before mutation, post-submit indeterminate handling, in-process retry refusal, redirect rejection, credential/query/result non-disclosure, context/browser teardown, and no registration session. Build/test, audit, diff, secret scan, compatibility, and two bounded review iterations pass; review fixes moved locator resolution before approval, distinguished navigation-query checks from same-origin resources, closed inherited-property binding gaps, and corrected the installed launcher to the compiler's `dist/src` output before cross-package qualification. OpenUdon E11 subsequently passed its complete 18/18, 20-artifact cross-package qualification and the coordinated v6 result is committed at `a269e94`. Publication remains separately authorized. |

Dependencies: published UWS registration 1.0 remains unchanged. Browsertools M27
and A09 are published at `d26f2982db352619d7a7f6563add802b56e10824` and are
consumer-side qualification inputs, not Browserdriver imports.

M09 implementation is complete locally and unpushed at
`a97b1aed6ea69a30591815da8ca07ac9e7c87623`. OpenUdon E11 passed, and
evolution result v6 is committed locally at
`a269e94d3394ca9d6bd58a0102d7a70d90a00fda`. Neither commit grants
real-target, credential-value, account, deployment, or publication authority.
