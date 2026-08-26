# Trusted Browser Registration Runtime Result

Browserdriver preserves the v2/v3 authentication and browser 1.5-1.7 paths and
adds the closed `udon.browser-driver.v4` registration exchange. A register
request accepts only registration profile 1.0, one named flow, exact origins,
symbolic bindings, inherited environment names, and fixed call controls.
Credential values never enter NDJSON, argv, results, reports, errors, or state.

Each registration uses one fresh context that is always closed and never
becomes a named session. The runtime enforces exact origins and redirect
intermediates, unique accessibility locators, the closed macro vocabulary, and
one submit. Human checkpoints return only Continue or Deny; a distinct submit
approval immediately precedes the mutation. After approval, uncertainty or
non-success is `registration_indeterminate` and the attempt cannot be retried.
Selectors, scripts, cookies, storage, page content, session export, and
verification-value transport remain unavailable.

The v2/v3/v4 unit suite, dependency audit, build, secret scan, and headed
Chromium matrix pass at `a97b1aed6ea69a30591815da8ca07ac9e7c87623`.
OpenUdon E11 proves exactly one approved synthetic loopback POST, denial and
timeout before mutation, post-submit indeterminate handling, retry refusal,
redirect rejection, teardown, and no registration session in its 18/18,
20-artifact report. Browserdriver remains local and unpublished; no W8M or
other public target was contacted.
