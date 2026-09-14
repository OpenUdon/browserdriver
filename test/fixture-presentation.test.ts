import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { chromium, type Browser, type Page } from "playwright";
import { allowPresentationRequest, fixturePresentationHTML, runFixturePresentationDiagnostic } from "./fixture-presentation.js";
import { PresentationTrace, readPagePresentation, reduceWindowBounds, samplePresentation, type PresentationSample } from "./fixture-window.js";

test("presentation reduction drops private fields and rejects malformed geometry without rereading getters", () => {
  const canary = "private-window-title-canary";
  const valid = {left: -1280, top: 10, width: 1280, height: 805, windowState: "normal"};
  assert.deepEqual(reduceWindowBounds({...valid, title: canary}), valid);
  for (const bad of [null, undefined, canary, {...valid, width: Infinity}, {...valid, height: -1},
    {...valid, windowState: canary}, {...valid, left: 999999}]) assert.equal(reduceWindowBounds(bad), null);
  let reads = 0;
  assert.deepEqual(reduceWindowBounds({...valid, get left() {return ++reads === 1 ? -1280 : canary;}}), valid);
  assert.equal(reads, 1);
  const document = {visibilityState: canary, hasFocus: () => canary};
  const screen = {availLeft: 0, availTop: 0, availWidth: canary, availHeight: 2160};
  const reduced = runInNewContext(`(${readPagePresentation.toString()})()`, {document, screen});
  assert.equal(JSON.stringify(reduced), JSON.stringify({visibility: "unknown", focused: null}));
  assert.equal(JSON.stringify(reduced).includes(canary), false);

});

test("bounded trace preserves foreground evidence and latest transitions without claiming human visibility", () => {
  const trace = new PresentationTrace();
  const sample: PresentationSample = {phase: "before_foreground", elapsedMs: 0,
    bounds: null, page: null};
  trace.add(sample); trace.add({...sample, phase: "after_foreground"});
  for (let i = 0; i < 70; i++) trace.add({...sample, phase: "waiting", elapsedMs: i,
    page: {visibility: i % 2 ? "visible" : "hidden", focused: false}});
  assert.equal(trace.samples.length, 32); assert.equal(trace.omitted, 40);
  assert.equal(trace.samples[0]!.phase, "before_foreground");
  assert.equal(trace.samples[1]!.phase, "after_foreground");
  assert.equal(trace.samples.at(-1)!.elapsedMs, 69);
  assert.equal(trace.add({...trace.samples.at(-1)!, elapsedMs: 999}), false);
});

test("outer-window observations never read emulated screen geometry or infer desktop containment", async () => {
  for (const size of [{width: 1280, height: 720}, {width: 3840, height: 2160}]) {
    let screenReads = 0, detached = false;
    const sandbox = {document: {visibilityState: "visible", hasFocus: () => true},
      get screen() {screenReads++; return {availWidth: size.width, availHeight: size.height};}};
    const page = {context: () => ({newCDPSession: async () => ({
      send: async () => ({bounds: {left: 76, top: 42, width: 1288, height: 805, windowState: "normal"}, private: "not-returned"}),
      detach: async () => {detached = true;},
    })}), evaluate: async (fn: () => unknown) => runInNewContext(`(${fn.toString()})()`, sandbox)} as unknown as Page;
    const sample = await samplePresentation(page, "before_foreground", Date.now());
    assert.deepEqual(Object.keys(sample).sort(), ["bounds", "elapsedMs", "page", "phase"]);
    assert.equal(JSON.stringify(sample.page), JSON.stringify({visibility: "visible", focused: true}));
    assert.equal(screenReads, 0); assert.equal(detached, true);
    assert.equal(JSON.stringify(sample).includes("not-returned"), false);
  }
});

test("local diagnostic HTML has no provider/form capability and admission rejects mutation and origin escapes", () => {
  const html = fixturePresentationHTML();
  assert.match(html, /No verification will start/u);
  assert.equal(/<script[^>]+src=|<iframe|<form|https:/u.test(html), false);
  const ready = "http://verification-fixture.test:1234/ready";
  assert.equal(allowPresentationRequest(ready, "GET", ready), true);
  for (const method of ["POST", "PUT", "HEAD", "DELETE", "OPTIONS"]) assert.equal(allowPresentationRequest(ready, method, ready), false);
  for (const url of [ready + "?x=1", ready + "/", ready.replace("/ready", "/register"),
    "https://challenges.cloudflare.com/turnstile/v0/api.js", ready.replace(".test:", ".test.evil:")]) {
    assert.equal(allowPresentationRequest(url, "GET", ready), false);
  }
});

test("local diagnostic confirms or cancels without entering provider execution and joins teardown", async t => {
  for (const decision of ["ready", "cancelled"] as const) {
    let closed = false, browserClosed = false, detached = 0;
    const context = {setDefaultTimeout: () => {}, route: async () => {}, routeWebSocket: async () => {},
      newPage: async () => page, close: async () => {closed = true;}, newCDPSession: async () => ({
        send: async () => ({bounds: {left: 76, top: 42, width: 1288, height: 805, windowState: "normal"}}),
        detach: async () => {detached++;},
      })};
    const page = {context: () => context, isClosed: () => closed, bringToFront: async () => {},
      goto: async (url: string) => {
        const response = await fetch(url.replace("verification-fixture.test", "127.0.0.1"));
        assert.equal(response.status, 200); await response.arrayBuffer();
      }, evaluate: async (fn: unknown) => fn === readPagePresentation ?
        {visibility: "visible", focused: true} : decision};
    const mock = t.mock.method(chromium, "launch", async () => ({newContext: async () => context,
      close: async () => {browserClosed = true;}} as unknown as Browser));
    const result = await runFixturePresentationDiagnostic(() => {});
    mock.mock.restore();
    assert.equal(result.outcome, decision === "ready" ? "confirmed" : "failure");
    assert.equal(result.failureCode, decision === "ready" ? null : "cancelled");
    assert.equal(result.providerExecution, false); assert.equal(result.applicationSubmission, false);
    assert.equal(result.localRequests, 1); assert.equal(result.blockedRequests, 0);
    assert.deepEqual(result.teardown, {context: true, browser: true, server: true});
    assert.ok(closed && browserClosed && detached >= 3);
    assert.ok(result.samples.some(sample => sample.phase === "before_foreground"));
    assert.ok(result.samples.some(sample => sample.phase === "after_foreground"));
  }
});

test("presentation setup errors are closed and no server survives", async t => {
  const canary = "private-launch-error-canary";
  t.mock.method(chromium, "launch", async () => {throw Error(canary);});
  const result = await runFixturePresentationDiagnostic(() => {});
  assert.equal(result.outcome, "failure"); assert.equal(result.confirmedAt, null);
  assert.equal(result.phase, "setup"); assert.equal(result.failureCode, "diagnostic_failed");
  assert.deepEqual(result.teardown, {context: true, browser: true, server: true});
  assert.equal(JSON.stringify(result).includes(canary), false);
});

test("local presentation selector and exclusive report claim reject before any browser launch", async () => {
  const directory = await mkdtemp(join(tmpdir(), "presentation-offline-"));
  try {
    const report = join(directory, "report.json"), claim = report + ".claim.json";
    const invoke = (env: Record<string, string>) => spawnSync(process.execPath,
      ["--test", new URL("./fixture-presentation-live.test.js", import.meta.url).pathname],
      {env, encoding: "utf8", timeout: 10_000});
    assert.match(invoke({BROWSERDRIVER_FIXTURE_VISIBILITY_TEST: "1"}).stdout, /fixture_presentation_selection_invalid/u);
    assert.match(invoke({BROWSERDRIVER_FIXTURE_VISIBILITY_REPORT: report}).stdout, /fixture_presentation_selection_invalid/u);
    const env = {BROWSERDRIVER_FIXTURE_VISIBILITY_TEST: "1", BROWSERDRIVER_FIXTURE_VISIBILITY_REPORT: report, BROWSERDRIVER_FIXTURE_VISIBILITY_REPORT_VERSION: "browserdriver.fixture-presentation.v2"};
    for (const version of [undefined, "browserdriver.fixture-presentation.v1", "unsupported"]) {
      const stale = {...env};
      if (version === undefined) delete (stale as Record<string, string>).BROWSERDRIVER_FIXTURE_VISIBILITY_REPORT_VERSION;
      else stale.BROWSERDRIVER_FIXTURE_VISIBILITY_REPORT_VERSION = version;
      assert.match(invoke(stale).stdout, /fixture_presentation_selection_invalid/u);
      await assert.rejects(readFile(claim), {code: "ENOENT"});
      await assert.rejects(readFile(report), {code: "ENOENT"});
    }
    await writeFile(claim, "consumed\n");
    assert.match(invoke(env).stdout, /fixture_presentation_claim_failed/u);
    assert.equal(await readFile(claim, "utf8"), "consumed\n");
    await assert.rejects(readFile(report), {code: "ENOENT"});
    await rm(claim); await writeFile(report, "preserved\n");
    assert.match(invoke(env).stdout, /fixture_presentation_claim_failed/u);
    assert.equal(await readFile(report, "utf8"), "preserved\n");
    await assert.rejects(readFile(claim), {code: "ENOENT"});
  } finally {await rm(directory, {recursive: true, force: true});}
});
