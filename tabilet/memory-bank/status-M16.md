# Status M16 — Private saved-session write

**State:** Pending. No row has started. Bounded review 0/10.

**Stage.** Kinet STG-12, Phase A. The [Stage 12 contract](../../../kinet/docs/stage12.md)
coordinates the work; this milestone and status own acceptance. Planning was
approved on 2026-10-09 (Kinet R65), where the owner chose optional saved
sessions. It authorizes these planning files only.

**Source baseline.** `27f9edb63b01d2b0ec52b702ad8b42ca00d600cb` (clean at planning).

**Goal.** Today the driver can only **load** Playwright storage state from its
private `--session-store`, keyed by an opaque binding digest
(`src/session-store.ts`, `docs/protocol.md`). M16 adds a private, bounded **save**
path so that an owner-approved saved session can be created after a successful
authenticated named session.

**Dependencies.** [Kinet:M51](../../../kinet/tabilet/memory-bank/status-M51.md)
consumer contract (custody, lifetime and save permission).

**Downstream.**

- [Udon:M53](../../../udon/tabilet/memory-bank/status-M53.md)
- [Kinet:M56](../../../kinet/tabilet/memory-bank/status-M56.md)
- [Kinet:M52](../../../kinet/tabilet/memory-bank/status-M52.md)

**Boundary.**

- Protocols v2–v11 keep their exact bytes and behavior.
- Storage state, cookies and credentials never cross the protocol, stdout or
  stderr.
- Inline storage state is still refused.
- Sandbox always on, no live target action and no change to the Playwright or
  Node closure unless separately reviewed.

**Planning reconciliation.** Stage 12 planning review, 2026-10-09; source priority not supplied. Review baseline and current revalidation: `27f9edb63b01d2b0ec52b702ad8b42ca00d600cb`; includes the uncommitted Stage 12 planning files. F03 (partially confirmed P2; durable custody owner Kinet:M52) strengthens existing M16.1/.2 staging, binding and cleanup responsibilities. Evidence: `src/session-store.ts` plaintext load and `../kinet/tabilet/memory-bank/status-M52.md` encrypted-persistence promise. F01 remains host-owned by Kinet:M56; driver navigation semantics and wires are preserved. This is approved review intake, not a closing-review iteration; all rows and review counters remain pending/0.

**Parallel planning provenance.** Stage 12 parallel execution review,
2026-10-09; source priority and separate review baseline not supplied. Current
revalidation `27f9edb63b01d2b0ec52b702ad8b42ca00d600cb`, including uncommitted planning files. F01 (confirmed local P2) adopts scoped workflow ownership; F02 (confirmed Lower) replaces strict ordering with readiness; F04 (confirmed local P2) requires frozen consumer checks.
Evidence: the old Kinet goal/launch rules, owning agent rules, existing pending
dependencies and sibling consumer checks; Udon `go.mod`/`pkg/execute` import no
OpenUdon code. This approved intake changes no row state or review counter.

## Dispatch and lease boundaries

**Depends on.** Kinet:M51. All required prerequisites must have
accepted closure at exact revisions; sibling producer adoption also needs
independently verified publication. A priority position never supplies authority.

**Downstream impacts.** Udon:M53, Kinet:M56, Kinet:M52.

**Write set.** The owning `browserdriver/` package's implementation, tests, ordinary
documentation, manifests and qualification outputs only as required by this
milestone's existing scope, plus `tabilet/memory-bank/status-M16.md` in its
assigned worktree. Excludes `AGENTS.md`, `tabilet/GOAL.md`, shared memory-bank
files, other statuses, evolution, stages, history/knowledge, the package audit
database/sidecars, coordination docs and launch input. The coordinator alone applies shared-memory and closure
changes serially; no child writes a sibling repository or user ledger.

**Contracts read.** Immutable exact prerequisite artifacts listed above, the
M51 native-owner-reviewed contract/fixtures when applicable, the assigned
package baseline and frozen shared-memory/consumer snapshots captured at
dispatch. Cross-package checks use read-only exact snapshots or approved
published module inputs, never changing sibling checkouts. Record full source,
artifact and fixture hashes in the later execution brief; contract drift pauses
affected leases for coordinator reconciliation. Existing no-workspace/no-directory
substitution requirements for ordinary published adoption remain in force.

**Parallel-safe.** yes. Eligible only under the explicit Stage 12 lease opt-in, with no dependency path or bidirectional read/write conflict against any running lease.
At most one live milestone per package. All tests use private lease ports,
disposable stores/caches/browser profiles and unique output directories.

## Tasks

| Item | State | Notes |
| --- | --- | --- |
| M16.1 — Define and implement the private save path | `[ ]` | Behind an explicit driver option, save state after a successful authenticated named session to host-provided disposable plaintext staging, keyed by opaque binding digest. Atomic temp/rename, mode 0600, at most 1 MiB, bounded access, no symlinks/root escapes or partial writes. Kinet alone owns encryption, keys and durable acceptance; the driver never writes its durable store. Host controls staging lifetime and cleanup after joining workers. |
| M16.2 — Record lifetime and fail closed | `[ ]` | Record creation time and host-supplied maximum age; bind load/save to the current opaque host binding for owner/agent, exact profile/authentication identity, credential revision, origins and expiry. Invalid, expired or oversize state returns `session_expired` and is never loaded. Report no state values. The host decides any fresh-context fallback before dispatch only; no workflow restart or late save after revocation/archive/deletion becomes durable. |
| M16.3 Preserve protocol compatibility | `[ ]` | Preserve v2–v11 request/result bytes and absent-option behavior. Implement the exact M51-reviewed immutable host-private launch-side save plan and candidate envelope; no v12 is required. Save permission is one-use and matched to complete existing authentication identity; registration/actions never save. Independently qualify old-wire/default compatibility and the bounded candidate lifecycle. |
| M16.4 — Verify, review and publish | `[ ]` | `npm ci --ignore-scripts`, `npm test`, `npm audit --omit=dev`; synthetic save/load/expiry, wrong binding/tampering/denial, abandoned-staging and cleanup handoff tests, plus opt-in xvfb loopback checks. Qualify that writes reach staging only, enabling Kinet revoke/save-race and restart/backup-exclusion proof. Lock reviewed, bounded review, exact publication handoff under named authority. |

## Review Gate

Not started. Persist each iteration before reviewing.

## Acceptance

Only disposable plaintext staging is read/written by the driver. Exact binding,
expiry, tampering and denial fixtures refuse safely; host handoff supports
revocation-safe durable acceptance and bounded cleanup. v2–v11 bytes remain
unchanged. Kinet:M52 separately proves revoke/save races, restart cleanup and
backup exclusion against final encrypted custody.

## Verification

- `npm ci --ignore-scripts && npm test && npm audit --omit=dev`.
- Opt-in live tests only under xvfb with an environment flag.
- `git diff --check`.
- No real site or provider target.

## Frozen M51 producer input checkpoint — 2026-10-09

Kinet:M51.3 completed at local commit `589b844628b358167fe0a0137eded11c1028875c`. The [native-owner-reviewed contract](../../../kinet/docs/stage12-browser-contract.md), [host ABI](../../../kinet/docs/stage12-browser-host.go.txt), [public declarations](../../../kinet/docs/stage12-browser-public.go.txt) and [fixture manifest](../../../kinet/fixtures/stage12-browser-v1/manifest.json) SHA256 `0c445a5c90d2c09be561e713c364747f4ab9a3698ea8ab46e7b7b774ccf16bad` are exact producer inputs. Both native/public contract reviews pass with zero P1/P2/P3. This is input review, not this producer's implementation, publication or closing review. Kinet:M51 still awaits browser qualification and whole review; no dispatch prerequisite is satisfied by these task commits alone. Rows and persisted review counters remain unchanged.

Use the exact source/extraction/identity maps, per-leaf old driver protocols, complete-plan credential lease, private registration inputs, automatic TOTP versus claimed push continuations, original admitted deadline and separate bounded teardown. The supported consumer profile has one durable session binding per execution and permits other fresh named contexts. M16's immutable host-private save plan preserves v2–v11; candidate creation precedes Join and encrypted host acceptance follows Join/current-generation checks. Preserve report-v5 uncertainty and independently reproduce canonical/golden digests and positive/negative host witnesses. No current artifact claims real conformance or adoption.
