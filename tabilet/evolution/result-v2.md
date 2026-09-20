# Browser context replay result

Browserdriver now exposes additive `udon.browser-driver.v3` without changing
v2. V3 is deliberately non-mixing: authentication 1.1 establishes its context
registry and internal action v2 executes browser 1.6 semantics against it.

Portable context declarations—not driver selectors—resolve direct-child
frames and explicitly opened popups. The driver rejects missing, duplicate,
automatic, extra, closed, changed, or wrong-origin contexts and covers child
frame/popup redirect intermediates with the navigation guard. Credential/MFA
values and all browser/session handles remain private to the trusted process.
