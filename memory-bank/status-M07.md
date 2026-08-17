# M07 Status - Presence Flag Runtime Alignment

| Item | State | Notes |
| --- | --- | --- |
| Align false presence flags with declared output semantics | `[+]` | Browserdriver now enters Boolean match mode only for literal `presence: true`; `presence: false` follows the declared text/scalar path across browser 1.5, 1.6, and 1.7. The published UWS browser 1.7 document stays byte-unchanged, and focused coverage proves the reviewed string-output case reads and returns trimmed text. |

## Verification

- Unit coverage proves true presence still avoids text reads and false
  presence preserves the declared type for browser 1.5/1.6/1.7.
- `npm test`, `npm audit --omit=dev`, and `git diff --check` pass.
