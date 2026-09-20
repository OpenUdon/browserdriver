# Portable context freshness result

Driver v3 now revalidates every cached page and frame before reuse and resolves
the complete declared inventory at authentication and action completion.
Closed pages, detached/reparented frames, origin or identity drift, renewed
ambiguity, and missing or extra contexts fail before replay continues.

V3 accepts authentication 1.1 followed by either browser 1.5 or 1.6 through
the existing internal action v2 envelope. Outer v2 behavior is unchanged, and
Udon's named producer-to-replay test supplies the exact Browsertools profile
pair rather than a separately invented compatibility fixture.
