import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createAccuracyServer} from '../research/accuracy/server.mjs';

test('private research server is read-only, blocks foreign hosts/origins and exposes no source files',async()=>{
  const temp=await mkdtemp(path.join(tmpdir(),'accuracy-'));
  const data=path.join(temp,'analysis.json');await writeFile(data,'{"fixture":true}');
  const server=createAccuracyServer(data);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    const response=await fetch(base+'/analysis.json');assert.deepEqual(await response.json(),{fixture:true});assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal((await fetch(base,{method:'POST'})).status,405);
    assert.equal((await fetch(base,{headers:{Origin:'https://unrelated.example'}})).status,403);
    const foreignHost=await new Promise((resolve,reject)=>http.get(base,{headers:{Host:'unrelated.example'}},res=>{res.resume();resolve(res.statusCode)}).on('error',reject));
    assert.equal(foreignHost,403);
    assert.equal((await fetch(base+'/analyse.py')).status,404);
    assert.equal((await fetch(base+'/../../index.html')).status,404);
    const html=await (await fetch(base)).text();assert.match(html,/Private research/);assert.doesNotMatch(html,/89fa9eae|a81661de/);
  } finally {await new Promise(r=>server.close(r));await rm(temp,{recursive:true,force:true});}
});

test('production handlers never import local experimental models',async()=>{
  for(const file of ['index.html','middleton.html','phase1-engine.js','netlify/lib/report-runtime.mjs','netlify/functions/surf-report.mjs']) {
    const source=await readFile(new URL('../'+file,import.meta.url),'utf8');assert.doesNotMatch(source,/research\/accuracy|analyse\.py|fittedStates/);
  }
});
