import assert from "node:assert/strict";
import test from "node:test";
import type { BrowserContext, Frame, Page, Route } from "playwright";
import { VerificationGuard } from "../src/verification.js";
import { DriverFailure } from "../src/protocol.js";
import { verificationDescriptor } from "./verification-fixture.js";
import { permitsVerificationURL, verificationRedirect } from "../src/verification-policy.js";

async function harness(provider:"turnstile"|"recaptcha_v2"|"hcaptcha", budget=256) {
 let routeHandler!:(route:Route)=>Promise<void>;let responseHandler!:(event:object)=>Promise<void>;
 const main={url:()=>"https://registration.example/register",parentFrame:()=>null} as unknown as Frame;
 const context={route:async(_pattern:string,handle:typeof routeHandler)=>{routeHandler=handle;},routeWebSocket:async()=>{},on:()=>{},request:{dispose:async()=>{}},close:async()=>{},newCDPSession:async()=>({on:(_event:string,handle:typeof responseHandler)=>{responseHandler=handle},send:async()=>{}})} as unknown as BrowserContext;
 const descriptor=verificationDescriptor(provider);descriptor.dependencies.maxRequests=budget;
 const guard=new VerificationGuard(context,descriptor,new Set(["https://registration.example"]),new Set(["https://registration.example/register","https://registration.example/complete"]),Date.now()+120000);
 await guard.install();await guard.watchRedirects({mainFrame:()=>main} as unknown as Page);
 const request=async(url:string,method="GET",frame=main,navigation=false,body=Buffer.from("synthetic"),status=200,headers:Record<string,string>={},resourceType="fetch",fetchError?:Error,sequence?:Array<{status:number;headers:Record<string,string>;body?:Buffer}>)=>{
  let action="",fetches=0;
  const route={request:()=>({url:()=>url,method:()=>method,frame:()=>frame,isNavigationRequest:()=>navigation,resourceType:()=>resourceType}),continue:async()=>{action="continued"},abort:async()=>{action="blocked"},fetch:async(options:{maxRedirects:number,maxRetries:number})=>{fetches++;assert.equal(options.maxRedirects,0);assert.equal(options.maxRetries,0);if(fetchError)throw fetchError;const item=sequence?.[fetches-1];const responseHeaders=item?.headers??headers;return {status:()=>item?.status??status,headers:()=>responseHeaders,headersArray:()=>Object.entries(responseHeaders).map(([name,value])=>({name,value})),body:async()=>item?.body??body,dispose:async()=>{}}},fulfill:async()=>{action="fulfilled"}} as unknown as Route;
  await routeHandler(route);return {action,fetches};
 };
 return {guard,request,main,responseHandler,routeHandler,context};
}

test("provider POSTs have a separate finite allowance and cannot authorize an application mutation",async()=>{
 for(const [provider,url] of [["turnstile","https://challenges.cloudflare.com/turnstile/v0/a"],["recaptcha_v2","https://www.google.com/recaptcha/api2/reload"],["hcaptcha","https://new.hcaptcha.com/checkcaptcha/a"]] as const){
  const h=await harness(provider,2);
  assert.deepEqual(await h.request(url,"POST"),{action:"fulfilled",fetches:1});assert.equal(h.guard.postCount(),0);
  assert.deepEqual(await h.request(url,"GET"),{action:"fulfilled",fetches:1});
  assert.deepEqual(await h.request(url,"POST"),{action:"blocked",fetches:0});
  assert.throws(()=>h.guard.assertSafe(),(e:unknown)=>e instanceof DriverFailure&&e.code==="verification_budget");
  const app=await harness(provider);assert.deepEqual(await app.request("https://registration.example/register","POST"),{action:"blocked",fetches:0});assert.equal(app.guard.postCount(),0);
 }
});

test("readonly provider redirects validate every hop, count all responses and never replay POSTs or change document origins", async () => {
 const url="https://challenges.cloudflare.com/turnstile/v0/api.js";
 const h=await harness("turnstile");
 const result=await h.request(url,"GET",h.main,false,Buffer.from("123"),200,{},"script",undefined,[
  {status:302,headers:{location:"/turnstile/v0/version/api.js"}},
  {status:200,headers:{}},
 ]);
 assert.deepEqual(result,{action:"fulfilled",fetches:2});
 assert.deepEqual(h.guard.counts(),{providerRequests:2,providerPosts:0,providerResponseBytes:6,applicationRequests:0,applicationPosts:0});
 assert.equal(h.guard.diagnostics().network[0]!.reason,"provider_redirect_followed");
 assert.equal(h.guard.diagnostics().firstFailure,null);
 for(const target of ["https://evil.example/turnstile/a","//challenges.cloudflare.com.evil.example/turnstile/a","http://challenges.cloudflare.com/turnstile/a","/outside/","/turnstile/%2e%2e/turnstile/a","/turnstile/a#private","/turnstile/a\\b","https://user@challenges.cloudflare.com/turnstile/a","https://challenges.cloudflare.com:444/turnstile/a"]){
  assert.equal(verificationRedirect("turnstile",url,target,"GET",false),null,target);
 }
 assert.equal(permitsVerificationURL("turnstile","https://challenges.cloudflare.com/turnstile/%2e%2e/turnstile/a","GET"),false);
 for(const [method,navigation] of [["POST",false],["GET",true]] as const){
  const blocked=await harness("turnstile");
  const child={url:()=>url,parentFrame:()=>blocked.main} as unknown as Frame;
  assert.deepEqual(await blocked.request(url,method,navigation?child:blocked.main,navigation,Buffer.alloc(0),307,{location:"/turnstile/v0/new.js"}),{action:"blocked",fetches:1});
 }
 const escape=await harness("turnstile");
 assert.deepEqual(await escape.request(url,"GET",escape.main,false,Buffer.alloc(0),200,{},"script",undefined,[
  {status:302,headers:{location:"/turnstile/v0/new.js"}},
  {status:302,headers:{location:"https://evil.example/"}},
 ]),{action:"blocked",fetches:2});
 const loop=await harness("turnstile");
 assert.deepEqual(await loop.request(url,"GET",loop.main,false,Buffer.alloc(0),302,{location:url}),{action:"blocked",fetches:1});
 assert.equal(loop.guard.diagnostics().firstFailure?.reason,"provider_redirect_limit");
 const limited=await harness("turnstile",1);
 assert.deepEqual(await limited.request(url,"GET",limited.main,false,Buffer.alloc(0),302,{location:"/turnstile/v0/new.js"}),{action:"blocked",fetches:1});
 assert.throws(()=>limited.guard.assertSafe(),(error:unknown)=>error instanceof DriverFailure&&error.code==="verification_budget");
 const hops=await harness("turnstile");
 assert.deepEqual(await hops.request(url,"GET",hops.main,false,Buffer.alloc(0),200,{},"script",undefined,
  Array.from({length:6},(_,i)=>({status:302,headers:{location:`/turnstile/v0/${i}.js`}}))),{action:"blocked",fetches:6});
 assert.equal(hops.guard.diagnostics().firstFailure?.reason,"provider_redirect_limit");
});

test("provider ancestry ignores only fragments and diagnoses invalid ancestors without exporting their values",async()=>{
 const url="https://new.hcaptcha.com/checkcaptcha/a",canary="private-fragment-canary";
 const h=await harness("hcaptcha");
 const child={url:()=>`https://assets.hcaptcha.com/captcha.html#${canary}`,parentFrame:()=>h.main} as unknown as Frame;
 const nested={url:()=>`https://new.hcaptcha.com/frame#${canary}`,parentFrame:()=>child} as unknown as Frame;
 assert.equal((await h.request(url,"POST",nested)).action,"fulfilled");
 for(const raw of ["about:blank","about:srcdoc","https://hcaptcha.com.evil.example/#https://hcaptcha.com","https://assets.hcaptcha.com/%2e%2e/frame#private","https://user@hcaptcha.com/#private"]){
  const bad=await harness("hcaptcha");
  assert.equal((await bad.request(url,"POST",{url:()=>raw,parentFrame:()=>bad.main} as unknown as Frame)).fetches,0);
  assert.equal(bad.guard.diagnostics().firstFailure?.frameFailure,"ancestor_url");
 }
 const detached=await harness("hcaptcha");
 await detached.request(url,"GET",{url:()=>url,parentFrame:()=>null} as unknown as Frame);
 assert.equal(detached.guard.diagnostics().firstFailure?.frameFailure,"unattached");
 const deep=await harness("hcaptcha");let frame=deep.main;
 for(let i=0;i<9;i++){const parent=frame;frame={url:()=>url,parentFrame:()=>parent} as unknown as Frame;}
 await deep.request(url,"GET",frame);
 assert.equal(deep.guard.diagnostics().firstFailure?.frameFailure,"ancestor_depth");
 assert.equal(JSON.stringify(h.guard.diagnostics()).includes(canary),false);
});

test("shutdown blocks new admissions, cancels and joins in-flight fetches, and preserves active failures",async()=>{
 const h=await harness("turnstile");
 let rejectFetch!:(error:Error)=>void, entered!:()=>void, fetchDone=false;
 const started=new Promise<void>(resolve=>{entered=resolve;});
 h.context.request.dispose=async()=>{rejectFetch(new Error("private-cancel-prose"));};
 const url="https://challenges.cloudflare.com/turnstile/v0/api.js";
 const pending=h.routeHandler({request:()=>({url:()=>url,method:()=>"GET",frame:()=>h.main,isNavigationRequest:()=>false,resourceType:()=>"script"}),
  fetch:async()=>{entered();return new Promise((_,reject)=>{rejectFetch=reject;});},abort:async()=>{fetchDone=true;},
 } as unknown as Route);
 await started;
 const closing=h.guard.close();
 assert.deepEqual(await h.request("https://registration.example/register","POST"),{action:"blocked",fetches:0});
 await closing;await pending;
 assert.equal(fetchDone,true);assert.equal(h.guard.postCount(),0);
 assert.deepEqual(h.guard.diagnostics().shutdown,{started:true,contextClosed:true,requestsDisposed:true,callbacksJoined:true});
 assert.equal(h.guard.diagnostics().firstFailure,null);
 assert.ok(h.guard.diagnostics().network.every(event=>event.phase==="shutdown"));
 assert.equal(JSON.stringify(h.guard.diagnostics()).includes("private-cancel-prose"),false);
 assert.equal(h.guard.close(),closing);
 assert.throws(()=>h.guard.beginSubmit());
 const failed=await harness("turnstile");
 await failed.request(url,"POST",failed.main,false,Buffer.alloc(0),302,{location:"/turnstile/next"});
 const first=failed.guard.diagnostics().firstFailure;
 await assert.rejects(failed.guard.close(),(error:unknown)=>error instanceof DriverFailure&&error.code==="verification_policy");
 assert.deepEqual(failed.guard.diagnostics().firstFailure,first);
 const broken=await harness("turnstile");broken.context.close=async()=>{throw new Error("private-close-prose");};
 await assert.rejects(broken.guard.close(),(error:unknown)=>error instanceof DriverFailure&&error.code==="driver_error");
 assert.equal(broken.guard.diagnostics().shutdown.contextClosed,false);
});

test("provider frame authority is rechecked after a response arrives",async()=>{
 const h=await harness("hcaptcha");let observations=0;
 const frame={url:()=>++observations<=2?"https://assets.hcaptcha.com/frame#private":"https://evil.example/frame",parentFrame:()=>h.main} as unknown as Frame;
 assert.deepEqual(await h.request("https://new.hcaptcha.com/checkcaptcha/a","POST",frame),{action:"blocked",fetches:1});
 assert.equal(h.guard.diagnostics().firstFailure?.frameFailure,"ancestor_url");
});

test("network diagnostics distinguish provider redirects, transport failures, frame rejection and dropped reads without URL values", async () => {
 const canary="secret-token-and-error-canary";
 const url=`https://challenges.cloudflare.com/turnstile/v0/${canary}?response=${canary}`;
 const redirected=await harness("turnstile");
 await redirected.request(url,"GET",redirected.main,false,Buffer.alloc(0),302,{location:`https://${canary}.example/`});
 assert.equal(redirected.guard.diagnostics().firstFailure?.reason,"provider_redirect_target");
 assert.equal(redirected.guard.diagnostics().firstFailure?.status,"3xx");
 const transport=await harness("turnstile");
 await transport.request(url,"GET",transport.main,false,Buffer.alloc(0),0,{},"script",new Error(`ECONNRESET ${canary}`));
 assert.equal(transport.guard.diagnostics().firstFailure?.reason,"response_transport");
 assert.equal(transport.guard.diagnostics().firstFailure?.transport,"connection");
 const framed=await harness("turnstile");
 await framed.request(url,"GET",{url:()=>`https://${canary}.example`,parentFrame:()=>framed.main} as unknown as Frame);
 assert.equal(framed.guard.diagnostics().firstFailure?.reason,"provider_frame");
 const dropped=await harness("turnstile");
 await dropped.request(`https://${canary}.example/script.js`);
 assert.equal(dropped.guard.diagnostics().network.at(-1)?.reason,"unapproved_read");
 assert.equal(dropped.guard.diagnostics().firstFailure,null);
 assert.doesNotThrow(()=>dropped.guard.assertSafe());
 for(const h of [redirected,transport,framed,dropped])assert.equal(JSON.stringify(h.guard.diagnostics()).includes(canary),false);
});

test("redirects, unapproved frames, top-level provider navigation, byte overruns and persistent responses stop",async()=>{
 const url="https://challenges.cloudflare.com/turnstile/v0/a";
 for(const scenario of ["redirect","frame","top","bytes","channel","download"]){
  const h=await harness("turnstile");let result;
  if(scenario==="redirect")result=await h.request(url,"GET",h.main,false,Buffer.alloc(0),302,{location:"https://evil.example/escape"});
  if(scenario==="frame")result=await h.request(url,"GET",{url:()=>"https://evil.example/",parentFrame:()=>h.main} as unknown as Frame);
  if(scenario==="top")result=await h.request(url,"GET",h.main,true);
  if(scenario==="bytes")result=await h.request(url,"GET",h.main,false,Buffer.from("synthetic"),200,{"content-length":String(33<<20)});
  if(scenario==="channel")result=await h.request(url,"GET",h.main,false,Buffer.from("synthetic"),200,{"content-type":"text/event-stream"});
  if(scenario==="download")result=await h.request(url,"GET",h.main,false,Buffer.from("synthetic"),200,{"content-disposition":"attachment"});
  assert.equal(result!.action,"blocked",scenario);assert.throws(()=>h.guard.assertSafe(),DriverFailure);
 }
 const h=await harness("turnstile");const child={url:()=>url,parentFrame:()=>h.main} as unknown as Frame;
 assert.equal((await h.request(url,"GET",child,true)).action,"fulfilled");
 const nested={url:()=>url,parentFrame:()=>child} as unknown as Frame;assert.equal((await h.request(url,"POST",nested)).action,"fulfilled");
 assert.equal(h.guard.postCount(),0);
 const stream=await harness("turnstile");
 assert.deepEqual(await stream.request("https://registration.example/events","GET",stream.main,false,Buffer.alloc(0),200,{},"eventsource"),{action:"blocked",fetches:0});
});
