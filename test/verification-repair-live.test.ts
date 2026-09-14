import assert from "node:assert/strict";
import { createServer } from "node:http";
import { lstat, writeFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import test from "node:test";
import { chromium, type BrowserContext } from "playwright";
import { officialProviders, runProviderFixture } from "./provider-fixture.js";

// Real Chromium and the actual fixture/guard, with only the provider HTTP
// transport replaced by a loopback server. There is no provider contact and
// the only automatic human-control click is our own local confirmation button.
test("synthetic fixture confirmation, checked redirects, nested provider fragments and joined late requests", {
  skip: process.env.BROWSERDRIVER_VERIFICATION_LIVE_TEST !== "1", timeout: 120_000,
}, async t => {
  const selected = process.env.BROWSERDRIVER_VERIFICATION_REPAIR_CASE;
  const report = process.env.BROWSERDRIVER_VERIFICATION_REPAIR_REPORT;
  if (selected !== undefined || report !== undefined) {
    assert.ok(selected === "turnstile-before_approval" && report && isAbsolute(report), "synthetic_fixture_selection_invalid");
    try {
      try {await lstat(report); assert.fail("exists");}
      catch (error) {if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;}
      await writeFile(report + ".claim.json", JSON.stringify({version: "browserdriver.synthetic-fixture-claim.v1", selected,
        reportVersion: "browserdriver.provider-fixture.v4"}) + "\n", {flag: "wx", mode: 0o600});
    } catch {assert.fail("synthetic_fixture_claim_failed");}
  }
  let provider: keyof typeof officialProviders = "turnstile";
  let activation: "before_approval" | "approved_submit" = "before_approval";
  let context: BrowserContext | undefined, transported = 0, slowRequests = 0, framePosts = 0;
  const canary = "synthetic-response-and-fragment-canary";
  const server = createServer((request, response) => {
    request.resume();
    const path = new URL(request.url!, "http://loopback.invalid").pathname;
    if (path.endsWith("/slow")) {slowRequests++; return;}
    if (path === "/turnstile/v0/api.js") {
      response.writeHead(302, {location:"/turnstile/v0/version/api.js"}).end("synthetic redirect"); return;
    }
    if (path === "/frame") {
      response.writeHead(200, {"content-type":"text/html"}).end(`<iframe src="https://new.hcaptcha.com/nested#${canary}"></iframe>`); return;
    }
    if (path === "/nested") {
      response.writeHead(200, {"content-type":"text/html"}).end(`<script>fetch('/checkcaptcha/local',{method:'POST'}).then(()=>top.postMessage('synthetic-ready','*'));</script>`); return;
    }
    if (path === "/checkcaptcha/local") {framePosts++;response.writeHead(200).end("synthetic");return;}
    const field = {turnstile:"cf-turnstile-response",recaptcha_v2:"g-recaptcha-response",hcaptcha:"h-captcha-response"}[provider];
    response.writeHead(200, {"content-type":"application/javascript"}).end(`(() => {
      let response=${provider === "turnstile" ? "undefined" : "''"}, field, callback, executed=false, completed=false, networkReady=${provider !== "hcaptcha"};
      const complete=()=>{
        if (completed || !networkReady || (${activation === "approved_submit"} && !executed)) return;
        completed=true;
        response='${canary}'; field.value=response; callback();
      };
      addEventListener('message',event=>{if(event.data==='synthetic-ready'){networkReady=true;complete();}});
      window.${officialProviders[provider].api}={
        render:(widget,options)=>{
          callback=options.callback;
          field=document.createElement('input');field.type='hidden';field.name='${field}';widget.append(field);
          fetch('${new URL(officialProviders[provider].script).origin}${provider === "turnstile" ? "/turnstile" : provider === "recaptcha_v2" ? "/recaptcha" : ""}/slow',{method:'POST'}).catch(()=>{});
          if (${provider === "hcaptcha"}) {const frame=document.createElement('iframe');frame.src='https://assets.hcaptcha.com/frame#${canary}';widget.append(frame);}
          else setTimeout(complete,350);
          return ${provider === "recaptcha_v2" ? "0" : "'synthetic-widget'"};
        },
        execute:()=>{executed=true;setTimeout(complete,350);},
        getResponse:()=>response,isExpired:()=>false
      };
      window.fixtureLoad();
    })();`);
  });
  await new Promise<void>(resolve => server.listen(0,"127.0.0.1",resolve));
  const address=server.address();assert.ok(address&&typeof address==="object");
  const origin=`http://127.0.0.1:${address.port}`;
  const launch=chromium.launch.bind(chromium);
  t.mock.method(chromium,"launch",async (options: Parameters<typeof chromium.launch>[0]) => {
    assert.equal(options?.chromiumSandbox, true);
    const browser=await launch({...options,args:[...(options?.args??[]),"--site-per-process"]});
    const newContext=browser.newContext.bind(browser);
    t.mock.method(browser,"newContext",async (options: Parameters<typeof browser.newContext>[0]) => {
      context=await newContext(options);
      const route=context.route.bind(context), activeContext=context;
      t.mock.method(context,"route",async (pattern:Parameters<BrowserContext["route"]>[0],handler:Parameters<BrowserContext["route"]>[1])=>{
        await route(pattern,async intercepted=>{
          // No provider request can leave this process: the guard's fetch API
          // is replaced before calling its handler, including every redirect.
          intercepted.fetch=async options=>{
            transported++;
            const url=new URL(options?.url??intercepted.request().url());
            assert.equal(url.protocol,"https:");
            assert.equal(options?.maxRedirects,0);assert.equal(options?.maxRetries,0);
            return activeContext.request.fetch(origin+url.pathname+url.search,{
              method:intercepted.request().method(),maxRedirects:0,maxRetries:0,timeout:options!.timeout!,
            });
          };
          await handler(intercepted,intercepted.request());
        });
      });
      return context;
    });
    return browser;
  });
  try {
    for (provider of Object.keys(officialProviders) as Array<keyof typeof officialProviders>) {
      for (activation of ["before_approval","approved_submit"] as const) {
        if (selected && `${provider}-${activation}` !== selected) continue;
        const before=transported, slowBefore=slowRequests, frameBefore=framePosts;
        let confirmation: Promise<void> | undefined, confirmedAt=0;
        const result=await runProviderFixture(provider,activation,event=>{
          if (event.state!=="awaiting_confirmation") return;
          confirmation=(async()=>{
            const page=context!.pages()[0]!;
            // Exercise an untrusted DOM click first; it must not start loading.
            await page.getByRole("button",{name:"I'm ready—start verification",exact:true}).evaluate(element=>(element as HTMLElement).click());
            await new Promise(resolve=>setTimeout(resolve,250));
            assert.equal(transported,before);
            confirmedAt=Date.now();
            await page.getByRole("button",{name:"I'm ready—start verification",exact:true}).click();
          })();
          void confirmation.catch(()=>undefined);
        });
        if (report) await writeFile(report, JSON.stringify(result, null, 2) + "\n", {flag: "wx", mode: 0o600});
        await confirmation;
        assert.equal(result.outcome,"success",`${provider}/${activation}: ${JSON.stringify(result)}`);
        assert.equal(result.localPosts,1);
        assert.ok(result.confirmation.confirmedAt!>=confirmedAt);
        assert.ok(Math.abs(result.verificationDeadline!-result.confirmation.confirmedAt!-120_000)<10);
        assert.equal(slowRequests,slowBefore+1);
        if(provider==="hcaptcha")assert.equal(framePosts,frameBefore+1);
        if(provider==="turnstile") {
          assert.ok(result.diagnostics!.network.some(event=>event.reason==="provider_redirect_followed"));
          assert.ok(result.diagnostics!.observations.some(event=>event.responseKind==="undefined"&&event.state!=="ready"));
        }
        assert.equal(result.version,"browserdriver.provider-fixture.v4");
        assert.equal(result.chromiumSandbox, true);
        assert.equal(result.presentation.version, "browserdriver.fixture-window.v1");
        assert.deepEqual(result.presentation.samples.slice(0, 2).map(sample => sample.phase), ["before_foreground", "after_foreground"]);
        assert.equal(result.presentation.samples.at(-1)!.phase, "decision");
        assert.equal(result.diagnostics!.version,"browserdriver.verification-diagnostics.v3");
        assert.equal(result.lastObservedCallbacks.firstError,null);
        assert.equal(result.diagnostics!.firstFailure,null);
        assert.deepEqual(result.diagnostics!.shutdown,{started:true,contextClosed:true,requestsDisposed:true,callbacksJoined:true});
        assert.ok(result.diagnostics!.network.some(event=>event.phase==="shutdown"));
        assert.equal(JSON.stringify(result).includes(canary),false);
        assert.deepEqual(result.teardown,{context:true,browser:true,server:true});
      }
    }
    if (selected) return; // The selected smoke consumes one browser invocation.
    const before=transported;
    let cancelled: Promise<void> | undefined;
    const result=await runProviderFixture("recaptcha_v2","before_approval",event=>{
      if(event.state==="awaiting_confirmation"){
        cancelled=context!.pages()[0]!.getByRole("button",{name:"Cancel fixture",exact:true}).click();
        void cancelled.catch(()=>undefined);
      }
    });
    await cancelled;
    assert.equal(result.failureCode,"provider_fixture_cancelled");
    assert.equal(result.verificationDeadline,null);assert.equal(result.localPosts,0);
    assert.equal(transported,before);
    assert.deepEqual(result.teardown,{context:true,browser:true,server:true});
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
});
