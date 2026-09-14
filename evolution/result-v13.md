# Evolution v13 — Verification-only diagnostic handoff

M13.17 adds driver v7 only for verification probes, preserving v6 registration.
The same trusted guard now hands bounded diagnostic v3 observations, network
classes/counts and shutdown flags to W8M private probe v3. Missing evidence and
explicit pre-guard nulls stay distinct. Tokens, challenge content, provider prose
and URLs remain excluded. Guard failures take precedence over navigation wrappers.

This source candidate passes browser-free verification and the separately
authorized two-case synthetic browser smoke. Publication, fresh complete
qualification and adoption remain separate gates.
It does not establish the cause of the consumed production Turnstile failure or
grant any further provider/target contact.
