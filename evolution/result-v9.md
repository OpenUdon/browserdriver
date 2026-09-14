# Verification repair candidate v9

Driver v6 and UWS 1.2 envelopes remain unchanged. The trusted guard now validates
bounded same-origin provider GET/HEAD subresource redirects, checks frame
ancestry without its non-network fragment, and freezes admissions before
cancelling API requests, closing the context and joining pending callbacks.
Provider POSTs and application submissions retain separate authority and limits.

Internal diagnostics and official-key fixture reports advance to v2. They
separate active failures from shutdown observations and attest joined cleanup.
A disposable local confirmation page explains the human checkbox/challenge step
before provider loading and the fixed two-minute verification phase; its own
five-minute wait cannot renew verification or consumed authority. Older frozen
fixture supervisors and reports remain unchanged; the next scoped supervisor
must explicitly support the new report and timing bounds.

M13.5 records local verification and bounded review. Provider-network execution,
publication, full qualification and exact-byte adoption remain separate gates.
Prior consumed reports and adopted bytes are preserved. No production provider
acceptance follows from synthetic checks or this source candidate.
