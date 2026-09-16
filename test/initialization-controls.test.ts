// Maintained controls promoted from the private investigation; no private inputs.
import assert from 'node:assert/strict';
import test from 'node:test';
import type {BrowserContext,Page,Route} from 'playwright';
import type {VerificationDescriptor} from '../src/protocol.js';
import type {VerificationDiagnostics} from '../src/verification-diagnostics.js';
import {createContext,runInContext} from 'node:vm';
import {installLifecycleObserver,reduceLifecycle} from '../src/verification-lifecycle.js';
import {browserVerificationProbe,VerificationGuard} from '../src/verification.js';
import {permitsVerificationURL,verificationRedirect,VerificationSubmission} from '../src/verification-policy.js';
const canary='synthetic-private-response-canary';
const origin='https://registration.example';
const script='https://challenges.cloudflare.com/turnstile/v0/api.js';
const descriptor=(): VerificationDescriptor=>({provider:'turnstile',activation:'before_approval',widgetBinding:'single_in_submit_form',submissionURL:origin+'/register',dependencies:{policy:'turnstile.v1',maxRequests:256,maxResponseBytes:33554432,timeoutMs:120000}});
function realm(observed=true) {
  class Element {isConnected=true; getAttribute(){return null;} matches(){return true;}}
  const widget=new Element(),form={},field={form,value:''};let responsePresent=false;
  const prototype={};for(const [key,value] of Object.entries({action:descriptor().submissionURL,method:'post',target:''}))Object.defineProperty(prototype,key,{get:()=>value});
  const context=createContext({Element,HTMLFormElement:{prototype},Node:{prototype:{contains:()=>true}},
    document:{querySelectorAll:(s: string)=>s.startsWith('.cf-')?[widget]:responsePresent?[field]:[],querySelector:()=>widget},
    MutationObserver:class {observe(){}}, element:{form,isConnected:true,type:'submit',hasAttribute:()=>false},
    options:{provider:'turnstile',submissionURL:descriptor().submissionURL,frameVisibility:'unavailable'},binding:{form,widget},widget});
  runInContext('window=globalThis; top=globalThis;',context);
  if(observed)runInContext(`(${installLifecycleObserver.toString()})('observer')`,context);
  const evaluate=(code: string)=>runInContext(code,context);
  const probe=()=>JSON.parse(JSON.stringify(evaluate(`(${browserVerificationProbe.toString()})(element,options,binding)`)));
  const publish=()=>evaluate('window.turnstile={getResponse(){return undefined},isExpired(){return false},render(){return 1}}');
  return {context,evaluate,probe,publish,field,renderField:()=>{responsePresent=true;},sample:()=>reduceLifecycle(evaluate('observer(widget)'))};
}
async function routes(expanded=true) {
  let handler!: (route: Route)=>Promise<void>;const installed: Array<{fn: Function;key: unknown}>=[];
  const main={url:()=>origin+'/register',parentFrame:()=>null};
  const context={addInitScript:async(fn: Function,key: unknown)=>{installed.push({fn,key});},route:async(_: string,fn: typeof handler)=>{handler=fn;},routeWebSocket:async()=>{},on:()=>{},request:{dispose:async()=>{}},close:async()=>{},newCDPSession:async()=>({on:()=>{},send:async()=>{}})};
  const guard=new VerificationGuard(context as unknown as BrowserContext,descriptor(),new Set([origin]),new Set([origin+'/register']),Date.now()+120000,true,expanded);
  await guard.install();await guard.watchRedirects({mainFrame:()=>main} as unknown as Page);
  const request=async(url: string,{method='GET',navigation=false,sequence=[{status:200,headers:{},body:Buffer.from('synthetic-body')}]}: {method?:string;navigation?:boolean;sequence?:Array<{status:number;headers:Record<string,string>;body?:Buffer}>}={})=>{
    let action='',fetches=0,disposed=0;const requested: Array<string|undefined>=[];
    await handler({request:()=>({url:()=>url,method:()=>method,frame:()=>main,isNavigationRequest:()=>navigation,resourceType:()=> 'script'}),
      continue:async()=>{action='continued'},abort:async()=>{action='blocked'},
      fetch:async (options: NonNullable<Parameters<Route['fetch']>[0]>)=>{assert.equal(options.maxRedirects,0);assert.equal(options.maxRetries,0);requested.push(options.url);const item=sequence[fetches++];assert.ok(item);return {status:()=>item.status,headers:()=>item.headers,headersArray:()=>Object.entries(item.headers).map(([name,value])=>({name,value})),body:async()=>item.body??Buffer.alloc(0),dispose:async()=>{disposed++}}},
      fulfill:async()=>{action='fulfilled'}} as unknown as Route);
    return {action,fetches,disposed,requested};
  };
  const close=async(failure=false)=>{if(failure)await assert.rejects(guard.close());else await guard.close();assert.equal(guard.postCount(),0);assert.deepEqual(guard.diagnostics().shutdown,{started:true,contextClosed:true,requestsDisposed:true,callbacksJoined:true});assert.equal(JSON.stringify(guard.diagnostics()).includes(canary),false);};
  return {guard,request,close,installed};
}

test('v8 guard installs the exact lifecycle initializer; legacy guard does not',async()=>{
  for(const expanded of [false,true]){const h=await routes(expanded);assert.equal(h.installed.length,expanded?1:0);if(expanded)assert.equal(h.installed[0]!.fn,installLifecycleObserver);await h.close();}
});
test('observer preserves pre-SDK absence, membership and descriptor',()=>{
  for(const observed of [false,true]){const h=realm(observed);assert.equal(h.evaluate('Object.hasOwn(window,"turnstile")'),false);assert.equal(h.evaluate('"turnstile" in window'),false);assert.equal(h.evaluate('typeof window.turnstile'),'undefined');assert.equal(h.evaluate('Object.getOwnPropertyDescriptor(window,"turnstile")'),undefined);assert.equal(h.probe().reason,'api_loading');}
});
test('synthetic existence-guarded initialization succeeds both with and without observer',()=>{
  for(const guard of ['"turnstile" in window','Object.hasOwn(window,"turnstile")'])for(const observed of [false,true]){
    const h=realm(observed);h.evaluate(`if (!(${guard})) window.turnstile={getResponse(){return undefined},isExpired(){return false}};`);
    assert.equal(h.probe().reason,'response_pending');
  }
});
test('truthiness and typeof initialization guards work with and without observer',()=>{
  for(const guard of ['!window.turnstile','typeof window.turnstile === "undefined"'])for(const observed of [false,true]){
    const h=realm(observed);h.evaluate(`if (${guard}) window.turnstile={getResponse(){return undefined},isExpired(){return false}};`);assert.equal(h.probe().reason,'response_pending');
  }
});
test('ordinary assignment and defineProperty publication retain usable response API',()=>{
  for(const mode of ['assignment','defineProperty']){const h=realm();if(mode==='assignment')h.publish();else h.evaluate('Object.defineProperty(window,"turnstile",{value:{getResponse(){return undefined},isExpired(){return false}},writable:true,configurable:true})');assert.equal(h.probe().reason,'response_pending');h.renderField();assert.equal(h.probe().reason,'no_visible_frame');assert.equal(h.sample().availability,'unavailable');}
});
test('API availability, SDK hook coverage, response matching and expiry remain distinct',()=>{
  const h=realm();assert.equal(h.probe().reason,'api_loading');h.context.turnstile={getResponse:7};assert.equal(h.probe().reason,'api_loading');h.publish();h.renderField();assert.equal(h.probe().responseKind,'undefined');assert.equal(h.sample().availability,'unavailable');
  h.context.turnstile.getResponse=()=>canary;h.field.value=canary;assert.equal(h.probe().state,'ready');assert.equal(JSON.stringify(h.probe()).includes(canary),false);
  h.field.value='different';assert.equal(h.probe().reason,'response_mismatch');h.field.value=canary;h.context.turnstile.isExpired=()=>true;assert.equal(h.probe().reason,'provider_expired');
});
test('modeled five same-origin scripts and standard SDK script are admitted without an external policy expansion',async()=>{
  const h=await routes();const rows=[];
  for(const raw of ['/version/a.js','/version/b.js','/version/c.js','/version/d.js','/version/e.js',script]){const url=new URL(raw,origin).href;const result=await h.request(url);rows.push(result.action);assert.equal(result.action,url.startsWith(origin+'/')?'continued':'fulfilled');}
  assert.equal(rows.length,6);assert.equal(rows.filter(x=>x==='fulfilled').length,1);await h.close();
});
test('provider path/query and redirect controls keep exact origin and scheme boundaries',()=>{
  for(const url of [script,script+'?render=explicit',script+'?onload=syntheticCallback','https://challenges.cloudflare.com/cdn-cgi/challenge-platform/synthetic'])assert.equal(permitsVerificationURL('turnstile',url,'GET'),true);
  for(const url of ['http://challenges.cloudflare.com/turnstile/v0/api.js','https://challenges.cloudflare.com.evil.example/turnstile/v0/api.js','https://challenges.cloudflare.com/unapproved/api.js','https://challenges.cloudflare.com/turnstile/%2fapi.js'])assert.equal(permitsVerificationURL('turnstile',url,'GET'),false);
  assert.equal(verificationRedirect('turnstile',script,'/turnstile/v0/synthetic.js','GET',false),'https://challenges.cloudflare.com/turnstile/v0/synthetic.js');assert.equal(verificationRedirect('turnstile',script,'https://unapproved.example/api.js','GET',false),null);
});
test('mock blocked script plus provider redirect and 2xx reproduce all retained network classes',async()=>{
  const h=await routes();const blocked=await h.request('https://unapproved.example/'+canary+'.js');assert.equal(blocked.action,'blocked');assert.equal(blocked.fetches,0);h.guard.assertSafe();
  const received=await h.request(script,{sequence:[{status:302,headers:{location:'/turnstile/v0/synthetic.js'}},{status:200,headers:{},body:Buffer.from('synthetic-body')}]});assert.equal(received.action,'fulfilled');assert.equal(received.fetches,2);assert.equal(received.disposed,2);
  const actual=h.guard.diagnostics() as ReturnType<VerificationDiagnostics["snapshotV4"]>;assert.deepEqual(actual.network.map(e=>[e.reason,e.endpoint,e.status]),[['unapproved_read','unapproved','none'],['provider_redirect_followed','turnstile_script','3xx'],['response','turnstile_script','2xx']]);assert.equal(actual.summary.counters.reduce((n,r)=>n+r.blockedReads,0),1);assert.equal(actual.firstFailure,null);assert.equal(actual.omittedNetworkEvents,0);assert.equal((h.guard.counts() as {providerRequests:number}).providerRequests,2);await h.close();
});
test('identical blocked-read and 2xx classes can accompany either pending API or missing API',async()=>{
  const outcomes=[];
  for(const optional of [false,true]){const h=await routes(),page=realm();await h.request('https://unapproved.example/'+canary+'.js');await h.request(script);if(optional)page.publish();outcomes.push({network:h.guard.diagnostics().network,reason:page.probe().reason});await h.close();}
  assert.deepEqual(outcomes[0]!.network,outcomes[1]!.network);assert.equal(outcomes[0]!.reason,'api_loading');assert.equal(outcomes[1]!.reason,'response_pending');
});
test('provider HTTP errors can be nonfatal while cross-origin redirects and application POSTs are contained',async()=>{
  const errors=await routes();await errors.request(script,{sequence:[{status:403,headers:{}}]});assert.equal(errors.guard.diagnostics().firstFailure,null);assert.equal((errors.guard.diagnostics() as ReturnType<VerificationDiagnostics["snapshotV4"]>).summary.counters.reduce((n,x)=>n+x.provider4xx,0),1);errors.guard.assertSafe();await errors.close();
  const redirect=await routes();assert.equal((await redirect.request(script,{sequence:[{status:302,headers:{location:'https://unapproved.example/api.js'}}]})).action,'blocked');assert.equal(redirect.guard.diagnostics().firstFailure!.reason,'provider_redirect_target');await redirect.close(true);
  const post=await routes();assert.equal((await post.request(origin+'/register',{method:'POST'})).action,'blocked');assert.equal(post.guard.diagnostics().firstFailure!.reason,'application_mutation');await post.close(true);
});
test('initialization activity cannot renew the unchanged provider deadline or authorize a POST',()=>{
  let now=100;const gate=new VerificationSubmission(descriptor(),999999,()=>now,false);gate.startPhase();assert.equal(gate.deadline,120100);now=110000;gate.startPhase();gate.observe('loading');assert.equal(gate.deadline,120100);now=120100;assert.throws(()=>gate.assertActive(),error=>error instanceof Error && 'code' in error && error.code==='verification_timeout');assert.equal(gate.postCount(),0);
});
