'use strict';
const policy = {
  expected: Object.freeze({fsevents: Object.freeze(['2.3.2']), playwright: Object.freeze(['1.62.1']), 'playwright-core': Object.freeze(['1.62.1'])}),
  matchesBody(value) {
    if (!value || typeof value!=='object' || Array.isArray(value)) return false;
    const names=Object.keys(value).sort();
    return JSON.stringify(names)===JSON.stringify(Object.keys(this.expected).sort()) && names.every(name =>
      Array.isArray(value[name]) && value[name].length===1 && value[name][0]===this.expected[name][0]);
  },
  permitsMetadata(url, advisoriesPresent) {
    return advisoriesPresent===true && ['https://registry.npmjs.org/fsevents','https://registry.npmjs.org/playwright','https://registry.npmjs.org/playwright-core'].includes(url);
  },
};
module.exports=policy;
function installBoundary() {
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const https = require('node:https');
const http = require('node:http');
const crypto = require('node:crypto');
const root = process.env.BROWSERDRIVER_M16_AUDIT_OUTPUT, events = path.join(root, 'requests.jsonl');
if (!path.isAbsolute(root) || path.resolve(root)!==root || fs.lstatSync(root).uid!==process.getuid() || (fs.lstatSync(root).mode&0o777)!==0o700) throw new Error('private audit output custody refused');
const bulk = 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk';
const gets = new Set(['https://registry.npmjs.org/fsevents', 'https://registry.npmjs.org/playwright', 'https://registry.npmjs.org/playwright-core']);
const expected = policy.expected;
let bulkCalls = 0, wirePosts = 0, advisoryMetadataNeeded = false;
const record = value => fs.appendFileSync(events, JSON.stringify(value)+'\n', {mode:0o600});
function deny(reason) { record({kind:'denied',reason}); throw Object.assign(new Error('scoped registry request refused'), {code:'ESCOPE'}); }
function permitted(url, method) {
  if (url.protocol !== 'https:' || url.hostname !== 'registry.npmjs.org' || url.username || url.password ||
      url.search || url.hash || url.port && url.port !== '443') deny('origin-or-url');
  if (method === 'POST' && url.href === bulk) return;
  if (method === 'GET' && policy.permitsMetadata(url.href, advisoryMetadataNeeded)) return;
  deny('method-or-endpoint');
}
function requestURL(args) {
  const first = args[0], options = typeof first === 'string' || first instanceof URL ? (typeof args[1] === 'object' ? args[1] : {}) : first;
  const base = typeof first === 'string' || first instanceof URL ? new URL(first) : new URL(`${options.protocol || 'https:'}//${options.hostname || options.host}${options.port ? ':'+options.port : ''}${options.path || '/'}`);
  if (options.hostname) base.hostname = options.hostname;
  if (options.port) base.port = String(options.port);
  if (options.path) { const parsed = new URL(options.path, base); base.pathname=parsed.pathname; base.search=parsed.search; }
  return {url:base, method:String(options.method||'GET').toUpperCase(), options};
}
const originalHTTPS = https.request;
https.request = function(...args) {
  const {url, method, options} = requestURL(args); permitted(url,method);
  if (method === 'POST' && (bulkCalls !== 1 || ++wirePosts !== 1)) deny('extra-bulk-post');
  if (options.auth || options.key || options.cert) deny('credential-option');
  const headers = {...options.headers};
  for (const key of Object.keys(headers)) {
    const lower=key.toLowerCase();
    if (['authorization','proxy-authorization','cookie'].includes(lower)) deny('credential-header');
    if (['npm-scope','npm-session','npm-auth-type'].includes(lower)) delete headers[key];
  }
  options.headers=headers;
  record({kind:'request',method,url:url.href,credentialHeaders:false});
  const request=originalHTTPS.apply(this,args);
  request.once('response', response => record({kind:'response',method,url:url.href,status:response.statusCode}));
  return request;
};
https.get=function(...args) {const request=https.request(...args);request.end();return request;};
http.request=function(){deny('non-https');}; http.get=function(){deny('non-https');};
const originalLoad = Module._load, wrappers = new WeakMap();
Module._load=function(name,parent,isMain) {
  const loaded=originalLoad.apply(this,arguments);
  let resolved;
  try {resolved=Module._resolveFilename(name,parent);} catch {return loaded;}
  if (resolved === '/home/peter/.nvm/versions/node/v24.14.1/lib/node_modules/npm/node_modules/make-fetch-happen/lib/index.js') {
    if (wrappers.has(loaded)) return wrappers.get(loaded);
    // npm-registry-fetch does not forward redirect options. Apply the policy
    // after that layer, on the actual fetch entry that owns follow-up dispatch.
    const noRedirect=(uri,options={})=>loaded(uri,{...options,redirect:'error'});
    Object.assign(noRedirect,loaded);
    noRedirect.defaults=(uri,options={})=>loaded.defaults(uri,options,noRedirect);
    wrappers.set(loaded,noRedirect);return noRedirect;
  }
  if (resolved !== '/home/peter/.nvm/versions/node/v24.14.1/lib/node_modules/npm/node_modules/npm-registry-fetch/lib/index.js') return loaded;
  if (wrappers.has(loaded)) return wrappers.get(loaded);
  const guarded=async function(uri,opts={}) {
    const url=new URL(uri,opts.registry||'https://registry.npmjs.org'), method=String(opts.method||'GET').toUpperCase();
    permitted(url,method);
    if (method==='POST') {
      if (++bulkCalls!==1 || opts.gzip!==true || !policy.matchesBody(opts.body)) deny('bulk-body-or-count');
      record({kind:'approved-bulk-body',sha256:crypto.createHash('sha256').update(JSON.stringify(opts.body)).digest('hex'),packageCount:3});
    }
    const response=await loaded(uri,opts);
    if (method==='POST') {
      const data=await response.clone().json();
      const names=Object.keys(data);
      if (names.some(name=>!Object.hasOwn(expected,name))) deny('advisory-inventory');
      advisoryMetadataNeeded=names.some(name=>Array.isArray(data[name])&&data[name].length>0);
      record({kind:'bulk-advisory-response',packageNames:names,advisoriesPresent:advisoryMetadataNeeded});
    }
    return response;
  };
  Object.assign(guarded,loaded);
  guarded.json=(uri,opts)=>guarded(uri,opts).then(response=>response.json());
  wrappers.set(loaded,guarded);return guarded;
};

}
if(process.env.BROWSERDRIVER_M16_AUDIT_GUARD==='1')installBoundary();
