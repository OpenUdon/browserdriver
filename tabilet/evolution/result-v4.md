# Portable typed accessibility output result

Driver v3 now accepts the exact `uws.browser.1.7` action discriminator and
converts Unicode-edge-trimmed accessibility text into strings, JavaScript-safe
integers, finite strict-JSON numbers, or exact lowercase Booleans. Empty,
noncanonical, non-finite, out-of-range, and composite accessibility results
produce only `invalid_response`; page text never crosses the failure boundary.

Presence continues to return only unique-match Boolean state without a text
read. Browser 1.5/1.6 and outer protocol v2 continue through their prior
extraction paths.
