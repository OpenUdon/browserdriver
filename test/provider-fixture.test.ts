import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { chromium, type Browser, type Page } from "playwright";
import { VerificationGuard } from "../src/verification.js";
import { officialProviders, providerFixtureHTML, fixtureConfirmationHTML, runProviderFixture, waitForFixtureConfirmation, reduceFixtureSnapshot, fixtureErrorSources, type FixtureSnapshot } from "./provider-fixture.js";

test("confirmation expiry rejects a late queued reply and closing or cancelling never starts verification",async()=>{
  for(const scenario of ["ready","late","elapsed","closed","closing","cancelled"]){
    let now=100,closed=scenario==="closed",evaluations=0;
    const page={isClosed:()=>closed,evaluate:async()=>{
      evaluations++;
      if(scenario==="closing"){closed=true;throw new Error("private-page-close-prose");}
      if(scenario==="late")now=200;
      return scenario==="cancelled"?"cancelled":"ready";
    }} as unknown as Page;
    const guard={assertSafe:()=>{}};
    const result=waitForFixtureConfirmation(page,guard,scenario==="elapsed"?100:200,()=>now);
    if(scenario==="ready")await result;
    else await assert.rejects(result,(error:unknown)=>error instanceof Error&&error.message===
      (["late","elapsed"].includes(scenario)?"provider_fixture_confirmation_timeout":"provider_fixture_cancelled"));
    if(["closed","elapsed"].includes(scenario))assert.equal(evaluations,0);
  }
});

test("window sampling cannot extend a confirmation deadline or turn a closed window into approval", async () => {
  for (const scenario of ["late", "closed", "closed_reply"]) {
    let now = 100, closed = false;
    const page = {isClosed: () => closed, evaluate: async () => "ready"} as unknown as Page;
    await assert.rejects(waitForFixtureConfirmation(page, {assertSafe: () => {}}, 200, () => now, async phase => {
      assert.equal(phase, "decision");
      if (scenario === "late") now = 200;
      else {closed = true; if (scenario === "closed") throw Error("private-observer-exception");}
    }), (error: unknown) => error instanceof Error && error.message ===
      (scenario === "late" ? "provider_fixture_confirmation_timeout" : "provider_fixture_cancelled"));
  }
});

test("confirmation requires a trusted initial click, is one-shot, and contains no provider resources", () => {
  for (const choice of ["ready", "cancel"] as const) {
    const html = fixtureConfirmationHTML("recaptcha_v2", "before_approval");
    assert.equal(/<script[^>]+src=|<iframe|<form|https:/u.test(html), false);
    assert.match(html, /must click any verification checkbox/u);
    const listeners: Record<string, (event: {isTrusted:boolean}) => void> = {};
    const buttons = Object.fromEntries(["ready", "cancel"].map(id => [id, {disabled:false,addEventListener:(_:string,callback:typeof listeners[string])=>{listeners[id]=callback;}}]));
    const window = {} as {fixtureDecision:()=>string};
    runInNewContext(/<script>([\s\S]*?)<\/script>/u.exec(html)![1]!, {window,document:{getElementById:(id:string)=>buttons[id]}});
    assert.equal(window.fixtureDecision(),"waiting");
    listeners[choice]!({isTrusted:false});assert.equal(window.fixtureDecision(),"waiting");
    listeners[choice]!({isTrusted:true});assert.equal(window.fixtureDecision(),choice==="ready"?"ready":"cancelled");
    listeners[choice==="ready"?"cancel":"ready"]!({isTrusted:true});
    assert.equal(window.fixtureDecision(),choice==="ready"?"ready":"cancelled");
    assert.ok(buttons.ready!.disabled&&buttons.cancel!.disabled);
  }
});

test("official fixtures render on onload, execute the returned widget ID once and ignore callback arguments", () => {
  const canary = "private-response-and-provider-error-canary";
  for (const provider of Object.keys(officialProviders) as Array<keyof typeof officialProviders>) {
    for (const activation of ["before_approval", "approved_submit"] as const) {
      const html = providerFixtureHTML(provider, activation);
      const code = /<script>([\s\S]*?)<\/script>/u.exec(html)![1]!;
      let rendered = false, executed = 0, posted = 0, prevented = 0;
      let listener: (() => void) | undefined;
      let options!: {callback: (token: string) => void; "error-callback": (error: string) => void; "expired-callback": () => void};
      const window = {
        [officialProviders[provider].api]: {
          render: (_: unknown, config: typeof options) => {rendered = true; options = config; return provider === "recaptcha_v2" ? 0 : "widget-id-kept-in-page";},
          execute: (id: unknown) => {assert.equal(id, provider === "recaptcha_v2" ? 0 : "widget-id-kept-in-page"); executed++;},
        },
      } as unknown as Record<string, unknown> & {fixtureLoad: () => void; fixtureSnapshot: () => {errors: number; completed: number; executed: number}};
      const form = {submit: () => {posted++;}, addEventListener: (_: string, callback: (event: object) => void) => {
        listener = () => callback({preventDefault: () => {prevented++;}});
      }};
      runInNewContext(code, {window, document: {getElementById: () => ({}), querySelector: () => form}});
      assert.equal(rendered, false);
      window.fixtureLoad(); assert.equal(rendered, true);
      assert.equal(executed, 0);
      if (activation === "approved_submit") {
        listener!(); assert.equal(executed, 1); assert.equal(posted, 0);
        options.callback(canary); assert.equal(posted, 1);
        listener!(); assert.equal(executed, 1); assert.equal(prevented, 2);
      } else {
        assert.equal(listener, undefined); options.callback(canary); assert.equal(posted, 0);
      }
      options["error-callback"](canary);
      options["expired-callback"]();
      assert.equal(JSON.stringify(window.fixtureSnapshot()).includes(canary), false);
    }
  }
});

test("fixture setup failure closes its listener and returns value-free failure evidence", async t => {
  const canary = "private-launch-error-canary";
  t.mock.method(chromium, "launch", async () => {throw new Error(canary);});
  const result = await runProviderFixture("hcaptcha", "approved_submit", () => {});
  assert.equal(result.outcome, "failure");
  assert.equal(result.phase, "setup");
  assert.equal(result.failureCode, "provider_fixture_failed");
  assert.equal(result.localPosts, 0);
  assert.deepEqual(result.teardown, {context: true, browser: true, server: true});
  assert.equal(JSON.stringify(result).includes(canary), false);
});

test("provider fixture preserves window-probe failure before Ready and does not load providers", async t => {
  let closed = false, evaluations = 0;
  const canary = "private-cdp-exception";
  const page = {goto: async () => {}, isClosed: () => false, evaluate: async () => {evaluations++;},
    context: () => context};
  const context = {setDefaultTimeout: () => {}, newPage: async () => page,
    newCDPSession: async () => {throw Error(canary);}, close: async () => {closed = true;}};
  t.mock.method(chromium, "launch", async () => ({newContext: async () => context, close: async () => {}} as unknown as Browser));
  t.mock.method(VerificationGuard.prototype, "install", async () => {});
  t.mock.method(VerificationGuard.prototype, "watchRedirects", async () => {});
  t.mock.method(VerificationGuard.prototype, "close", async () => {await context.close();});
  const result = await runProviderFixture("turnstile", "before_approval", () => {});
  assert.equal(result.failureCode, "provider_fixture_presentation_failed");
  assert.equal(result.confirmation.confirmedAt, null); assert.equal(result.verificationDeadline, null);
  assert.equal(result.localPosts, 0); assert.equal((result.counts as {providerRequests: number}).providerRequests, 0);
  assert.deepEqual(result.presentation.samples.map(sample => ({phase: sample.phase, bounds: sample.bounds, page: sample.page})),
    [{phase: "before_foreground", bounds: null, page: null}]);
  assert.equal(evaluations, 0); assert.equal(closed, true);
  assert.equal(JSON.stringify(result).includes(canary), false);
});

test("old or incomplete selectors and consumed claims fail before browser execution", async () => {
  const directory = await mkdtemp(join(tmpdir(), "provider-fixture-offline-"));
  try {
    const report = join(directory, "result.json"), claim = report + ".claim.json";
    // No display/browser settings or inherited opt-in environment are passed.
    const invoke = (extra: Record<string, string>) => spawnSync(process.execPath, ["--test", new URL("./verification-provider.test.js", import.meta.url).pathname], {
      env: {PATH: process.env.PATH!, BROWSERDRIVER_PROVIDER_NETWORK_TEST: "hcaptcha", ...extra}, encoding: "utf8", timeout: 10_000,
    });
    for (const version of [undefined, "browserdriver.provider-fixture.v3", "browserdriver.provider-fixture.v4", "browserdriver.provider-fixture.v5", "unsupported"]) {
      const env: Record<string, string> = {BROWSERDRIVER_PROVIDER_ACTIVATION: "approved_submit", BROWSERDRIVER_PROVIDER_REPORT: report};
      if (version !== undefined) env.BROWSERDRIVER_PROVIDER_REPORT_VERSION = version;
      assert.match(invoke(env).stdout, /provider_fixture_selection_invalid/u);
      await assert.rejects(readFile(claim), {code: "ENOENT"});
      await assert.rejects(readFile(report), {code: "ENOENT"});
    }
    const old = invoke({});
    assert.equal(old.status, 1);
    assert.match(old.stdout, /provider_fixture_selection_invalid/u);
    await writeFile(report, "preserved-result\n", {flag: "wx"});
    const collision = invoke({BROWSERDRIVER_PROVIDER_ACTIVATION: "approved_submit", BROWSERDRIVER_PROVIDER_REPORT: report, BROWSERDRIVER_PROVIDER_REPORT_VERSION: "browserdriver.provider-fixture.v6"});
    assert.equal(collision.status, 1);
    assert.match(collision.stdout, /provider_fixture_claim_failed/u);
    assert.equal(await readFile(report, "utf8"), "preserved-result\n");
    await assert.rejects(readFile(claim), {code: "ENOENT"});
    await rm(report);
    await writeFile(claim, "consumed-evidence\n", {flag: "wx"});
    const consumed = invoke({BROWSERDRIVER_PROVIDER_ACTIVATION: "approved_submit", BROWSERDRIVER_PROVIDER_REPORT: report, BROWSERDRIVER_PROVIDER_REPORT_VERSION: "browserdriver.provider-fixture.v6"});
    assert.equal(consumed.status, 1);
    assert.match(consumed.stdout, /provider_fixture_claim_failed/u);
    assert.equal(await readFile(claim, "utf8"), "consumed-evidence\n");
    await assert.rejects(readFile(report), {code: "ENOENT"});
  } finally {await rm(directory, {recursive: true, force: true});}
});


function lifecycleHarness(source = "none") {
  let listener: ((event:{preventDefault:()=>void})=>void)|undefined, options:Record<string,()=>void>={},posts=0;
  const window={grecaptcha:{render:(_element:unknown,config:typeof options)=>{
    options=config;if(source==="render_exception")throw Error("private-exception-canary");return source==="invalid_widget"?null:0;
  },execute:()=>{
    if(source==="execute_exception")throw Error("private-exception-canary");
    if(source==="execute_rejection")return Promise.reject(Error("private-exception-canary"));
    if(source==="provider_error_callback")options["error-callback"]!();
    return source==="settlement"?Promise.resolve("private-token-canary"):undefined;
  }}} as unknown as Record<string,unknown>&{fixtureLoad:()=>void;fixtureScriptError:()=>void;fixtureSnapshot:()=>FixtureSnapshot};
  const form={submit:()=>{if(source==="completion_submit_exception")throw Error("private-exception-canary");posts++;},
    addEventListener:(_event:string,callback:typeof listener)=>{listener=callback;}};
  const code=/<script>([\s\S]*?)<\/script>/u.exec(providerFixtureHTML("recaptcha_v2","approved_submit"))![1]!;
  runInNewContext(code,{window,document:{getElementById:()=>({}),querySelector:()=>form}});
  return {load:()=>window.fixtureLoad(),trigger:()=>listener!({preventDefault:()=>{}}),
    callback:()=>options.callback!(),providerError:()=>options["error-callback"]!(),expire:()=>options["expired-callback"]!(),
    scriptError:()=>window.fixtureScriptError(),snapshot:()=>reduceFixtureSnapshot(window.fixtureSnapshot()),posts:()=>posts};
}

test("fixture errors identify render, execute, callback and local handoff sources without private prose",async()=>{
  for(const source of fixtureErrorSources.filter(s=>s!=="invalid_snapshot")) {
    const h=lifecycleHarness(source);
    if(source==="script_load_error")h.scriptError();
    else if(source==="trigger_before_render")h.trigger();
    else {
      h.load();
      if(source==="duplicate_render")h.load();
      else if(source==="completion_before_trigger")h.callback();
      else if(!["render_exception","invalid_widget"].includes(source)) {
        h.trigger();
        if(source==="duplicate_trigger")h.trigger();
        if(source==="completion_submit_exception")h.callback();
        if(source==="duplicate_completion"){h.callback();h.callback();}
      }
    }
    await new Promise(resolve=>setImmediate(resolve));
    const snapshot=h.snapshot();assert.equal(snapshot.firstError?.source,source);
    assert.ok(snapshot.events.some(event=>event.kind===source));
    assert.equal(h.posts(),source==="duplicate_completion"?1:0);
    assert.equal(JSON.stringify(snapshot).includes("private-"),false);
  }
});

test("settled execute waits for its delayed callback, expired/error callbacks prevent a handoff",async()=>{
  const h=lifecycleHarness("settlement");h.load();h.trigger();
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(h.snapshot().events.some(event=>event.kind==="execute_settled"));assert.equal(h.posts(),0);
  h.callback();assert.equal(h.posts(),1);assert.equal(h.snapshot().firstError,null);
  for(const failure of ["expired","error"]) {
    const stopped=lifecycleHarness();stopped.load();stopped.trigger();
    if(failure==="expired")stopped.expire();else stopped.providerError();
    stopped.callback();assert.equal(stopped.posts(),0);
  }
});

test("bounded fixture trace keeps the first error and reducer rejects malformed snapshots",()=>{
  const h=lifecycleHarness();h.load();h.trigger();h.providerError();
  const first=h.snapshot().firstError;
  for(let i=0;i<80;i++)h.trigger();
  const snapshot=h.snapshot();assert.equal(snapshot.events.length,32);assert.ok(snapshot.omittedEvents>0);
  assert.deepEqual(snapshot.firstError,first);assert.equal(snapshot.errors,2);
  snapshot.events[0]!.kind="render_enter";snapshot.firstError!.source="script_load_error";
  assert.deepEqual(h.snapshot().firstError,first);
  for(const bad of [null,{...h.snapshot(),firstError:{sequence:1,source:"private-error-canary"}},
    {...h.snapshot(),events:[{sequence:1,kind:"private-token-canary"}]}, {...h.snapshot(),executed:3}]) {
    const reduced=reduceFixtureSnapshot(bad);assert.equal(reduced.firstError?.source,"invalid_snapshot");
    assert.equal(JSON.stringify(reduced).includes("private-"),false);
  }
  assert.equal(JSON.stringify(reduceFixtureSnapshot({...h.snapshot(),token:"private-token-canary"})).includes("private-"),false);
});


test("fixture reduction reads untrusted getter values once before checking closed labels",()=>{
  const h=lifecycleHarness();h.load();h.trigger();h.providerError();const snapshot=h.snapshot();
  let reads=0;
  Object.defineProperty(snapshot.firstError!,"source",{get:()=>++reads===1?"provider_error_callback":"private-getter-canary"});
  const reduced=reduceFixtureSnapshot(snapshot);
  assert.equal(reads,1);assert.equal(reduced.firstError?.source,"provider_error_callback");
  const bounded=h.snapshot();let lengthReads=0;
  bounded.events=new Proxy(bounded.events,{get:(target,key)=>key==="length"?(++lengthReads===1?target.length:10000):Reflect.get(target,key)});
  assert.equal(reduceFixtureSnapshot(bounded).events.length,h.snapshot().events.length);
  assert.equal(lengthReads,1);
  assert.equal(JSON.stringify(reduced).includes("private-"),false);
});
