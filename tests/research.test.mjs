import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {gunzipSync} from 'node:zlib';
import {digest,sha,validateMemoryEvent,validateLedger,validateFrozenModel,shadowPrediction,chooseArchive,prospectiveReview,adelaideUtc,scorePairs,pairedInterval} from '../netlify/lib/research-core.mjs';
import {appendMemory,registerModel,researchStoreName,researchEnvironment,putImmutable} from '../netlify/lib/research-store.mjs';
import {archiveForecast,scheduledArchive} from '../netlify/lib/research-archive.mjs';
import {createResearchHandler} from '../netlify/functions/research.mjs';
import {appendEvent,readLedger,privatePath,verify} from '../research/memory/cli.mjs';
import {buildReportFromSource} from '../netlify/lib/report-runtime.mjs';
import {createObservationSession,isObservationAdmin} from '../netlify/lib/observation-auth.mjs';
import {getStore} from '@netlify/blobs';
import vm from 'node:vm';
import {createMemoryPreview} from '../research/memory/preview.mjs';

class MemoryStore {
  data=new Map();writes=[];
  async get(key,{type='json'}={}){const v=this.data.get(key);return v==null?null:type==='json'&&typeof v==='string'?JSON.parse(v):structuredClone(v);}
  async list({prefix=''}){return {blobs:[...this.data.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))};}
  async setJSON(key,value,options={}){this.writes.push({key,options});if(options.onlyIfNew&&this.data.has(key))return {modified:false};this.data.set(key,structuredClone(value));return {modified:true};}
  async set(key,value,options={}){return this.setJSON(key,value,options);}
}
const model=()=>{const m={id:'model-d-v1',frozenAt:'2026-06-01T00:00:00.000Z',parameters:{model:'D',alpha:10,medians:[1,230,10,.5,0],means:[1,230,10,.5,0],scales:[1,1,1,1,1],beta:[.1,.2,.01,.02,.03,.04]},protocol:{fixture:true}};return {...m,sha256:digest(m)};};
const event=id=>({id,kind:'finding',subject:'fixture',title:'Fixture research finding',status:'inconclusive',conclusion:'No real observations here.',recordedAt:'2026-06-01T00:00:00Z',modelVersions:['fixture'],evidence:[],relations:[],metrics:{nChecks:2,nDays:1},uncertainty:'Synthetic fixture only'});
const receipt=()=>({id:'archive-fixture',status:'sealed',origin:'scheduled-server',capturedAt:'2026-10-22T07:00:00Z',sealedAt:'2026-10-22T07:01:00Z',modelFrozenAt:'2026-10-21T00:00:00Z',sourceStale:false,rows:[{validAtUtc:'2026-10-22T07:30:00Z',productionFt:2,modelDFt:1.5,productionVersion:'fixture-v1',calculationSourceSha256:'a'.repeat(64),modelDSha256:'b'.repeat(64),directionDeg:230,periodS:10,heightM:2.4,windDir:45,windSpeed:12,tideStage:'rising'}]});
const observation=(id='fixture')=>({id,location:'Seaford',observedAt:'2026-10-22T07:30:00Z',actualFt:2,evaluationDetails:{measurementDefinition:'local-surf-feet',actualValueMeaning:'typical',typicalFt:2,occasionalSetFt:2.5,observationConfidence:'high'}});

test('frozen shadow inference uses the specified feature order, clipping and training-only imputation',()=>{
  const m=model(),r={finalFt:2,activeDriver:{directionDeg:231,periodS:11},localRaw:{wave_height:.6},windSpeed:10,windDir:270};
  const before=structuredClone(r);assert.equal(shadowPrediction(r,m).predictionFt,2.733);assert.deepEqual(r,before);
  assert.equal(shadowPrediction({...r,windSpeed:null},m).status,'training-median-imputation');
  assert.equal(shadowPrediction({...r,finalFt:5.9},m).predictionFt,6);
  assert.equal(shadowPrediction({...r,finalFt:null},m).predictionFt,null);
  assert.throws(()=>validateFrozenModel({...m,parameters:{...m.parameters,beta:[1,2]}}),/parameters/);
  assert.throws(()=>validateFrozenModel({...m,frozenAt:'2026-06-02'}),/fingerprint/);
});
test('Adelaide valid-time conversion handles winter, summer and ambiguous/nonexistent DST hours',()=>{
  assert.equal(adelaideUtc('2026-06-12T12:00'),'2026-06-12T02:30:00.000Z');assert.equal(adelaideUtc('2026-10-22T18:00'),'2026-10-22T07:30:00.000Z');
  assert.equal(adelaideUtc('2026-10-04T02:30'),null);assert.equal(adelaideUtc('2026-04-05T02:30'),null);assert.equal(adelaideUtc('invalid'),null);
});
test('memory retains original conclusions, contradictory findings, hashes and evidence relationships',async()=>{
  const db=new MemoryStore(),a=await appendMemory(db,event('initial-finding'));
  const b={...event('new-contradiction'),relations:[{type:'contradicts',eventId:a.id,reason:'New evidence differs'}]};await appendMemory(db,b);
  assert.equal((await db.get('memory/initial-finding.json')).conclusion,a.conclusion);
  await assert.rejects(appendMemory(db,{...a,conclusion:'Rewrite history'}),/fingerprint/);
  await assert.rejects(appendMemory(db,{...event(a.id),conclusion:'Rewrite with a new hash'}),/Immutable/);
  assert.throws(()=>validateLedger([a,{...b,relations:[{type:'contradicts',eventId:'unknown',reason:'bad'}]}]),/unknown/);
  assert.throws(()=>validateMemoryEvent({...event('invalid-counts'),metrics:{nChecks:2,nDays:3}}),/counts/);
  assert.ok(db.writes.every(w=>w.options.onlyIfNew));
});
test('private filesystem ledger refuses public paths, rewrites and evidence tampering',async()=>{
  assert.throws(()=>privatePath('.'),/outside/);
  const root=await mkdtemp(path.join(tmpdir(),'frenchy-ledger-'));
  try {
    for(const d of ['events','models','evidence'])await mkdir(path.join(root,d));
    await writeFile(path.join(root,'models/model-d-v1.json'),JSON.stringify(model()));await writeFile(path.join(root,'evidence/test.txt'),'unchanged');
    await appendEvent(root,{...event('private-finding'),evidence:[{reference:'evidence/test.txt',sha256:sha('unchanged')}]});
    assert.equal((await verify(root)).events,1);await assert.rejects(appendEvent(root,event('private-finding')),/Duplicate/);
    await writeFile(path.join(root,'evidence/test.txt'),'altered');await assert.rejects(verify(root),/Evidence changed/);
    assert.equal((await readLedger(root)).length,1);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('preview namespaces cannot collide with private production research store',()=>{
  assert.equal(researchStoreName({CONTEXT:'production',SITE_ID:'fixture',RESEARCH_DEPLOY_PUBLISHED:'true'}),'frenchy-private-research-v1');
  for(const env of [{},{CONTEXT:'deploy-preview',SITE_ID:'fixture',DEPLOY_ID:'test1'},{CONTEXT:'production'},{CONTEXT:'production',SITE_ID:'fixture',RESEARCH_DEPLOY_PUBLISHED:'false'}])assert.notEqual(researchStoreName(env),'frenchy-private-research-v1');
  const env=researchEnvironment({deploy:{context:'deploy-preview',id:'preview1',published:false},site:{id:'fixture'}},{CONTEXT:'production',SITE_ID:'wrong',RESEARCH_ARCHIVE_ENABLED:'true'});
  assert.equal(env.CONTEXT,'deploy-preview');assert.equal(env.RESEARCH_DEPLOY_PUBLISHED,'false');assert.equal(researchStoreName(env),'frenchy-private-research-preview-preview1');assert.equal(researchEnvironment(null,{CONTEXT:'production'}).CONTEXT,'local');
});
test('real Netlify SDK sends atomic If-None-Match for immutable JSON writes',async()=>{
  const calls=[];
  const db=getStore({name:'fixture-research',siteID:'fixture-site',token:'fixture-token',edgeURL:'https://fixture.invalid',uncachedEdgeURL:'https://fixture.invalid',fetch:async(url,options)=>{calls.push({url,options});return new Response('',{status:200,headers:{etag:'fixture'}});}});
  await putImmutable(db,'memory/fixture.json',{fixture:true});
  assert.equal(calls.at(-1).options.headers['if-none-match'],'*');assert.equal(calls.at(-1).options.body,'{"fixture":true}');
});
test('archive writes full reproducible payload before sealing; no production row changes',async()=>{
  const input=JSON.parse(await readFile('tests/fixtures/seaford-input.json','utf8')),db=new MemoryStore(),m=model();
  const baseline=buildReportFromSource('seaford',input.source,input.tides,{now:new Date(input.now)}),before=JSON.stringify(input);
  const r=await archiveForecast({source:input.source,model:m,store:db,now:()=>new Date(input.now),id:'fixture-only',tides:input.tides});
  assert.equal(r.totalForecastRows,baseline.hydration.report.reports.length);assert.equal(JSON.stringify(input),before);assert.ok(r.payloadBytes<500000);
  const payload=Buffer.from(await db.get(r.payloadKey)),full=JSON.parse(gunzipSync(payload));assert.equal(sha(payload),r.payloadSha256);assert.deepEqual(full.source,input.source);assert.ok(full.sourceFiles['index.html']);
  assert.deepEqual(full.hydration.report.reports.map(r=>r.finalFt),baseline.hydration.report.reports.map(r=>r.finalFt));
  assert.equal(db.writes[0].key,r.payloadKey);assert.ok(db.writes.at(-1).key.startsWith('receipts/'));
  await assert.rejects(archiveForecast({source:{...input.source,staleDataUsed:true},model:m,store:db}),/Fresh/);
  await assert.rejects(archiveForecast({source:input.source,model:m,store:{set:async()=>{throw Error('offline')}},now:()=>new Date(input.now)}),/offline/);
});
test('archive remains off by default and on previews, missing models prevent provider calls; slots deduplicate',async()=>{
  const db=new MemoryStore();let fetches=0;const fetchSource=async()=>{fetches++;throw Error('source unavailable')};
  assert.equal((await scheduledArchive({store:db,env:{},fetchSource})).status,'disabled');
  assert.equal((await scheduledArchive({store:db,env:{RESEARCH_ARCHIVE_ENABLED:'true',CONTEXT:'deploy-preview'},fetchSource})).status,'disabled');
  const env={RESEARCH_ARCHIVE_ENABLED:'true',CONTEXT:'production',SITE_ID:'fixture',RESEARCH_DEPLOY_PUBLISHED:'true'};
  assert.equal((await scheduledArchive({store:db,env:{...env,RESEARCH_DEPLOY_PUBLISHED:'false'},fetchSource})).status,'disabled');
  assert.equal((await scheduledArchive({store:db,env,fetchSource})).status,'missing-frozen-model');assert.equal(fetches,0);
  await registerModel(db,model());assert.equal((await scheduledArchive({store:db,env,fetchSource})).status,'failed');assert.equal(fetches,1);
  assert.equal((await scheduledArchive({store:db,env,fetchSource})).status,'already-attempted');assert.equal(fetches,1);assert.equal([...db.data.keys()].filter(k=>k.startsWith('receipts/')).length,0);
});
test('full 168-hour shadow archive preserves every production prediction and model parameters',async()=>{
  const input=JSON.parse(await readFile('tests/fixtures/seaford-input.json','utf8'));
  const extend=value=>{if(!value||typeof value!=='object')return;if(value.hourly?.time)for(const[key,rows]of Object.entries(value.hourly))if(Array.isArray(rows))value.hourly[key]=Array.from({length:168},(_,i)=>key==='time'?new Date(Date.UTC(2026,5,12,i)).toISOString().slice(0,16):rows[i%rows.length]);for(const[key,child]of Object.entries(value))if(key!=='hourly')extend(child);};extend(input.source);
  const before=buildReportFromSource('seaford',input.source,input.tides,{now:new Date(input.now)}),db=new MemoryStore(),m=model(),frozen=JSON.stringify(m);
  const receipt=await archiveForecast({source:input.source,model:m,store:db,now:()=>new Date(input.now),tides:input.tides});
  const payload=JSON.parse(gunzipSync(Buffer.from(await db.get(receipt.payloadKey))));assert.equal(payload.hydration.report.reports.length,168);assert.equal(payload.comparisonRows.length,168);assert.equal(receipt.totalForecastRows,168);assert.equal(JSON.stringify(m),frozen);
  assert.deepEqual(payload.hydration.report.reports,JSON.parse(JSON.stringify(before.hydration.report.reports)));assert.equal(receipt.rows.length,7);
});
test('prospective matcher rejects after-check, too-recent, stale, old, invalid, unfrozen and wrong-hour archives',()=>{
  const o=observation(),r=receipt();assert.equal(chooseArchive(o,[r]).archiveLeadMinutes,29);
  for(const patch of [{sealedAt:'2026-10-22T07:31:00Z'},{sealedAt:'2026-10-22T07:25:00Z'},{sealedAt:'bad'},{capturedAt:'bad'},{sealedAt:'2026-10-21T07:01:00Z',capturedAt:'2026-10-21T07:00:00Z'},{sourceStale:true},{modelFrozenAt:'2026-10-22T07:10:00Z'},{origin:'observation-request'},{rows:[{...r.rows[0],validAtUtc:'2026-10-22T09:30:00Z'}]}])assert.equal(chooseArchive(o,[{...r,...patch}]),null,JSON.stringify(patch));
  assert.equal(chooseArchive(o,[r,{...r,id:'newer',sealedAt:'2026-10-22T07:05:00Z'}]).receipt.id,'newer');
});
test('prospective scoring keeps typical/sets, model versions and failures separate; no historical fabrication',()=>{
  const o=observation(),r=receipt(),before=JSON.stringify([o,r]);
  const p=prospectiveReview([o,{...o,id:'legacy',evaluationDetails:undefined},{...o,id:'face',evaluationDetails:{...o.evaluationDetails,measurementDefinition:'wave-face-feet'}}],[r]);
  assert.equal(p.checks,1);assert.equal(p.days,1);assert.equal(p.excluded.length,2);assert.equal(p.pairs[0].occasionalSetFt,2.5);assert.equal(p.groups[0].modelD.under05,0);assert.equal(p.adoptionApproved,false);assert.equal(p.milestoneReached,false);assert.equal(JSON.stringify([o,r]),before);
  const r2={...r,rows:[{...r.rows[0],productionVersion:'another-version'}],sealedAt:'2026-10-23T07:01:00Z',capturedAt:'2026-10-23T07:00:00Z'};r2.rows[0].validAtUtc='2026-10-23T07:30:00Z';
  assert.equal(prospectiveReview([o,{...o,id:'next',observedAt:r2.rows[0].validAtUtc}],[r,r2]).groups.length,2);
});
test('day weighting, uncertainty and larger-surf undercalls do not hide regressions',()=>{
  const rows=[{day:'2026-10-22',actualFt:3,productionFt:3,modelDFt:2},{day:'2026-10-23',actualFt:1,productionFt:2,modelDFt:1.5}];
  assert.equal(scorePairs(rows,'modelDFt').largeSurfUndercalls,1);assert.equal(scorePairs(rows,'productionFt').largeSurfUndercalls,0);
  const many=[rows[0],rows[0],rows[0],rows[1]];assert.equal(scorePairs(many,'productionFt',true).mae,.5);assert.equal(scorePairs(many).mae,.25);
  assert.equal(pairedInterval([rows[0]]).low,null);assert.ok(pairedInterval(rows).low<0);
});
test('private research HTML, API, exports and mutation all require administrator access',async()=>{
  const db=new MemoryStore();let reads=0;const handler=createResearchHandler({store:()=>{reads++;return db},observations:async()=>[],authorize:()=>false});
  for(const url of ['/research','/research/accuracy','/api/research','/api/research?view=historical','/api/research?view=backup']){const r=await handler(new Request('https://fixture.invalid'+url));assert.equal(r.status,401);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.doesNotMatch(await r.text(),/actualFt|fittedStates/);}
  assert.equal(reads,0);
  const admin=createResearchHandler({store:()=>db,observations:async()=>[],authorize:()=>true,readText:()=>'<html>private template</html>'});
  assert.equal((await admin(new Request('https://fixture.invalid/research'))).status,200);
  assert.equal((await admin(new Request('https://fixture.invalid/api/research',{method:'DELETE'}))).status,405);
  assert.equal((await admin(new Request('https://fixture.invalid/api/research',{method:'POST',headers:{origin:'https://evil.invalid'},body:'{}'}))).status,403);
  const append=body=>admin(new Request('https://fixture.invalid/api/research',{method:'POST',headers:{origin:'https://fixture.invalid'},body:JSON.stringify(body)}));
  assert.equal((await append({action:'append',event:event('server-finding')})).status,201);
  assert.equal((await append({action:'append',event:{...event('server-finding'),conclusion:'replace'}})).status,400);
  const data=await (await admin(new Request('https://fixture.invalid/api/research'))).json();assert.equal(data.events.length,1);assert.equal(data.prospective.checks,0);
});
test('research gate accepts the existing signed cookie and rejects expired or tampered sessions',()=>{
  const previous=process.env.BEACH_CHECK_SECRET;process.env.BEACH_CHECK_SECRET='fixture-only-not-a-login';
  try{const token=createObservationSession(),request=value=>new Request('https://fixture.invalid/research',{headers:{cookie:'frenchy_observation_admin='+value}});assert.equal(isObservationAdmin(request(token)),true);assert.equal(isObservationAdmin(request(token+'x')),false);assert.equal(isObservationAdmin(request('fake')),false);}finally{if(previous===undefined)delete process.env.BEACH_CHECK_SECRET;else process.env.BEACH_CHECK_SECRET=previous;}
});
test('observation changes remain additive; no research model reaches the public calculation graph',async()=>{
  for(const file of ['index.html','middleton.html','phase1-engine.js','netlify/lib/report-source.mjs','netlify/lib/report-runtime.mjs','netlify/functions/surf-report.mjs'])assert.doesNotMatch(await readFile(file,'utf8'),/shadowPrediction|research-archive|model-d-v1/);
  const ui=await readFile('observation.js','utf8');assert.equal((ui.match(/id="obsTypical"/g)||[]).length,1);assert.match(ui,/Looks right/);assert.match(ui,/validationStatus: state.validationStatus/);assert.match(ui,/obsQuickDetails/);
});
test('new dashboard renders historical memory, safe text and an honest zero-prospective state',async()=>{
  const html=await readFile('research/memory/dashboard.html','utf8'),script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1],elements=new Map();
  const element=id=>{if(!elements.has(id))elements.set(id,{value:{search:'',kind:'all',version:'0',sort:'worst'}[id]||'',style:{},textContent:'',innerHTML:''});return elements.get(id);};
  const e=validateMemoryEvent({...event('ui-fixture'),title:'<script>must be text</script>'});
  const data={events:[e],ledger:validateLedger([e]),models:[{id:'model-d-v1',sha256:model().sha256,frozenAt:model().frozenAt}],health:[],receipts:[],context:'fixture',archiveEnabled:false,prospective:prospectiveReview([],[])};
  const context=vm.createContext({document:{getElementById:element,querySelectorAll:()=>[]},fetch:async()=>({ok:true,json:async()=>data}),console});new vm.Script(script).runInContext(context);await new Promise(r=>setImmediate(r));
  assert.equal(element('error').textContent,'');assert.match(element('events').innerHTML,/&lt;script&gt;/);assert.doesNotMatch(element('events').innerHTML,/<script>/);assert.match(element('scores').innerHTML,/Insufficient prospective evidence/);assert.match(element('health').innerHTML,/Archive disabled/);
  element('search').value='absent';element('search').oninput();assert.match(element('events').innerHTML,/No matching/);
  const loading=vm.createContext({document:{getElementById:element,querySelectorAll:()=>[]},fetch:()=>new Promise(()=>{}),console});new vm.Script(script).runInContext(loading);
  assert.doesNotThrow(()=>element('kind').onchange());assert.doesNotThrow(()=>element('search').oninput());assert.doesNotThrow(()=>element('version').onchange());
});
test('memory preview is loopback read-only and cannot serve private files or cross-origin requests',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'research-preview-'));
  try {
    for(const d of ['events','models','evidence'])await mkdir(path.join(root,d));await writeFile(path.join(root,'models/model-d-v1.json'),JSON.stringify(model()));await writeFile(path.join(root,'evidence/analysis-pr72.json'),'{}');await appendEvent(root,event('preview-fixture'));
    const server=await createMemoryPreview(root);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
    try{assert.equal((await fetch(base+'/research')).status,200);assert.equal((await fetch(base+'/observe')).status,200);const health=await (await fetch(base+'/health')).json();assert.equal(health.privateResearchPreview,true);assert.equal(health.productionWrites,false);assert.equal(health.port,server.address().port);const data=await (await fetch(base+'/api/research')).json();assert.equal(data.events.length,1);assert.equal(data.prospective.checks,0);assert.equal((await fetch(base+'/models/model-d-v1.json')).status,404);assert.equal((await fetch(base+'/api/research',{method:'POST',body:'{}'})).status,405);assert.equal((await fetch(base+'/api/research',{headers:{Origin:'https://evil.invalid'}})).status,403);}finally{await new Promise(r=>server.close(r));}
  }finally{await rm(root,{recursive:true,force:true});}
});
