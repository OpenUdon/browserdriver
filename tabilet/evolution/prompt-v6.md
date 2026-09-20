# Trusted Browser Registration Runtime

Preserve `udon.browser-driver.v2` and v3 authentication/action behavior and add
the closed `udon.browser-driver.v4` register request for the published
`uws.browser-registration.1.0` profile and fixed call controls.

Resolve credential values only from inherited named environment variables and
keep them out of NDJSON, arguments, outputs, errors, reports, and retained
state. Execute in one fresh headed-capable context that always closes and never
becomes a named session. Enforce exact origins and redirect intermediates,
unique accessibility locators, the closed registration macro, and exactly one
submit; accept no selectors, scripts, cookies, storage, page content, session
export, or verification values.

Human checkpoints expose only Continue or Deny after direct browser action.
Emit a separate approval checkpoint immediately before the sole submit. Once
approval is returned, never retry automatically; any non-success or uncertainty
is `registration_indeterminate`. Defer result v6 until OpenUdon E11 passes.
