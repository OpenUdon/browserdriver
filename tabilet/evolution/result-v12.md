# Sandboxed launch and Ready-page evidence

All trusted Chromium paths explicitly require the sandbox through one option
helper. A rejected launch propagates as a closed failure and is never retried
with weaker options. Host sandbox installation/configuration is unchanged.

Local fixture-presentation v2 removes the page-screen rectangle and desktop
containment claim. The prior v1 mixed Chromium window bounds with an emulated
1280x720 page screen. Its consumed reports retain their original bytes and the
separately recorded interpretation correction.

Provider fixture v4 now embeds fixture-window v1 observations from the same
Ready-only observer. Samples contain closed phase/time, window bounds and page
visibility/focus only. Preserve the first two and latest 30 transitions, throttle
waiting probes to 500 ms and cap streamed samples at 32. The observer stops before
provider SDK loading, exports no tokens/DOM/titles and cannot extend confirmation
deadlines. Null presentation data fails closed; closed or expired decisions are
rejected after sampling. No automatic move, resize, extra foreground request,
click or retry is introduced. Human confirmation remains distinct from page focus.

Both fixture entries require the exact requested report version before claims
and launch; their v2 claims bind that version. An old launcher cannot execute
and only then discover an unsupported report. Driver wire v6, UWS/BRP contracts
and verification diagnostics v3 remain unchanged. Future supervisors explicitly
validate v4/v2 and keep valid failure reports on nonzero exits.

A separately authorized single-case synthetic Turnstile smoke exercises the
actual fixture and guard using loopback provider transport, one local POST,
closed window evidence and sandboxed Chromium. It has no provider contact and
cannot attest human visibility or qualify/adopt a runtime. Provider validation
requires its own subsequent six-case scope and current candidate bindings.
