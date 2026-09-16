import assert from "node:assert/strict";
import {createServer} from "node:http";
import test from "node:test";
import {chromium, type BrowserContext} from "playwright";
import {PersistentBrowserDriver} from "../src/driver.js";
import type {VerifyMessage} from "../src/protocol.js";
import type {VerificationDiagnostics} from "../src/verification-diagnostics.js";
import {verificationRequest} from "./verification-fixture.js";

// Actual Chromium loader and guard. Every provider fetch is redirected to this
// test's loopback server before invoking the guard; no provider SDK is used.
test("v9 synthetic initialization guards, browser errors, CSP and invisible readiness", {
  skip: process.env.BROWSERDRIVER_VERIFICATION_LIVE_TEST !== "1", timeout: 180_000,
}, async t => {
  const canary = "synthetic-initialization-token-error-canary";
  let scenario = "existence", posts = 0, transported = 0;
  const server = createServer((request, response) => {
    request.resume();
    if (request.method !== "GET") {posts++; response.writeHead(405).end(); return;}
    if (request.url?.startsWith("/turnstile/")) {
      if (scenario === "script_error") {response.writeHead(404, {"content-type": "text/html", "x-content-type-options": "nosniff"}).end("synthetic"); return;}
      const publish = `window.turnstile={getResponse:()=>${scenario === "api_exception" ? `(()=>{throw Error('${canary}')})()` : `'${canary}'`},isExpired:()=>false};document.querySelector('input').value='${canary}';`;
      const source = scenario === "loaded_no_api" ? "void 0;" : scenario === "incomplete" ? "window.turnstile={getResponse:7};" :
        scenario === "execution_error" ? `throw Error('${canary}');` :
        scenario === "access_error" ? `Object.defineProperty(window,'turnstile',{get(){throw Error('${canary}')}});` :
        scenario === "existence" ? `if(!('turnstile' in window)){${publish}}` :
        scenario === "own_existence" ? `if(!Object.hasOwn(window,'turnstile')){${publish}}` : publish;
      response.writeHead(200, {"content-type": "text/javascript", "access-control-allow-origin": "*"}).end(source); return;
    }
    if (request.url !== "/register") {response.writeHead(404).end(); return;}
    const headers: Record<string, string> = {"content-type": "text/html"};
    if (scenario === "csp_enforce") headers["content-security-policy"] = "script-src 'self'";
    if (scenario === "csp_report") headers["content-security-policy-report-only"] = "script-src 'self'";
    response.writeHead(200, headers).end(`<!doctype html><title>Synthetic initialization</title>
      <form method="post" action="/register"><div class="cf-turnstile" style="display:none"></div><input type="hidden" name="cf-turnstile-response"><button type="submit">Register</button></form>
      <script defer crossorigin="anonymous" src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const launch = chromium.launch.bind(chromium);
  t.mock.method(chromium, "launch", async (options: Parameters<typeof chromium.launch>[0]) => {
    const browser = await launch(options), newContext = browser.newContext.bind(browser);
    t.mock.method(browser, "newContext", async (options: Parameters<typeof browser.newContext>[0]) => {
      const context = await newContext(options), route = context.route.bind(context);
      t.mock.method(context, "route", async (pattern: Parameters<BrowserContext["route"]>[0], handler: Parameters<BrowserContext["route"]>[1]) => {
        await route(pattern, async intercepted => {
          intercepted.fetch = async options => {
            transported++;
            const url = new URL(options?.url ?? intercepted.request().url());
            assert.equal(url.origin, "https://challenges.cloudflare.com");
            assert.equal(options?.maxRedirects, 0); assert.equal(options?.maxRetries, 0);
            return context.request.fetch(origin + url.pathname, {method: "GET", maxRedirects: 0, maxRetries: 0, timeout: options!.timeout!});
          };
          return handler(intercepted, intercepted.request());
        });
      });
      return context;
    });
    return browser;
  });
  const messages: Record<string, unknown>[] = [];
  const driver = new PersistentBrowserDriver({next: async () => ({done: true, value: undefined})}, m => messages.push(m as Record<string, unknown>), {headed: true});
  try {
    for (scenario of ["existence", "own_existence", "loaded_no_api", "incomplete", "script_error", "execution_error", "csp_enforce", "csp_report", "access_error", "api_exception"]) {
      messages.length = 0; transported = 0;
      const input = verificationRequest("turnstile", "before_approval", origin);
      input.profile.flows.member!.humanVerification!.dependencies.timeoutMs = 5000;
      const request: VerifyMessage = {version: "udon.browser-driver.v9", type: "verify", requestId: "synthetic_initialization_" + scenario,
        sourceDigest: input.sourceDigest, profile: input.profile, flow: input.flow, allowedOrigins: input.allowedOrigins, deadline: new Date(Date.now() + 15_000).toISOString()};
      await driver.verify(request);
      const diagnostic = messages.at(-2)!, d = diagnostic.diagnostics as ReturnType<VerificationDiagnostics["snapshotV5"]> & {shutdown: object};
      assert.equal(d.version, "browserdriver.verification-diagnostics.v5", scenario);
      const detail = JSON.stringify({scenario, result: messages.at(-1), initialization: d.initialization, observations: d.observations, counts: diagnostic.counts});
      assert.equal(d.initialization.coverage, "observed", detail);
      const total = (kind: keyof typeof d.initialization.counters[number]) => d.initialization.counters.reduce((n, row) => n + Number(row[kind]), 0);
      const ready = ["existence", "own_existence", "csp_report"].includes(scenario);
      assert.equal(messages.at(-1)!.result, ready ? "success" : "failure", detail);
      const api = d.initialization.changes.at(-1)!;
      if (ready) {assert.equal(api.api, "callable_get_response"); assert.equal(d.observations.at(-1)!.reason, "response_ready"); assert.equal(d.frame.visibility, "unavailable");}
      if (scenario === "loaded_no_api") {assert.equal(api.api, "missing"); assert.equal(total("script_load"), 1, detail); assert.equal(transported, 1, detail);}
      if (scenario === "incomplete") assert.equal(api.api, "incomplete");
      if (scenario === "script_error") assert.equal(total("script_error"), 1, detail);
      if (scenario === "execution_error") assert.equal(total("execution_error"), 1, detail);
      if (scenario === "csp_enforce") {assert.ok(total("script_policy_enforced") > 0, detail); assert.equal(transported, 0);}
      if (scenario === "csp_report") {assert.ok(total("script_policy_report") > 0, detail); assert.equal(total("script_policy_enforced"), 0);}
      if (scenario === "access_error") {assert.equal(api.api, "access_error"); assert.equal(api.globalProperty, "accessor");}
      if (scenario === "api_exception") {assert.equal(api.api, "callable_get_response"); assert.equal(d.observations.at(-1)!.reason, "api_exception");}
      assert.equal(posts, 0); assert.equal((diagnostic.counts as {applicationPosts: number}).applicationPosts, 0);
      assert.deepEqual(d.shutdown, {started: true, contextClosed: true, requestsDisposed: true, callbacksJoined: true});
      assert.equal(JSON.stringify(messages).includes(canary), false);
    }
  } finally {await driver.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));}
});
