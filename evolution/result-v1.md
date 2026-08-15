# Browser authentication driver result

The repository now provides a Node 24 / Playwright 1.62.1 persistent driver for
explicit UWS sign-in flows and named-session browser actions. It supports the
planned MFA kinds, exact origins, accessibility locators, TOTP, closed challenge
messages, CAPTCHA and ambiguity rejection, declared output extraction, and
closed failure reporting. Secrets and session state remain runtime-private.
