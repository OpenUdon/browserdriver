# Private session candidates

M16 adds host-private launch options without new NDJSON fields or changes to
protocols v2–v11:

```text
--session-save-plan ABSOLUTE_FILE --session-save-root ABSOLUTE_DIRECTORY
```

Both options must be present, or both absent. With neither, the driver does not
read a plan, create a candidate store or snapshot a session. The old load-only
`--session-store` stays separate and accepts raw Playwright state at
`SHA256(UTF8(binding)) + ".json"`; it never receives a candidate envelope.
Load failures still return `session_expired`. The host alone chooses any fresh
context before dispatch.

Exact input: frozen Kinet M51 `session-save-contract.json` SHA256
`7f829101443fb5b8404135f453fa0406d5b09e9d52a61b3340b9c918b32c873f`,
accepted source `ec760d83b6e344e9e9cd7c034f9a92eba99f38b1`, fixture manifest
`0c445a5c90d2c09be561e713c364747f4ab9a3698ea8ab46e7b7b774ccf16bad`.
This document describes a local producer candidate, not accepted publication.

The immutable `browserdriver.session-save-plan.v1` has `launchNonce`, original
`admittedDeadline` and at most100 permissions. Input is <=256KiB and refuses
duplicate keys, unknown fields, invalid Unicode, unsafe numbers, unsupported
versions and invalid timestamps. The plan file must be regular0600, owned by
the current user, single-link and under a stable real0700 parent. The candidate
root must be fresh0700, owned, stable, empty and disjoint from legacy load.
Unavailable safety checks refuse configuration before browser launch.

Each permission binds `permissionId`, authentication version/operation/source
Digest/flow/session/optional reuse binding, `authenticationRequestSHA256`,
`saveBinding`, `bindingSHA256`, positive safe `generation` and original
`createdAt`/`expiresAt`/`maxAgeSeconds`. Age defaults to seven days and has a
thirty-day maximum; expiry equals original creation plus that exact age.
Creation cannot be future; deadline and expiry must be current. Permission IDs,
authentication tuples and save bindings are independently unique. Records are
deeply frozen once read.

The request hash removes only `requestId` from the complete parsed authenticate
message, recursively sorts object keys by UTF8 bytes, preserves arrays, uses
JSON.stringify string escaping and hashes unspaced UTF8 bytes. Credential maps
contain symbolic bindings/environment names, never values. The hash and opaque
bindings are not public evidence.

Normal authentication validation runs first. Exact tuple and full digest consume
one matching permission before authentication, even if it later fails. Mismatch,
exhaustion, actions and registration never save or consume another permission.
Existing success bytes are emitted unchanged, then the driver awaits one complete
Playwright storage-state snapshot including IndexedDB and candidate write while
the context is alive. It processes no next message before settlement. Original
deadline/expiry are checked before snapshot/publication and after settlement.
Ordinary save failure preserves success and emits only the fixed private stderr
line `browserdriver session save failed`.

The candidate is <=1MiB including its `browserdriver.session-candidate.v1`
envelope: `launchNonce`, `permissionId`, exact raw-file `planSHA256`,
`bindingSHA256`, `generation`, original `createdAt`/`expiresAt`, `capturedAt`
and private `storageState`. Its name is
`SHA256(UTF8(saveBinding)) + ".candidate.json"`.

Node core has no atomic no-replacement rename. This Linux implementation uses
an equivalent sequence: exclusive random0600 temporary file, complete write and
file fsync, bounded owner/single-link check, atomic hard-link creation of the
final name, temporary unlink, directory fsync and final custody/deadline checks.
Link creation refuses any existing file/symlink and never overwrites it. All
operations are anchored to the opened directory through `/proc/self/fd`; path
replacement cannot redirect plaintext. Success leaves complete fsynced bytes,
one final link and no temporary. Join waits for writes, unlink and directory
settlement. The immutable M51 contract/fixture manifest is unchanged.

Failed publication invalidates its still-open inode before erasure. Unsettled
invalidation, erasure, directory fsync or file close taints the store, denies
later saves and makes close fail. CLI finishes context/browser teardown, emits
only `browserdriver session cleanup failed` and exits nonzero. A crash, partial
output or leftover temporary/extra link never establishes candidate custody.

Kinet M52 owns encryption, keys, durable storage, generation locks, original
expiry/reuse validation, restart cleanup and backup exclusion. After workers
settle, SessionSave independently validates custody, exact permission/binding,
current generation and original expiry. Abnormal driver exit or the closed
cleanup-gap diagnostic must refuse candidate acceptance: withhold the private
candidate handle or return existing `save_refused`. Join's process-absence
booleans alone do not encode clean exit or candidate eligibility. No public wire
or JoinWitness extension is introduced. SessionRelease erases only after joined
ownership; uncertain/unjoined output stays quarantined until reconciliation.
Revoke/archive/deletion wins over late saves. Reuse stages only decrypted,
revalidated raw `storageState` into the old format without lifetime renewal.

Browser-free tests model Playwright and inject filesystem/cleanup failures.
They prove local ordering and filesystem controls, not real-browser or encrypted
host acceptance. M16.4 still needs scoped xvfb loopback checks, dependency audit,
bounded whole review and exact reviewed source-publication handoff.
