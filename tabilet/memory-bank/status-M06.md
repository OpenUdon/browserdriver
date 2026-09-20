# M06 Status - Real-Scenario Replay Compatibility

| Item | State | Notes |
| --- | --- | --- |
| Close and verify scenario-discovered navigation/wait lifecycle gaps | `[+]` | The v3 runtime permits only the reviewed first main navigation to use the initial isolated `about:blank` page, settles ordinary authentication-click loads before proving success, and makes v2 accept browser 1.5's direct accessibility `wait_for` shape. Focused offline tests preserve exact origin/context enforcement and closed failures; the coordinated OpenUdon loopback and public presence suites exercise the real paths. |

## Verification

- Unit coverage proves initial-navigation confinement, post-click load
  settlement, direct v2 accessibility waits, and unchanged typed/context
  replay.
- `npm test`, `npm audit --omit=dev`, and `git diff --check` pass.
