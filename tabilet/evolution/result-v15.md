# Additive Browser 1.8/1.9 action contract

M14 selects `udon.browser-driver.v10` for one persistent authentication and
action session. Its authentication and MFA semantics reuse v3. An action has
inner version `udon.browser-driver.v3`, an explicit Browser 1.8 or 1.9 profile,
the selected portable action with its single parameter schema, and supplied
parameter values. The driver resolves approved sinks before any browser macro.
Udon retains confirmation and full parameter/output JSON Schema validation.

Browser 1.8 signed 64-bit integer tokens are preserved exactly by Node 24's
JSON parse context. Browser 1.9 enforces safe integers, literal-brace escapes,
and resolved control/bidi-text restrictions. Neither version permits template
placement outside its specified sinks. Browser 1.5–1.7 action wires remain v2/v3;
registration remains v6, verification diagnostics v9. Udon integration and
cross-repository qualification are separately owned.

The downstream mixed-session integration found that one workflow can contain
both old and new browser profiles. M14.2 therefore admits inner action v2 for
Browser 1.5–1.7 within outer v10, preserving the existing v3 execution path.
Inner action v3 remains exclusive to Browser 1.8/1.9. Crossed pairs fail before
a browser step.
