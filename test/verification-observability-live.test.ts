import assert from "node:assert/strict";
import { createServer, type ServerResponse } from "node:http";
import test from "node:test";
import { chromium } from "playwright";
import { sandboxedChromiumOptions } from "../src/browser-launch.js";
import { observeProviderFrame } from "../src/verification-visibility.js";
import { PersistentBrowserDriver } from "../src/driver.js";
import type { VerifyMessage } from "../src/protocol.js";
import type { LifecycleObservation } from "../src/verification-lifecycle.js";
import { verificationRequest } from "./verification-fixture.js";

// Part of the maintained registration_driver stage. Every frame response is
// fulfilled locally; the SDK is synthetic and no provider service is contacted.
test("v8 synthetic shadow frames, lifecycle errors, readiness and zero probe submissions", {
  skip: process.env.BROWSERDRIVER_VERIFICATION_LIVE_TEST !== "1", timeout: 90_000,
}, async () => {
  const browser = await chromium.launch(sandboxedChromiumOptions(true));
  const context = await browser.newContext({serviceWorkers: "block", acceptDownloads: false});
  try {
    await context.route("**/*", route => route.fulfill({status: 200, contentType: "text/html", body: "<!doctype html><title>Synthetic frame</title>"}));
    const page = await context.newPage();
    await page.goto("http://127.0.0.1/synthetic");
    for (const mode of ["open", "closed"] as const) {
      const navigation = page.waitForEvent("framenavigated", {predicate: frame => frame.url().includes("/challenge-platform/synthetic")});
      await page.evaluate(mode => {
        document.body.innerHTML = '<div id="widget"></div><iframe src="https://unrelated.invalid/frame"></iframe>';
        const root = document.querySelector("#widget")!.attachShadow({mode});
        const frame = document.createElement("iframe");
        frame.src = "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/synthetic";
        root.append(frame);
      }, mode);
      await navigation;
      const widget = await page.$("#widget"); assert.ok(widget);
      const frame = await observeProviderFrame(page, widget, "turnstile");
      assert.deepEqual(frame, {visibility: "visible", associatedFrames: 1}, mode);
      await widget.evaluate(element => { element.remove(); });
      assert.equal((await observeProviderFrame(page, widget, "turnstile")).visibility, "unavailable");
      await widget.dispose();
    }
  } finally { await context.close(); await browser.close(); }

  let scenario = "error_then_ready", posts = 0, renderAllowed = false;
  let permit: ServerResponse | undefined;
  const canary = "synthetic-token-error-prose-canary";
  const server = createServer((request, response) => {
    if (request.method !== "GET") { posts++; request.resume(); response.writeHead(405).end(); return; }
    if (request.url === "/render-permit") { if (renderAllowed) response.writeHead(200).end(); else permit = response; return; }
    if (request.url !== "/register") { response.writeHead(404).end(); return; }
    response.writeHead(200, {"content-type": "text/html"}).end(`<!doctype html><title>Synthetic diagnostic verification</title>
      <form method="post" action="/register"><div class="cf-turnstile"></div><input type="hidden" name="cf-turnstile-response"><button type="submit">Register</button></form>
      <script>
      let token, rendered=false; const field=document.querySelector('input');
      window.turnstile={isExpired:()=>false,getResponse:()=>{if(rendered&&'${scenario}'==='api_exception')throw Error('${canary}');return token;},render:(widget,options)=>{
        rendered=true; const error=options['error-callback']; error.call(widget,'600123','${canary}');
        const success=options.callback; success('${canary}');
        if('${scenario}'==='error_then_ready')setTimeout(()=>{token='${canary}';field.value=token;},350);
        return 'synthetic-widget';
      }};
      fetch('/render-permit').then(()=>window.turnstile.render(document.querySelector('.cf-turnstile'),{'error-callback':function(){return false;},callback:()=>{}}));
      </script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`, messages: Record<string, unknown>[] = [];
  const driver = new PersistentBrowserDriver({next: async () => ({done: true, value: undefined})}, m => {messages.push(m as Record<string, unknown>); if ((m as {type?: string}).type === "verification_progress") {renderAllowed = true; permit?.writeHead(200).end(); permit = undefined;}}, {headed: true});
  try {
    for (scenario of ["error_then_ready", "error_empty", "api_exception"]) {
      messages.length = 0; renderAllowed = false; permit = undefined;
      const input = verificationRequest("turnstile", "before_approval", origin);
      input.profile.flows.member!.humanVerification!.dependencies.timeoutMs = 1500;
      const request: VerifyMessage = {version: "udon.browser-driver.v8", type: "verify", requestId: "synthetic_observability", sourceDigest: input.sourceDigest,
        profile: input.profile, flow: input.flow, allowedOrigins: input.allowedOrigins, deadline: new Date(Date.now() + 15_000).toISOString()};
      await driver.verify(request);
      const diagnostic = messages.at(-2)!;
      const d = diagnostic.diagnostics as {version: string; lifecycle: LifecycleObservation; observations: Array<{state: string; reason: string}>; shutdown: object};
      assert.equal(d.version, "browserdriver.verification-diagnostics.v4");
      assert.equal(d.lifecycle.events.error, 1); assert.equal(d.lifecycle.errorFamilies.challenge, 1);
      assert.equal(d.lifecycle.events.success, 1); // Callback alone cannot confer readiness.
      assert.deepEqual(d.shutdown, {started: true, contextClosed: true, requestsDisposed: true, callbacksJoined: true});
      assert.equal(messages.at(-1)!.result, scenario === "error_then_ready" ? "success" : "failure");
      if (scenario === "error_empty") { assert.equal(messages.at(-1)!.failureCode, "verification_timeout"); assert.ok(d.observations.every(o => o.state !== "ready")); }
      if (scenario === "api_exception") assert.equal(d.observations.at(-1)!.reason, "api_exception");
      assert.equal((diagnostic.counts as {providerRequests: number}).providerRequests, 0);
      assert.equal(posts, 0); assert.equal(JSON.stringify(messages).includes(canary), false);
    }
  } finally { await driver.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
