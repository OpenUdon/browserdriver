import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { PersistentBrowserDriver } from "../src/driver.js";
import { inputForm, revisedInput } from "./registration-input-fixture.js";
import { verificationRequest } from "./verification-fixture.js";
import type { VerificationDescriptor, VerifyMessage } from "../src/protocol.js";

// Entirely loopback: fixed synthetic provider APIs stand in for provider
// acceptance. No production/test-key provider endpoint is contacted.
test("v6 synthetic providers, delayed invisible callbacks, readiness loss, cancellation and diagnostic teardown", {skip:process.env.BROWSERDRIVER_VERIFICATION_LIVE_TEST!=="1",timeout:180_000}, async()=>{
 let provider:VerificationDescriptor["provider"]="turnstile", activation:VerificationDescriptor["activation"]="before_approval";
 let scenario="ready", posts=0;
 const markers={turnstile:"cf-turnstile",recaptcha_v2:"g-recaptcha",hcaptcha:"h-captcha"};
 const names={turnstile:"cf-turnstile-response",recaptcha_v2:"g-recaptcha-response",hcaptcha:"h-captcha-response"};
 const apis={turnstile:"turnstile",recaptcha_v2:"grecaptcha",hcaptcha:"hcaptcha"};
 const canary="verification-response-canary-never-export";
 const server=createServer((req,res)=>{
  if(req.method==="POST") {posts++;req.resume();res.writeHead(303,{location:"/complete"}).end();return;}
  if(req.url==="/complete") {res.writeHead(200,{"content-type":"text/html"}).end('<div role="status" aria-label="Created">Created</div>');return;}
  if(req.url!=="/register"){res.writeHead(404).end();return;}
  const widget=scenario==="missing"?"":`<div class="${markers[provider]}"></div><input type="hidden" name="${names[provider]}" value="">`;
  const shadows=["action","method","target","contains","append","submit"].map(name=>`<input type="hidden" name="${name}" value="named-control-canary">`).join("");
  const unsupportedShadow=["dom_api_shadow","dom_click_shadow"].includes(scenario)?`<input type="hidden" name="${scenario==="dom_api_shadow"?"getAttribute":"hasAttribute"}" value="named-control-canary">`:"";
  let html=inputForm.replace('<button type="submit">','<button type="submit" name="intent" value="register">').replace('action="/complete"','action="/register"').replace('</form>',shadows+unsupportedShadow+widget+(scenario==="ambiguous"?widget:"")+"</form>");
  if(scenario==="form_action")html=html.replace('action="/register"','action="/other"');
  if(scenario==="form_method")html=html.replace('method="post"','method="get"');
  if(scenario==="form_target")html=html.replace('<form ','<form target="_blank" ');
  for(const [name,value] of [["formaction","/other"],["formmethod","get"],["formtarget","_blank"]]) {
   if(scenario===name)html=html.replace('<button type="submit"',`<button ${name}="${value}" type="submit"`);
  }
  const script=`<script>
   const responseField=document.querySelector('[name="${names[provider]}"]');
   let responseValue='', expiryStarted=false;
   const ready=()=>{responseValue='${canary}';if(responseField)responseField.value=responseValue;};
   window.${apis[provider]}={getResponse:()=>{if('${scenario}'==='rejected')throw Error('private-provider-prose');if(['expired','rebind'].includes('${scenario}')&&responseValue&&!expiryStarted){expiryStarted=true;setTimeout(()=>{if('${scenario}'==='rebind'){const widget=document.querySelector('.${markers[provider]}');widget.replaceWith(widget.cloneNode());}else{responseValue='';if(responseField)responseField.value='';}},150);}return responseValue;},isExpired:()=>false};
   if('${scenario}'==='blocked')delete window.${apis[provider]};
   if('${activation}'==='before_approval'&& !['blocked','rejected'].includes('${scenario}'))setTimeout(ready,100);
   if('${activation}'==='approved_submit')document.querySelector('form').addEventListener('submit',event=>{
    event.preventDefault();
    if('${scenario}'==='forged'){
     const binding=Object.keys(window).find(key=>key.startsWith('__udon_verification_'));
     window[binding]('ready').then(()=>HTMLFormElement.prototype.submit.call(document.querySelector('form'))).catch(()=>{});return;
    }
    if('${scenario}'==='premature'){HTMLFormElement.prototype.submit.call(document.querySelector('form'));return;}
    setTimeout(()=>{ready();HTMLFormElement.prototype.submit.call(document.querySelector('form'));if('${scenario}'==='duplicate')HTMLFormElement.prototype.submit.call(document.querySelector('form'));},250);
   });
   window.expireSynthetic=()=>{responseValue='replacement-'+responseValue;if(responseField)responseField.value=responseValue;};
  </script>`;
  res.writeHead(200,{"content-type":"text/html"}).end(html+script);
 });
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 const address=server.address();assert.ok(address&&typeof address==="object");const origin=`http://127.0.0.1:${address.port}`;
 const messages:Array<Record<string,unknown>>=[];
 const allMessages:Array<Record<string,unknown>>=[];
 let active=verificationRequest(provider,activation,origin);
 const source={next:async()=>{
  const pending=messages.at(-1)!;
  if(pending.type==="registration_input_checkpoint")return {done:false as const,value:JSON.stringify({version:active.version,type:"registration_input_response",requestId:pending.requestId,checkpointId:pending.checkpointId,decision:"apply",input:revisedInput(active)})};
  if(["expired","rebind"].includes(scenario)&&pending.kind==="submit_approval")await new Promise(resolve=>setTimeout(resolve,300));
  return {done:false as const,value:JSON.stringify({version:active.version,type:"registration_checkpoint_response",requestId:pending.requestId,checkpointId:pending.checkpointId,decision:scenario==="cancel"?"deny":"continue",inputRevision:pending.inputRevision,inputSha256:pending.inputSha256})};
 }};
 const driver=new PersistentBrowserDriver(source,message=>{messages.push(message as Record<string,unknown>);allMessages.push(message as Record<string,unknown>);},{headed:true});
 try {
  let serial=0;
  for(provider of ["turnstile","recaptcha_v2","hcaptcha"] as const){for(activation of ["before_approval","approved_submit"] as const){
   scenario="ready";active=verificationRequest(provider,activation,origin);active.requestId=`verification_${++serial}`;active.operationId=active.requestId;
   const before=posts;messages.length=0;await driver.register(active);
   assert.equal(messages.at(-1)!.result,"success",`${provider}/${activation}: ${JSON.stringify(messages.map(({type,state,status,failureCode,applicationRequests,applicationPosts})=>({type,state,status,failureCode,applicationRequests,applicationPosts})))}`);assert.equal(posts,before+1);
   const approval=messages.findIndex(m=>m.type==="registration_checkpoint"&&m.kind==="submit_approval");
   const ready=messages.findIndex(m=>m.type==="verification_progress"&&m.state==="ready");
   assert.ok(ready>=0);if(activation==="before_approval")assert.ok(approval>ready);
  }}
  provider="turnstile";
  for(const [next,expected] of [["dom_api_shadow","driver_error"],["dom_click_shadow","driver_error"],["form_action","verification_unsupported"],["form_method","verification_unsupported"],["form_target","verification_unsupported"],["formaction","verification_unsupported"],["formmethod","verification_unsupported"],["formtarget","verification_unsupported"],["missing","verification_unsupported"],["ambiguous","verification_unsupported"],["rejected","verification_failed"],["cancel","registration_checkpoint_denied"],["premature","verification_not_ready"],["forged","verification_not_ready"],["expired","verification_expired"],["rebind","verification_expired"],["blocked","verification_timeout"]]){
   scenario=next!;activation=["premature","forged"].includes(scenario)?"approved_submit":"before_approval";
   active=verificationRequest(provider,activation,origin);active.requestId=`verification_${++serial}`;active.operationId=active.requestId;
   if(scenario==="blocked")active.profile.flows.member!.humanVerification!.dependencies.timeoutMs=1500;
   const before=posts;messages.length=0;await driver.register(active);assert.equal(messages.at(-1)!.failureCode,expected,scenario);assert.equal(posts,before,scenario);
  }
  scenario="duplicate";activation="approved_submit";active=verificationRequest(provider,activation,origin);active.requestId=`verification_${++serial}`;active.operationId=active.requestId;
  const duplicateBefore=posts;messages.length=0;await driver.register(active);
  assert.equal(messages.at(-1)!.result,"failure");assert.ok(posts-duplicateBefore<=1,"duplicate callbacks cannot release a second application POST");
  scenario="ready";activation="before_approval";active=verificationRequest(provider,activation,origin);
  const diagnostic:VerifyMessage={version:"udon.browser-driver.v6",type:"verify",requestId:"diagnostic",sourceDigest:active.sourceDigest,profile:active.profile,flow:active.flow,allowedOrigins:active.allowedOrigins,deadline:active.deadline!};
  const before=posts;messages.length=0;await driver.verify(diagnostic);assert.equal(messages.at(-1)!.result,"success");assert.equal(posts,before);assert.equal(messages.some(m=>m.type==="registration_checkpoint"),false);
  const wire=JSON.stringify(allMessages);for(const secret of [canary,"named-control-canary","synthetic@example.invalid","synthetic-password","private-provider-prose"])assert.equal(wire.includes(secret),false);
 }finally{await driver.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
