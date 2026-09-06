# M10 — Registration resource and redirect boundaries

| Item | State | Notes |
| --- | --- | --- |
| M10.1 Reproduce and repair registration network guards | `[x]` | Offline reproduction proves an aborted unapproved read-only resource incorrectly poisons registration. A stronger Chromium loopback then exposes transmission to a redirected unapproved origin. Preserve v2/v3, abort resources without contact, pause redirect responses before Location, reject repeated POST redirects, and retain closed failures and teardown. Full offline tests, the strengthened headed Chromium matrix, audit (zero vulnerabilities), and whitespace checks pass; no live operating kit has adopted these sources. |

The historical public-target failure's exact rejected URL was not retained.
This local reproduction establishes defects, not that historical URL's identity.
Review iteration 1 found a P1 redirect-transmission gap in the strengthened test;
the response interception repair is undergoing verification. New qualification
must bind the repaired source before operational adoption.

Review iteration 2 closes the redirect gap: multi-hop responses are paused before
follow, 307/308 cannot repeat POST, unsupported frame navigation is refused
before transmission, and closed origin failures retain pre-/post-approval
classification. All 47 offline cases and the real Chromium loopback pass; no
remaining P1/P2 finding in this repair. Read-only unapproved resources are
aborted, never fetched. Current v2/v3 behavior and package versions are unchanged.
