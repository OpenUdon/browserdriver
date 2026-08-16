# Architecture

Udon starts one `udon.browser-driver.v2` or `udon.browser-driver.v3` NDJSON subprocess per workflow
execution. The driver owns one Playwright browser and a map of named,
execution-local contexts. Authentication creates or refreshes a context;
protected browser actions use that exact name. Udon owns approval and human
challenge brokering.

Optional reusable-session references are hashed into a private driver-owned
store lookup. Canonical roots may be reached through symlinked parents, but the
configured root itself and final state file cannot be symlinks; state files
must remain canonically contained, owner-only, and owned by the driver user.
Cookie and storage-state documents never cross the protocol.

The driver accepts only closed macros. V2 intercepts every top-level navigation
request before transmission to enforce exact origins (including redirect
intermediates), rejects ambiguous accessibility locators and CAPTCHA, extracts only
declared outputs, and returns closed progress/failure values. Secrets enter
only through inherited named environment variables or an MFA response line.
No browser or driver-controlled prose crosses back into durable state.
Human challenge reads self-expire, their cancelled line waiter cannot consume a
later protocol envelope, and top-level navigation attestations are capped and
discarded after each action. The origin guard intentionally does not cover
subresources or child frames and is not a network exfiltration boundary.

V3 is an additive session mode for authentication 1.1 followed by browser 1.5
or 1.6. A runtime context registry resolves declared frames among direct children
by exact origin/path/name and registers a popup only around its explicit
`opensContext` click. Missing, ambiguous, duplicate, changed, closed, automatic,
or extra contexts reject the request. The v3 navigation guard covers main,
popup, and child-frame redirects. Context graphs remain acyclic and depth-four;
all handles and session material remain inside the one driver process.
Cached targets are revalidated before each use and the full declared inventory
is resolved at authentication/action completion; a stale handle never remains
authority after origin, identity, parentage, attachment, or uniqueness changes.
