# M08 Status - Typed Runtime Context Failures

| Item | State | Notes |
| --- | --- | --- |
| Add and propagate `invalid_context` | `[+]` | Protocol v2/v3 now distinguish runtime context absence, undeclared/extra targets, closure/detachment, and substitution from malformed protocol/profile shapes; origin and ambiguity failures remain separately typed. The authentication boundary rechecks late navigation-guard events before success proof, and accessibility-output wait failures normalize to `invalid_response` instead of leaking a generic driver error. |

## Verification

- Protocol tests lock the expanded closed vocabulary for v2/v3.
- Context tests cover missing, undeclared, substituted, closed, detached, and
  extra targets while retaining `invalid_response` for malformed definitions.
- `npm test`, `npm audit --omit=dev`, and `git diff --check` pass.
