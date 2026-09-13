import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { chromium } from "playwright";
import { DriverFailure, type VerificationDescriptor } from "../src/protocol.js";
import { VerificationGuard, waitForVerification } from "../src/verification.js";
import { verificationDescriptor } from "./verification-fixture.js";

// Opt-in provider contact. Only documented public test sitekeys are embedded.
// No secret key, identity, backend assessment, retained page or account exists.
// The disposable hostname is resolved by this Chromium process alone.
const providers = {
  turnstile: { marker: "cf-turnstile", api: "turnstile", script: "https://challenges.cloudflare.com/turnstile/v0/api.js", key: "1x00000000000000000000AA" },
  recaptcha_v2: { marker: "g-recaptcha", api: "grecaptcha", script: "https://www.google.com/recaptcha/api.js", key: "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI" },
  hcaptcha: { marker: "h-captcha", api: "hcaptcha", script: "https://js.hcaptcha.com/1/api.js", key: "10000000-ffff-ffff-ffff-000000000001" },
} as const;

for (const provider of Object.keys(providers) as Array<VerificationDescriptor["provider"]>) {
  test(`official test-key integration: ${provider}`, {
    skip: process.env.BROWSERDRIVER_PROVIDER_NETWORK_TEST !== provider,
    timeout: 280_000,
  }, async () => {
    let activation: VerificationDescriptor["activation"] = "before_approval";
    let posts = 0;
    const config = providers[provider];
    const server = createServer((request, response) => {
      if (request.method === "POST" && request.url === "/register") {
        posts++;
        request.resume(); // Discard provider response; never inspect or retain.
        response.writeHead(303, { location: "/complete" }).end();
        return;
      }
      if (request.method !== "GET" || !["/register", "/complete"].includes(request.url ?? "")) {
        response.writeHead(405).end();
        return;
      }
      if (request.url === "/complete") {
        response.writeHead(200, { "content-type": "text/html" }).end("<p>Fixture submission received</p>");
        return;
      }
      const invisible = activation === "approved_submit";
      const attributes = invisible
        ? provider === "turnstile" ? 'data-execution="execute" data-callback="fixtureComplete"' : 'data-size="invisible" data-callback="fixtureComplete"'
        : "";
      const key = provider === "turnstile" && invisible ? "1x00000000000000000000BB" : config.key;
      // The provider callback submits only to the disposable local fixture.
      // No automated challenge interaction or solving service is used.
      const callback = invisible ? `<script>
        function fixtureComplete(){ document.querySelector('form').submit(); }
        document.querySelector('form').addEventListener('submit', event => {
          event.preventDefault(); window.${config.api}.execute();
        });
      </script>` : "";
      response.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" }).end(`<!doctype html>
        <p>Official ${provider} test-key fixture. Complete any visible verification manually.</p>
        <form action="/register" method="post"><div class="${config.marker}" data-sitekey="${key}" ${attributes}></div><button type="submit">Submit fixture</button></form>
        ${callback}<script src="${config.script}" async defer></script>`);
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://verification-fixture.test:${address.port}`;
    const browser = await chromium.launch({ headless: false, args: ["--host-resolver-rules=MAP verification-fixture.test 127.0.0.1", "--no-proxy-server"] });
    try {
      for (activation of ["before_approval", "approved_submit"] as const) {
        const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false });
        try {
          const descriptor = verificationDescriptor(provider, activation, origin);
          const guard = new VerificationGuard(context, descriptor, new Set([origin]), new Set([origin + "/register", origin + "/complete"]), Date.now() + 120_000);
          await guard.install();
          const page = await context.newPage();
          await guard.watchRedirects(page);
          await page.goto(origin + "/register", { waitUntil: "domcontentloaded" });
          const submit = page.getByRole("button", { name: "Submit fixture", exact: true });
          await guard.bindSubmit(submit);
          if (activation === "before_approval") await waitForVerification(guard, () => {});
          else {
            // Wait only for adapter initialization, without reading its token.
            const field = provider === "turnstile" ? "cf-turnstile-response" : provider === "hcaptcha" ? "h-captcha-response" : "g-recaptcha-response";
            await page.waitForFunction(({ api, field }) => typeof (window as unknown as Record<string, {execute?: unknown}>)[api]?.execute === "function" && document.getElementsByName(field).length === 1, { api: config.api, field }, { timeout: 120_000 });
            guard.assertSafe();
          }
          const before = posts;
          guard.beginSubmit();
          await submit.click();
          await waitForVerification(guard, () => {}, true);
          await page.waitForURL(origin + "/complete");
          guard.finishSubmit();
          assert.equal(posts, before + 1);
        } catch (error) {
          // Provider/page exception prose and response values never reach logs.
          throw new Error(error instanceof DriverFailure ? error.code : "provider_fixture_failed");
        } finally { await context.close(); }
      }
    } finally {
      await browser.close();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
}
