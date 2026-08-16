# Portable context freshness and authored-pair qualification

Treat cached Playwright page and frame handles as hints rather than continuing
authority. Revalidate presence, attachment, exact origin/path/name, direct
parentage, and uniqueness before every use, and resolve the complete declared
inventory at authentication and action completion.

Retain protocol v2 and accept the Browsertools-produced UWS 1.8 authentication
1.1/browser 1.5 pair through v3 alongside contextual browser 1.6.
