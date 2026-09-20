# M05 Status

| Item | State | Notes |
| --- | --- | --- |
| Implement and verify browser 1.7 typed accessibility output replay | `[+]` | Driver v3 accepts the exact browser 1.7 discriminator, converts Unicode-trimmed accessibility text to string, safe integer, finite strict-JSON number, or lowercase Boolean, preserves presence without reading text, and returns only closed `invalid_response` on conversion failure. Browser 1.5/1.6 extraction and outer v2 behavior remain unchanged. |

## Verification

- Table tests cover accepted and rejected scalar lexical forms, safe-integer
  bounds, finite-number enforcement, Unicode trimming, composite rejection,
  v3-only browser 1.7 routing, presence compatibility, and failure
  non-disclosure.
- `npm test`, `npm audit --omit=dev`, and `git diff --check` pass without a
  browser installation or live target.
