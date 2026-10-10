import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

test("installed registry-fetch path rejects same, cross-allowed and foreign redirects before second dispatch", async () => {
  for (const location of ["https://registry.npmjs.org/fsevents", "https://registry.npmjs.org/playwright", "https://unapproved.invalid/fsevents"]) {
    const root = await mkdtemp(join(tmpdir(), "m16-audit-redirect-"));
    try {
      const result = spawnSync(process.execPath, ["-e", `
const assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const https=require('node:https'),http=require('node:http');
let dispatches=0;
// All actual transport is replaced before the reviewed boundary is installed.
// Native registry-fetch/make-fetch-happen/minipass-fetch remain in the path.
https.request=function(options){
  dispatches+=1;
  const request=new EventEmitter();
  request.write=()=>true;request.setTimeout=()=>request;request.abort=()=>{};request.destroy=()=>request;
  request.end=()=>setImmediate(()=>{
    const response=new PassThrough();
    const isBulk=options.method==='POST';
    const body=isBulk?JSON.stringify({fsevents:[{id:1}]}):'';
    response.statusCode=isBulk?200:302;response.statusMessage=isBulk?'OK':'Found';
    response.headers={'content-type':'application/json',...(isBulk?{}:{location:process.argv[2]})};response.trailers={};
    request.emit('response',response);response.end(body);
  });
  return request;
};
http.request=()=>{throw Error('no real network');};http.get=http.request;
process.env.BROWSERDRIVER_M16_AUDIT_GUARD='1';process.env.BROWSERDRIVER_M16_AUDIT_OUTPUT=process.argv[1];
require(process.argv[3]);
const base='/home/peter/.nvm/versions/node/v24.14.1/lib/node_modules/npm/node_modules';
const npmFetch=require(base+'/npm-registry-fetch');
(async()=>{
  const options={registry:'https://registry.npmjs.org',fetchRetries:0,timeout:1000,cache:'no-store'};
  const response=await npmFetch('https://registry.npmjs.org/-/npm/v1/security/advisories/bulk',
    {...options,method:'POST',gzip:true,body:{fsevents:['2.3.2'],playwright:['1.62.1'],'playwright-core':['1.62.1']}});
  await response.json();
  // Caller explicitly requests follow: boundary must override on the actual
  // installed lower fetch layer, even though npm-registry-fetch drops options.
  await assert.rejects(()=>npmFetch('https://registry.npmjs.org/fsevents',{...options,redirect:'follow'}),
    error=>error.code==='ENOREDIRECT');
  assert.equal(dispatches,2); // one simulated bulk + one initial metadata GET
  process.stdout.write(JSON.stringify({dispatches,redirectRejected:true})+'\\n');
})().catch(()=>{process.stderr.write('offline redirect control failed\\n');process.exitCode=1;});
`, root, location, resolve("scripts/m16-audit-boundary.cjs")], {
        encoding: "utf8", env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" },
      });
      assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, '{"dispatches":2,"redirectRejected":true}\n');
      const records = (await readFile(join(root, "requests.jsonl"), "utf8")).trim().split("\n").map(value => JSON.parse(value));
      assert.equal(records.filter(value => value.kind === "request" && value.method === "GET").length, 1);
      assert.equal(records.filter(value => value.kind === "request").length, 2);
      assert.equal(records.some(value => value.kind === "denied"), false);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});
