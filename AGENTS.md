# AGENTS.md

## Purpose

`browserdriver` is the trusted Playwright implementation of
`udon.browser-driver.v2`. It executes already reviewed UWS browser
authentication recipes and browser actions. Portable contracts remain in
`../uws`; authoring and review remain in `../browsertools` and `../openudon`;
workflow lowering, approval, challenge brokering, and persistence remain in
`../udon`.

## Start Here

Read `memory-bank/product.md`, `memory-bank/architecture.md`,
`memory-bank/tech-stack.md`, `memory-bank/milestone.md`, and the active status
file before substantial changes.

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
