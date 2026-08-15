# Architecture

Udon starts one `udon.browser-driver.v2` NDJSON subprocess per workflow
execution. The driver owns one Playwright browser and a map of named,
execution-local contexts. Authentication creates or refreshes a context;
protected browser actions use that exact name. Udon owns approval and human
challenge brokering.

The driver accepts only closed macros, enforces exact origins for every
navigation, rejects ambiguous accessibility locators and CAPTCHA, extracts only
declared outputs, and returns closed progress/failure values. Secrets enter
only through inherited named environment variables or an MFA response line.
No browser or driver-controlled prose crosses back into durable state.
