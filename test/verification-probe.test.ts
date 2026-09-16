import assert from "node:assert/strict";
import test from "node:test";
import { parseInput, DriverFailure } from "../src/protocol.js";
import { runFakeProbe, probeCanary } from "./verification-probe-fixture.js";

test("v7 accepts only complete verification-only requests before browser launch", async()=>{
 const {request} = await runFakeProbe("unstarted");
 assert.deepEqual(parseInput(JSON.stringify(request)),request);
 for(const key of Object.keys(request)) {
  const missing = {...request} as Record<string,unknown>;delete missing[key];
  assert.throws(()=>parseInput(JSON.stringify(missing)),DriverFailure);
 }
 for(const change of [{version:"udon.browser-driver.v9"},{type:"register"},{type:"close"},{credentialBindings:{}},{input:{}},{profile:null},{allowedOrigins:[null]}]) assert.throws(()=>parseInput(JSON.stringify({...request,...change})),DriverFailure);
});

test("v7 exports closed diagnostics after teardown on readiness, timeout and API failure for every provider", async()=>{
 for(const provider of ["turnstile","recaptcha_v2","hcaptcha"] as const) {
  for(const scenario of ["ready","timeout","api_exception"] as const) {
   const {messages,closed}=await runFakeProbe(scenario,provider);
   assert.equal(closed,true);
   const final=messages.at(-1)!;
   assert.equal(final.result,scenario==="ready"?"success":"failure");
   if(scenario!=="ready") assert.equal(final.failureCode,scenario==="timeout"?"verification_timeout":"verification_failed");
   const diagnostic=messages.at(-2)!;
   assert.equal(diagnostic.type,"verification_diagnostics");
   const payload=diagnostic.diagnostics as {observations: Array<{reason:string}>,shutdown:object};
   assert.equal(payload.observations.at(-1)!.reason,scenario==="ready"?"response_ready":scenario==="timeout"?"visible_frame":"api_exception");
   assert.deepEqual(payload.shutdown,{started:true,contextClosed:true,requestsDisposed:true,callbacksJoined:true});
   assert.equal(messages.at(-3)!.type,"verification_progress");
   assert.ok(messages.every(m=>m.version==="udon.browser-driver.v7"));
   assert.equal(JSON.stringify(messages).includes(probeCanary),false);
  }
 }
});

test("probe preserves the guard failure over generic navigation errors and separates shutdown failures", async()=>{
 const policy=await runFakeProbe("policy");
 assert.equal(policy.messages.at(-1)!.failureCode,"verification_policy");
 const details=policy.messages.at(-2)!.diagnostics as {firstFailure:{reason:string},shutdown:object};
 assert.equal(details.firstFailure.reason,"unapproved_destination");
 assert.equal(JSON.stringify(policy.messages).includes(probeCanary),false);
 const shutdown=await runFakeProbe("shutdown");
 assert.equal(shutdown.messages.at(-1)!.failureCode,"driver_error");
 assert.equal((shutdown.messages.at(-2)!.diagnostics as {shutdown:{contextClosed:boolean}}).shutdown.contextClosed,false);
 const early=await runFakeProbe("unstarted");
 assert.equal(early.closed,false);
 assert.equal(early.messages[0]!.diagnostics,null);
 assert.equal(early.messages[0]!.counts,null);
 assert.equal(early.messages[1]!.failureCode,"invalid_response");
});

test("legacy v6 verification output does not gain diagnostic fields or messages",async()=>{
 const {messages}=await runFakeProbe("ready","turnstile","udon.browser-driver.v6");
 assert.ok(messages.every(m=>m.version==="udon.browser-driver.v6"&&!('diagnostics' in m)));
 assert.ok(messages.every(m=>m.type==="verification_progress"||m.type==="result"));
 assert.deepEqual(messages.at(-1)!.response,{verification:"ready",teardown:"complete",applicationPosts:0});
});
