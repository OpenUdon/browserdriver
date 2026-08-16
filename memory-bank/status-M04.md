# M04 Status

| Item | State | Notes |
| --- | --- | --- |
| Revalidate cached portable contexts and qualify the authored version pair | `[+]` | Every cached page/frame target is rechecked for presence, detachment, exact origin/path/name, direct parent, and renewed ambiguity before reuse; end-of-flow inventory resolves completely, and Udon's named gate replays the exact Browsertools authentication 1.1/browser 1.5 pair. |

## Acceptance

- Cached main pages and popups remain present, open, and on an allowed exact
  origin; a popup must still match its declaration.
- Cached frames remain attached, direct children of the declared current
  parent, and the sole exact origin/path/name match.
- Authentication and action completion resolve the complete declared context
  inventory; missing, duplicate, changed, detached, or extra contexts fail
  closed.
- Udon qualification drives Browsertools' exact oldest-sufficient profile pair
  through driver v3 without weakening driver v2 compatibility.

`npm ci --ignore-scripts`, all 28 offline tests, the production dependency
audit (zero vulnerabilities), TypeScript build, diff checks, and the OpenUdon
browser integration matrix pass.
