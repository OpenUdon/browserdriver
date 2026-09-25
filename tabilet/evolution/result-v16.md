# Additive Browser 1.10 count action

M15 defines persistent `udon.browser-driver.v11` with inner
`udon.browser-driver.v4`, paired exclusively with `uws.browser.1.10`. The v11
action contract accepts count outputs only and returns each result as a
nonnegative integer within the JavaScript safe-integer range and declared
validation bounds. `visibility` selects all connected matches or the UWS
rendered-count rules; optional `within` resolves one unique root and counts only
its descendants. Zero and multiple matches are ordinary results. Missing or
ambiguous roots, malformed selectors, invalid counts, and bound failures return
the existing closed `invalid_response` code without page text or attributes.

Outer v10 and earlier action/profile pairings remain unchanged. UWS owns the
portable profile semantics; Browsertools owns typed authoring; Udon M43 owns
lowering and cross-repository integration. No live target operation is part of
this direction.
