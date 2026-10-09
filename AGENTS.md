# AGENTS.md

## Stage 12 concurrent goal ownership

For an explicitly authorized STG-12 goal, the governing protocol is
[../kinet/tabilet/GOAL.md](../kinet/tabilet/GOAL.md). The coordinator passes that exact protocol and the
complete resolved request to each child; sibling standalone goal protocols
remain unchanged. Use the goal skill through a hosting agent with subagents;
the Python API runner/controller remains serial.

This is a scoped exception to serial and whole-ledger single-row wording:

- One coordinator owns all integrated package-local ledgers and shared memory.
  At most three milestone leases may run, with at most one live milestone per
  package and one `[~]` row per lease. Outside this opt-in, serial rules apply.
- Dispatch requires explicit `PARALLELISM`, `INTEGRATION: local-rebase-ff`,
  `COMMIT_POLICY: task` or `milestone`, and a milestone declared
  `Parallel-safe: yes`. Strict `STATUS_ORDER` remains strict; only an explicit
  `STATUS_PRIORITY` chooses among dependency-ready milestones without new edges.
- Each lease uses an external worktree (`../<repo>.goal/<local ID>`) and local
  `goal/<local ID>` branch. Capture each package's actual symbolic integration
  ref, primary worktree and full base commit; never assume `main` or replace
  that identity on resume. Inspect existing leases before dispatching another.
- Children edit scoped implementation/tests/ordinary docs and their assigned
  status only. The coordinator alone edits shared memory, other statuses,
  scheduling documents and `suggested.txt`, and performs closure/retirement.
- Declared write sets must be disjoint and inputs frozen. Check read/write
  conflicts in both directions; use immutable accepted producer and consumer
  snapshots rather than another agent's changing checkout. Verification uses
  isolated ports, stores, caches, browser profiles and output directories.
- Integration/closure is serialized. Rebase unpublished lease commits onto the
  captured ref, re-verify, and repeat review if affected contracts or paths
  changed, without resetting its persisted counter. Inspect the assignment diff
  and integrate by fast-forward only. Dependents wait for accepted closure and,
  for siblings, independently verified publication at the exact revision.
- A blocked lease retains its branch/worktree and stops its dependents;
  independent eligible work may continue. Contract drift pauses affected leases
  for coordinator reconciliation. No child may broaden its assignment.

Planning grants no execution, commit, publication or live authority. A later
launch must supply those grants separately and start from committed planning
and a safe integration baseline. Preserve unrelated dirty work. Audit remains
disabled until explicitly requested; this opt-in changes no audit setting.

## Purpose

`browserdriver` is the trusted Playwright implementation of
`udon.browser-driver.v2`. It executes already reviewed UWS browser
authentication recipes and browser actions. Portable contracts remain in
`../uws`; authoring and review remain in `../browsertools` and `../openudon`;
workflow lowering, approval, challenge brokering, and persistence remain in
`../udon`.

## Start Here

Read `tabilet/memory-bank/product.md`, `tabilet/memory-bank/architecture.md`,
`tabilet/memory-bank/tech-stack.md`, `tabilet/memory-bank/milestone.md`, and the active status
file before substantial changes.

This repository tracks [tabilet/GOAL.md](tabilet/GOAL.md) as an optional multi-milestone
execution protocol. Follow it only when a request explicitly names that
protocol; its presence does not replace the memory-bank source of truth or
grant commit, publication, browser, target, or runtime authority.

## Essential Commands

```bash
npm ci --ignore-scripts
npm test
npm audit --omit=dev
git diff --check
```

Install a browser only for explicit live integration testing:

```bash
npx playwright install chromium
```

## Hard Rules

- Never log credential values, OTP values, cookies, storage state, session
  bindings, page content, screenshots, DOM, accessibility snapshots, or driver
  exception prose.
- Stdout is NDJSON protocol output only. Failures use the closed public code
  vocabulary; stderr is not part of the protocol.
- Execute only the closed UWS authentication and browser macro vocabularies.
  Never accept CSS, XPath, coordinates, or arbitrary JavaScript from an
  authentication recipe.
- Enforce every exact declared origin, including redirect intermediates, and
  fail closed on ambiguity, CAPTCHA, unknown challenges, or missing sessions.
- Keep one isolated persistent browser process per workflow execution. Never
  share named sessions between executions and never persist them by default.
- Tests are offline and synthetic by default and must not authenticate to or
  mutate real services.

## Work Cadence

Update the memory bank with implementation and treat each status row as one
commit unit. Add an evolution version only for a material boundary or contract
change.
