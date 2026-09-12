# Milestones

M11 is active: implement the approved generic registration 1.1 execution plan
through additive protocol v5. Udon owns input activation and the private form;
Browserdriver independently validates accepted private snapshots, applies
typed controls and binds the one submit approval to the exact accepted state.
See [status-M11.md](status-M11.md). Existing v2-v4 contracts remain unchanged.

| Milestone | Status file | Scope |
| --- | --- | --- |
| M01 | `status-M01.md` | Persistent Playwright authentication and named-session driver |
| M02 | `status-M02.md` | Bound and diagnose persistent browser authentication runtime state |
| M03 | `status-M03.md` | Replay UWS popup/frame contexts through additive driver protocol v3 |
| M04 | `status-M04.md` | Revalidate cached contexts and qualify authored replay pairs |
| M05 | `status-M05.md` | Replay UWS browser 1.7 typed accessibility outputs through driver v3 |
| M06 | `status-M06.md` | Close real-scenario navigation and browser 1.5 wait compatibility gaps |
| M07 | `status-M07.md` | Align false presence flags with declared output extraction semantics |
| M08 | `status-M08.md` | Distinguish runtime context failures from malformed response/profile input |
| M09 | `status-M09.md` | Add closed protocol v4 trusted browser registration execution |

M01 establishes the isolated v2 NDJSON process, closed authentication and
browser macro execution, all planned MFA variants, exact-origin and ambiguity
enforcement, private environment credential resolution, ephemeral named
sessions, closed failures, and offline protocol/security tests.

M02 bounds human challenge waits and per-action navigation state, accepts
canonical session roots reached through symlinked parents while retaining
containment, enforces private state-file metadata, emits only fixed safe store
diagnostics, scopes number matching through trusted driver configuration, and
documents the navigation-only origin boundary.

M03 retains v2 and adds v3 authentication 1.1/browser 1.6 replay,
portable context resolution, explicit popup binding, context-qualified steps
and outputs, child-context navigation enforcement, and exact inventory failure.

M04 revalidates every cached context immediately before reuse and qualifies
Browsertools' exact oldest-sufficient authentication/capability version pair
through Udon into driver v3. It is complete.

M05 retains every browser 1.5/1.6 extraction path and adds browser 1.7 only to
driver v3. Accessibility text is converted according to UWS 1.9 after Unicode
edge trimming; invalid lexical forms fail with the closed `invalid_response`
code and never disclose page text. It is complete.

M06 closes three lifecycle gaps exposed by the deterministic real-browser
scenario matrix: a reviewed first v3 navigation may start from the isolated
main `about:blank` page, ordinary v3 authentication clicks settle the load
before the success proof, and persistent v2 accepts browser 1.5's direct
accessibility `wait_for` wire shape. All later origin, context, ambiguity, and
closed-failure checks remain unchanged.

M07 coordinates Browserdriver with the immutable browser 1.7 schema wording:
only literal `presence: true` activates Boolean match mode. A false flag uses
the declared text/scalar extraction path in browser 1.5, 1.6, and 1.7.

M08 adds the closed `invalid_context` failure code to v2/v3 and uses it for
missing, undeclared, closed, detached, extra, or substituted runtime contexts.
Malformed protocol and profile shapes retain `invalid_response`, while origin
and ambiguity failures keep their existing codes.

M09 implementation is complete locally and unpushed at
`a97b1aed6ea69a30591815da8ca07ac9e7c87623`. It preserves v2/v3 and adds closed protocol v4 registration in
one fresh context with inherited-environment credential resolution, exact
origins/redirects, unique accessibility locators, human Continue/Deny
checkpoints, one immediately approved submit, post-submit indeterminate
classification, unconditional teardown, and no named session or state export.
OpenUdon E11 passed, and evolution result v6 is committed locally at
`a269e94d3394ca9d6bd58a0102d7a70d90a00fda`; publication remains separately
authorized.

M11 is complete: generic registration 1.1 private inputs execute through v5.
Its bounded review closes at iteration 3; owner checks, v4/v5 Chromium and Udon
consumer qualification pass. See [status-M11.md](status-M11.md).

M10 is complete locally: preserve registration request boundaries across blocked read-only
subresources and HTTP redirects; see [status-M10.md](status-M10.md).
