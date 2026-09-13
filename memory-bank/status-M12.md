# M12 — Registration foreground and checkpoint deadlines

| Item | State | Notes |
| --- | --- | --- |
| M12.1 Implement and verify | `[+]` | Bring the isolated registration page forward at launch and each human/input/submit checkpoint; publish its fixed checkpoint deadline through optional v5 timing metadata. Preserve v2-v4 and one-submit/no-retry semantics. |
| M12.2 Review and close | `[+]` | Focused offline/race and authorized numeric-loopback browser checks, required owner gates, bounded review with no P1/P2; maximum ten iterations. |

The owner approved this generic successor after a local visibility check.
M11 remains completed history. W8M W16 coordinates integration and exact
runtime adoption; no real registration, identity reuse or target contact is
authorized. Whole-milestone review iteration 0.

Review iteration 1 finds a P2 deadline race: a queued successful response must
be checked against the elapsed deadline even if cancellation delivery is late.
Add an explicit final deadline check before accepting a checkpoint response.
The full owner gates and focused browser checks remain in progress.

Implementation verification: 53 offline tests pass with two opt-in browser skips; both authorized native v4/v5 Chromium tests pass separately. The final late-reply guards and foreground-failure regression pass offline. npm audit reports zero vulnerabilities. No dependencies changed.

Review iteration 2 inspects the complete change after the late-response fix: no
remaining P1/P2 finding in deadline propagation, legacy wire scope, privacy,
foreground failure, one-submit enforcement, expiration or teardown. Existing
evolution direction remains unchanged; timing metadata does not alter public
UWS or authorization semantics. Closure bookkeeping follows this task commit.

Milestone review closes at iteration 2. Integration and exact new runtime
qualification/adoption remain owned by OpenUdon E14 and W8M W16; no live
registration authority is granted.
