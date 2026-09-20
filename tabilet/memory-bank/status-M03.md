# M03 Status

| Item | State | Notes |
| --- | --- | --- |
| Implement and verify trusted popup/frame replay through driver v3 | `[+]` | Additive `udon.browser-driver.v3` accepts UWS authentication 1.1 and internal action v2 only, while v2 remains accepted. The runtime resolves exact direct-child frames, binds one popup to an explicit `opensContext` click, executes context-qualified navigation/locators/waits/challenges/outputs/success paths, inventories missing/duplicate/extra contexts, and extends origin interception to popup/frame redirects. Live handles, credentials, MFA, cookies, and storage remain private. |

## Verification

- `npm test`, `npm audit --omit=dev`, and `git diff --check` pass.
- Offline tests cover v2 compatibility, discriminator mixing, graph cycles and
  depth, frame uniqueness, popup inventory, child-frame origin escape,
  context-qualified waits/outputs, and closed v3 responses.
- No browser was installed and no live service was contacted.
