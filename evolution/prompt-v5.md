# Typed runtime-context failure boundary

Add a closed `invalid_context` result to Browserdriver protocols v2 and v3.
Use it only when a reviewed runtime context is missing, undeclared, closed,
detached, extra, or substituted. Preserve `invalid_response` for malformed
protocol/profile shapes and keep origin and ambiguity failures distinct.
