import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createObservationSession,observationSessionCookie} from '../netlify/lib/observation-auth.mjs';
import {observationStoreName} from '../netlify/lib/observation-store.mjs';
import {createObservationHandler} from '../netlify/functions/surf-observations.mjs';
import {createResearchHandler} from '../netlify/functions/research.mjs';
import {createArchiveHandler,config as schedule} from '../netlify/functions/research-archive.mjs';
import {putImmutable} from '../netlify/lib/research-store.mjs';
import {digest} from '../netlify/lib/research-core.mjs';
import {buildReportFromSource} from '../netlify/lib/report-runtime.mjs';

class FixtureStore {
  data=new Map();writes=[];
  async get(key,{type='json'}={}){const value=this.data.get(key);return value==null?null:type==='json'&&typeof value==='string'?JSON.parse(value):structuredClone(value);}
  async list({prefix=''}){return {blobs:[...this.data.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key}))};}
  async set(key,value,options={}){if(options.onlyIfNew&&this.data.has(key))return {modified:false};this.writes.push(key);this.data.set(key,structuredClone(value));return {modified:true};}
  async setJSON(key,value,options){return this.set(key,value,options);}
  async delete(key){this.writes.push(key);this.data.delete(key);}
}
const production={site:{id:'fixture-site'},deploy:{context:'production',id:'fixture-production',published:true}};
const preview={site:{id:'fixture-site'},deploy:{context:'deploy-preview',id:'fixture-preview',published:false}};
const secret='readiness-fixture-not-a-real-password';
async function withSecret(fn){const previous=process.env.BEACH_CHECK_SECRET;process.env.BEACH_CHECK_SECRET=secret;try{return await fn();}finally{if(previous===undefined)delete process.env.BEACH_CHECK_SECRET;else process.env.BEACH_CHECK_SECRET=previous;}}
const cookie=()=>observationSessionCookie(createObservationSession()).split(';')[0];
const request=(path='/api/observations',options={})=>new Request('https://fixture.invalid'+path,{...options,headers:{cookie:cookie(),origin:'https://fixture.invalid',...options.headers}});
const check=()=>{const observedAt=new Date(Date.now()-600000).toISOString();return {actualFt:2,observedAt,clientToken:'readiness-fixture-token',condition:'clean',validationStatus:'confirmed',snapshot:{location:'Seaford',predictedFt:2,observedAt,forecastDistanceMinutes:0,calculationVersion:'synthetic-fixture'},evaluationDetails:{measurementDefinition:'local-surf-feet',actualValueMeaning:'typical',typicalFt:2,occasionalSetFt:2.5,observationConfidence:'high',observerLabel:'Synthetic observer'}};};

test('real research authentication fails closed for missing, expired, forged and unconfigured sessions',()=>withSecret(async()=>{
  let reads=0;const handler=createResearchHandler({store:()=>{reads++;throw Error('must not read private storage');}});
  const expired=Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)-1})).toString('base64url');
  const expiredToken=expired+'.'+createHmac('sha256',secret).update(expired).digest('base64url');
  for(const path of ['/research','/research/accuracy','/api/research','/api/research?view=backup','/api/research?view=historical','/.netlify/functions/research?view=backup'])for(const token of ['',expiredToken,'forged.signature']){
    const response=await handler(new Request('https://fixture.invalid'+path,{headers:{cookie:'frenchy_observation_admin='+token}}),production);
    assert.equal(response.status,401);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.match(response.headers.get('x-robots-tag'),/noindex/);assert.doesNotMatch(await response.text(),/fittedStates|actualFt|trainingIds/);
  }
  const valid=request('/api/research');delete process.env.BEACH_CHECK_SECRET;assert.equal((await handler(valid,production)).status,401);assert.equal(reads,0);
}));

test('existing signed administrator session protects research writes, exports and storage errors',()=>withSecret(async()=>{
  const db=new FixtureStore(),handler=createResearchHandler({store:()=>db,observations:async()=>[]});
  const response=await handler(request('/research'),production);assert.equal(response.status,200);assert.match(await response.text(),/Permanent research history/);
  const attributes=observationSessionCookie(createObservationSession());for(const flag of ['HttpOnly','Secure','SameSite=Strict','Path=/'])assert.ok(attributes.includes(flag));assert.doesNotMatch(attributes,/Domain=/i);
  for(const origin of ['https://other.invalid','null',''])assert.equal((await handler(request('/api/research',{method:'POST',headers:{origin},body:'{}'}),production)).status,403);
  for(const method of ['PUT','DELETE','HEAD'])assert.equal((await handler(request('/api/research',{method}),production)).status,405);
  assert.equal((await handler(request('/api/research',{method:'POST',body:'broken JSON'}),production)).status,400);
  assert.equal((await handler(request('/api/research',{method:'POST',body:'x'.repeat(2000001)}),production)).status,413);
  const broken=createResearchHandler({store:()=>{throw Error('PRIVATE FAILURE DETAIL');},observations:async()=>[]});
  const unavailable=await broken(request('/api/research'),production);assert.equal(unavailable.status,503);assert.equal(unavailable.headers.get('cache-control'),'private, no-store');assert.doesNotMatch(await unavailable.text(),/PRIVATE FAILURE DETAIL/);assert.equal(db.writes.length,0);
}));

test('published production alone uses the unchanged observation namespace; previews cannot read or change it',()=>withSecret(async()=>{
  const stores=new Map(),openStore=context=>{const name=observationStoreName(context);if(!stores.has(name))stores.set(name,new FixtureStore());return stores.get(name);};
  assert.equal(observationStoreName(production),'frenchy-surf-observations');
  for(const context of [undefined,preview,{...production,deploy:{...production.deploy,published:false}},{deploy:production.deploy}])assert.notEqual(observationStoreName(context),'frenchy-surf-observations');
  const db=openStore(production),legacy={id:'legacy-fixture',location:'Seaford',observedAt:new Date().toISOString(),actualFt:1,predictedFt:1,snapshot:{original:true}};db.data.set('observations/'+legacy.id,structuredClone(legacy));
  const original=JSON.stringify([...db.data]),handler=createObservationHandler({openStore});
  const saved=await handler(request('/api/observations',{method:'POST',body:JSON.stringify(check())}),preview);assert.equal(saved.status,201);const created=(await saved.json()).observation;
  assert.equal(created.validationStatus,'confirmed');assert.equal(created.actualFt,created.predictedFt);assert.equal(created.evaluationDetails.observerLabel,'Synthetic observer');assert.equal(created.evaluationDetails.observerIdentityVerified,false);
  assert.equal((await (await handler(request(),preview)).json()).observations.length,1);
  for(const method of ['PUT','DELETE'])assert.equal((await handler(request('/api/observations?id=legacy-fixture',{method,body:JSON.stringify({actualFt:3})}),preview)).status,404);
  const csv=await (await handler(request('/api/observations?format=csv'),preview)).text();assert.match(csv,/validation_status/);assert.doesNotMatch(csv,/legacy-fixture/);
  assert.equal(JSON.stringify([...db.data]),original);assert.equal(db.writes.length,0);assert.equal((await (await handler(request(),production)).json()).observations[0].id,'legacy-fixture');
}));

test('editing new research checks preserves the original status and target and clears ambiguous replacement metadata',()=>withSecret(async()=>{
  const db=new FixtureStore(),handler=createObservationHandler({openStore:()=>db}),input=check();
  const first=await handler(request('/api/observations',{method:'POST',body:JSON.stringify(input)}),preview),original=(await first.json()).observation;
  const revised=await handler(request('/api/observations?id='+original.id,{method:'PUT',body:JSON.stringify({actualFt:3,condition:'average',snapshot:input.snapshot,observedAt:input.observedAt})}),preview);assert.equal(revised.status,200);const current=(await revised.json()).observation;
  assert.equal(current.validationStatus,'unspecified');assert.equal(current.evaluationDetails.typicalFt,null);assert.equal(current.evaluationDetails.occasionalSetFt,null);assert.equal(current.evaluationDetails.observationConfidence,'unknown');
  assert.equal(current.evaluationHistory.length,1);assert.deepEqual(current.evaluationHistory[0].evaluationDetails,original.evaluationDetails);assert.equal(current.evaluationHistory[0].validationStatus,'confirmed');assert.equal(current.evaluationHistory[0].actualFt,2);assert.deepEqual(current.originalForecast,original.originalForecast);
  const legacy={id:'legacy-fixture',revision:1,location:'Seaford',actualFt:1,predictedFt:1,observedAt:input.observedAt,snapshot:input.snapshot};db.data.set('observations/'+legacy.id,legacy);
  const edited=(await (await handler(request('/api/observations?id='+legacy.id,{method:'PUT',body:JSON.stringify({actualFt:1.5})}),preview)).json()).observation;assert.equal(edited.evaluationDetails,undefined);assert.equal(edited.evaluationHistory,undefined);assert.equal(edited.validationStatus,undefined);
}));

test('the actual scheduled entry point stays disabled without explicit published-production activation',async()=>{
  const prior=process.env.RESEARCH_ARCHIVE_ENABLED;let reads=0,fetches=0;
  const db=new FixtureStore(),handler=createArchiveHandler({openStore:()=>{reads++;return db;},fetchSource:async()=>{fetches++;throw Error('must not fetch');}});
  try{
    delete process.env.RESEARCH_ARCHIVE_ENABLED;assert.match(await (await handler(null,production)).text(),/disabled/);
    process.env.RESEARCH_ARCHIVE_ENABLED='true';
    for(const context of [undefined,preview,{...production,site:{}},{...production,deploy:{...production.deploy,published:false}}])assert.match(await (await handler(null,context)).text(),/disabled/);
    assert.equal(reads,0);assert.equal(fetches,0);assert.equal((await (await handler(null,production)).json()).status,'missing-frozen-model');assert.equal(fetches,0);assert.equal(db.writes.length,0);assert.equal(schedule.schedule,'15 */3 * * *');
  }finally{if(prior===undefined)delete process.env.RESEARCH_ARCHIVE_ENABLED;else process.env.RESEARCH_ARCHIVE_ENABLED=prior;}
});

test('private history survives a handler rollback, without migration or replacement',async()=>{
  const db=new FixtureStore(),record={id:'synthetic-immutable-event',kind:'finding',result:'unchanged'};
  await putImmutable(db,'memory/fixture.json',record);const before=JSON.stringify([...db.data]);
  const freshHandler=createResearchHandler({store:()=>db,authorize:()=>false});assert.equal((await freshHandler(new Request('https://fixture.invalid/research'),production)).status,401);
  assert.equal(JSON.stringify([...db.data]),before);await putImmutable(db,'memory/fixture.json',record);await assert.rejects(putImmutable(db,'memory/fixture.json',{...record,result:'replacement'}),/Immutable/);assert.equal(digest(await db.get('memory/fixture.json')),digest(record));
});

test('production calculation files and research templates contain no deployment activation or private model data',async()=>{
  const config=await readFile('netlify.toml','utf8');assert.doesNotMatch(config,/RESEARCH_ARCHIVE_ENABLED\s*=\s*["']?true/);assert.match(config,/research\/memory\/dashboard.html/);assert.match(config,/research\/accuracy\/dashboard.html/);
  for(const file of ['research/memory/dashboard.html','research/accuracy/dashboard.html'])assert.doesNotMatch(await readFile(file,'utf8'),/"trainingIds"\s*:|"fittedStates"\s*:|"observations"\s*:\s*\[/);
});

// References computed independently with the deployed 4c943ff engine, not with
// candidate expectations. Only explanatory source-string CRLF/LF is normalized.
for(const [location,expected] of [['seaford','19d0aba0c28d9b17e8c5eb1330a8f02ba7ec476628d45e5f7f852c03f7d3b577'],['middleton','9b4c666a2a3ed1d1893c28e9216ca7e4ad314f6b4070c590cb75bb0d68526901']])test(location+': 168-hour same-input outputs match the deployed production engine',async()=>{
  const input=JSON.parse(await readFile('tests/fixtures/'+location+'-input.json','utf8'));
  const firstHour=value=>{if(!value||typeof value!=='object')return null;if(value.hourly?.time?.[0])return value.hourly.time[0];for(const child of Object.values(value)){const found=firstHour(child);if(found)return found;}return null;};
  const first=firstHour(input.source),extend=value=>{if(!value||typeof value!=='object')return;if(value.hourly?.time)for(const[key,rows]of Object.entries(value.hourly))if(Array.isArray(rows))value.hourly[key]=Array.from({length:168},(_,i)=>key==='time'?new Date(Date.parse(first+'Z')+i*3600000).toISOString().slice(0,16):rows[i%rows.length]);for(const[key,child]of Object.entries(value))if(key!=='hourly')extend(child);};extend(input.source);
  const rows=buildReportFromSource(location,input.source,input.tides,{now:new Date(input.now)}).hydration.report.reports;assert.equal(rows.length,168);
  const normalized=JSON.stringify(rows,(_,v)=>typeof v==='string'?v.replace(/\r\n/g,'\n'):v);
  assert.equal(createHash('sha256').update(normalized).digest('hex'),expected);
});
