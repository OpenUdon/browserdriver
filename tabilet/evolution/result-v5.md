# Typed runtime-context failure result

Browserdriver now reports runtime context absence and identity failures as
`invalid_context` through the existing closed v2/v3 result envelope. Profile
and wire validation still reports `invalid_response`; exact-origin violations
and duplicate target matches remain `origin_rejected` and
`ambiguous_locator`.
