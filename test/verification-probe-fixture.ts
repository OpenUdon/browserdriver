// Browser-free protocol harness: only the Playwright boundary is simulated.
// The real driver, guard, state machine and diagnostic reducer execute.
import type { BrowserContext, Route } from "playwright";
import { PersistentBrowserDriver } from "../src/driver.js";
import type { VerifyMessage } from "../src/protocol.js";
import { verificationRequest } from "./verification-fixture.js";

export const probeCanary = "private-token-credential-provider-error-canary";
export type ProbeScenario = "ready" | "timeout" | "api_exception" | "policy" | "shutdown" | "unstarted";
export async function runFakeProbe(scenario: ProbeScenario, provider: "turnstile" | "recaptcha_v2" | "hcaptcha" = "turnstile", version: VerifyMessage["version"] = "udon.browser-driver.v7") {
 const input = verificationRequest(provider), flow = input.profile.flows.member!;
 if (scenario === "timeout") flow.humanVerification!.dependencies.timeoutMs = 25;
 const request: VerifyMessage = {version, type:"verify", requestId:"fixture_attempt", sourceDigest:input.sourceDigest, profile:input.profile, flow:input.flow, allowedOrigins:input.allowedOrigins, deadline:input.deadline!};
 let routeHandler!: (route: Route) => Promise<void>;
 let closed = false;
 const observation = scenario === "api_exception" ? {state:"failed",reason:"api_exception",responseKind:"unobserved"} : scenario === "timeout" ? {state:"awaiting_interaction",reason:"visible_frame",responseKind:"string"} : {state:"ready",reason:"response_ready",responseKind:"string"};
 const locator = {first:()=>locator, waitFor:async()=>{}, count:async()=>1,
  elementHandle:async()=>({evaluateHandle:async()=>({evaluate:async()=>({...observation, response:probeCanary})})})};
 const main = {url:()=>"https://registration.example/register",parentFrame:()=>null};
 const page = {mainFrame:()=>main, bringToFront:async()=>{}, getByRole:()=>locator,
  goto:async()=>{
   if(scenario!=="policy")return;
   await routeHandler({request:()=>({url:()=>`https://unapproved.example/${probeCanary}`,method:()=>"POST",resourceType:()=>"fetch",frame:()=>main,isNavigationRequest:()=>false}),abort:async()=>{}} as unknown as Route);
   throw Error(probeCanary);
  }};
 const context = {route:async(_pattern:string, handle:typeof routeHandler)=>{routeHandler=handle;},routeWebSocket:async()=>{},on:()=>{},exposeBinding:async()=>{},newPage:async()=>page,
  request:{dispose:async()=>{}},close:async()=>{closed=true;if(scenario==="shutdown")throw Error(probeCanary);},
  newCDPSession:async()=>({on:()=>{},send:async()=>{}})} as unknown as BrowserContext;
 const messages: Record<string,unknown>[] = [];
 const driver = new PersistentBrowserDriver({next:async()=>({done:true,value:undefined})},m=>messages.push(m as Record<string,unknown>),{headed:scenario!=="unstarted"});
 Object.defineProperty(driver,"createContext",{value:async()=>context});
 await driver.verify(request);
 return {messages,closed,request};
}
