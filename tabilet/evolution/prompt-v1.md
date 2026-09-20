# Browser authentication driver direction

Create a separate trusted Playwright repository that implements the private
Udon v2 process contract. Keep portable recipes inert and secret-free, keep
sessions execution-local, mediate MFA through Udon, and preserve browser.1.5
action compatibility without adding arbitrary browser scripting.
