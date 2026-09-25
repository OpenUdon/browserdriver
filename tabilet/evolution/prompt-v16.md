# Browser 1.10 selector match-count execution

The approved UWS M05 and Browsertools M32 releases add portable Browser 1.10
CSS-selector match-count outputs. Browserdriver M15 adds a separately versioned
persistent execution contract for those outputs. Keep outer v10 and earlier
action/profile pairs unchanged. Count results include zero and multiple matches,
remain nonnegative safe integers, and expose no page text or element attributes.
Udon M43 owns downstream lowering and integration; no live target action is
included.
