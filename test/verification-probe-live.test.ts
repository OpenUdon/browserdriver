import assert from "node:assert/strict";
import { createServer } from "node:http";
import { lstat, writeFile } from "node:fs/promises";
import test from "node:test";
import { PersistentBrowserDriver } from "../src/driver.js";
import type { VerifyMessage } from "../src/protocol.js";
import { verificationRequest } from "./verification-fixture.js";

// Two local contexts, no provider SDK/network, private fields or form submissions.
// Explicitly opt in only after review of the frozen smoke scope.
test("v7 local probe ready/failure diagnostics and zero submissions", {skip:process.env.BROWSERDRIVER_PROBE_LIVE_TEST!=="1",timeout:60_000},async()=>{
 const report=process.env.BROWSERDRIVER_PROBE_SMOKE_REPORT;
 assert.ok(report,"an exclusive report/claim path is required before browser execution");
 await assert.rejects(lstat(report),{code:"ENOENT"});
 await writeFile(`${report}.claim`,JSON.stringify({version:"browserdriver.local-probe-smoke-claim.v1",createdAt:new Date().toISOString(),cases:["ready","api_exception"]})+"\n",{flag:"wx",mode:0o600});
 let scenario:"ready"|"api_exception"="ready", posts=0;
 const canary="local-verification-token-and-error-canary";
 const server=createServer((request,response)=>{
  if(request.method!=="GET"){posts++;request.resume();response.writeHead(405).end();return;}
  if(request.url!=="/register"){response.writeHead(404).end();return;}
  response.writeHead(200,{"content-type":"text/html"}).end(`<!doctype html><title>Local verification diagnostic smoke</title>
   <h1>Local simulated verification</h1><p>Leave this page alone. Do not fill fields or click Submit. The test closes it automatically.</p>
   <form method="post" action="/register"><div class="cf-turnstile"></div><input type="hidden" name="cf-turnstile-response" value="${scenario==="ready"?canary:""}"><button type="submit">Register</button></form>
   <script>window.turnstile={isExpired:()=>false,getResponse:()=>{if('${scenario}'==='api_exception')throw Error('${canary}');return '${canary}';}};</script>`);
 });
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 const address=server.address();assert.ok(address&&typeof address==="object");
 const origin=`http://127.0.0.1:${address.port}`;
 const messages:Record<string,unknown>[]=[];
 const driver=new PersistentBrowserDriver({next:async()=>({done:true,value:undefined})},m=>messages.push(m as Record<string,unknown>),{headed:true});
 const reports:object[]=[];
 try {
  for(scenario of ["ready","api_exception"] as const){
   messages.length=0;
   const input=verificationRequest("turnstile","before_approval",origin);
   input.profile.flows.member!.humanVerification!.dependencies.timeoutMs=10_000;
   const request:VerifyMessage={version:"udon.browser-driver.v7",type:"verify",requestId:"fixture_attempt",sourceDigest:input.sourceDigest,profile:input.profile,flow:input.flow,allowedOrigins:input.allowedOrigins,deadline:new Date(Date.now()+15_000).toISOString()};
   await driver.verify(request);
   const diagnostic=messages.at(-2)!;
   assert.equal(diagnostic.type,"verification_diagnostics");
   const payload=diagnostic.diagnostics as {observations:Array<{reason:string}>,shutdown:object};
   assert.equal(payload.observations.at(-1)!.reason,scenario==="ready"?"response_ready":"api_exception");
   assert.deepEqual(payload.shutdown,{started:true,contextClosed:true,requestsDisposed:true,callbacksJoined:true});
   assert.equal(messages.at(-1)!.result,scenario==="ready"?"success":"failure");
   if(scenario==="api_exception")assert.equal(messages.at(-1)!.failureCode,"verification_failed");
   assert.equal(posts,0);
   assert.equal((diagnostic.counts as {providerRequests:number}).providerRequests,0);
   assert.equal(JSON.stringify(messages).includes(canary),false);
   reports.push({scenario,messages:structuredClone(messages)});
  }
 } finally {await driver.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
 await writeFile(report,JSON.stringify({version:"browserdriver.local-probe-smoke.v1",reports,applicationPosts:posts,closed:true})+"\n",{flag:"wx",mode:0o600});
});
