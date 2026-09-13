import assert from "node:assert/strict";
import test from "node:test";
import type { BrowserContext, Frame, Page, Route } from "playwright";
import { VerificationGuard } from "../src/verification.js";
import { DriverFailure } from "../src/protocol.js";
import { verificationDescriptor } from "./verification-fixture.js";

async function harness(provider:"turnstile"|"recaptcha_v2"|"hcaptcha", budget=256) {
 let routeHandler!:(route:Route)=>Promise<void>;let responseHandler!:(event:object)=>Promise<void>;
 const main={url:()=>"https://registration.example/register",parentFrame:()=>null} as unknown as Frame;
 const context={route:async(_pattern:string,handle:typeof routeHandler)=>{routeHandler=handle;},routeWebSocket:async()=>{},on:()=>{},newCDPSession:async()=>({on:(_event:string,handle:typeof responseHandler)=>{responseHandler=handle},send:async()=>{}})} as unknown as BrowserContext;
 const descriptor=verificationDescriptor(provider);descriptor.dependencies.maxRequests=budget;
 const guard=new VerificationGuard(context,descriptor,new Set(["https://registration.example"]),new Set(["https://registration.example/register","https://registration.example/complete"]),Date.now()+120000);
 await guard.install();await guard.watchRedirects({mainFrame:()=>main} as unknown as Page);
 const request=async(url:string,method="GET",frame=main,navigation=false,body=Buffer.from("synthetic"),status=200,headers:Record<string,string>={},resourceType="fetch")=>{
  let action="",fetches=0;
  const route={request:()=>({url:()=>url,method:()=>method,frame:()=>frame,isNavigationRequest:()=>navigation,resourceType:()=>resourceType}),continue:async()=>{action="continued"},abort:async()=>{action="blocked"},fetch:async(options:{maxRedirects:number,maxRetries:number})=>{fetches++;assert.equal(options.maxRedirects,0);assert.equal(options.maxRetries,0);return {status:()=>status,headers:()=>headers,body:async()=>body,dispose:async()=>{}}},fulfill:async()=>{action="fulfilled"}} as unknown as Route;
  await routeHandler(route);return {action,fetches};
 };
 return {guard,request,main,responseHandler};
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
