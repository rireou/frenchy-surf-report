import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createObservationHandler} from '../netlify/functions/surf-observations.mjs';
import {createObservationSession} from '../netlify/lib/observation-auth.mjs';
import {middletonComparison,snapshotEvidence} from '../netlify/lib/observation-comparison.mjs';
import {buildReportFromSource} from '../netlify/lib/report-runtime.mjs';
import {prospectiveReview} from '../netlify/lib/research-core.mjs';

class Store {
  data=new Map();
  async get(k){return structuredClone(this.data.get(k)??null)}
  async list({prefix=''}){return{blobs:[...this.data.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))}}
  async set(k,v){this.data.set(k,v);return{modified:true}}
  async setJSON(k,v){return this.set(k,v)}
}
const stamp=()=>new Date(Date.now()-20*60000).toISOString();
const sample=(location='Middleton',observedAt=stamp())=>({schemaVersion:3,location,observedAt,predictedFt:2,forecastDistanceMinutes:0,calculationVersion:'synthetic-test',calculatedAt:new Date().toISOString(),evaluationProvenance:{sourceRetrievedAt:new Date().toISOString(),sourceAvailableBeforeObservation:true,archivedBeforeObservation:true,archiveId:'forged'},archiveReference:{id:'forged'},forecastEvidence:{status:'verified-advance',verifiedAdvanceForecast:true}});
function input(snapshot){return{actualFt:2,observedAt:snapshot.observedAt,clientToken:'synthetic-token-'+snapshot.location,snapshot,validationStatus:'confirmed',evaluationDetails:{measurementDefinition:'local-surf-feet',actualValueMeaning:'typical',typicalFt:2,occasionalSetFt:2.5,observationConfidence:'high'}}}
function request(spot,{method='GET',body,cookie,origin='https://fixture.test',id}={}){return new Request('https://fixture.test/api/observations?spot='+spot+(id?'&id='+id:''),{method,headers:{...(cookie?{cookie}:{}),...(method!=='GET'?{origin,'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})}
async function secret(fn){const old=process.env.BEACH_CHECK_SECRET;process.env.BEACH_CHECK_SECRET='synthetic-test-secret-only';try{return await fn('frenchy_observation_admin='+createObservationSession())}finally{if(old===undefined)delete process.env.BEACH_CHECK_SECRET;else process.env.BEACH_CHECK_SECRET=old}}

test('Middleton current calculation uses unchanged model output and is explicitly unverified',async()=>{
  const fixture=JSON.parse(readFileSync('tests/fixtures/middleton-input.json'));
  const report=buildReportFromSource('middleton',fixture.source,fixture.tides,{now:new Date(fixture.now)});
  const observedAt='2026-06-12T02:30:00.000Z';let calls=0;
  const snapshot=await middletonComparison({observedAt,now:new Date('2026-06-12T03:00:00Z'),loadReport:async location=>{calls++;assert.equal(location,'middleton');return report}});
  assert.equal(calls,1);assert.equal(snapshot.predictedFt,7.809256704);assert.equal(snapshot.forecastTime,'2026-06-12T12:00');
  assert.equal(snapshot.forecastEvidence.status,'unverified-comparison');assert.equal(snapshot.forecastEvidence.verifiedAdvanceForecast,false);
  assert.equal(snapshot.evaluationProvenance.archivedBeforeObservation,false);assert.equal(snapshot.archiveReference,undefined);
  await assert.rejects(middletonComparison({observedAt:'2026-06-12T02:30',loadReport:()=>{throw Error('must not fetch')}}),/UTC/);
  await assert.rejects(middletonComparison({observedAt,now:new Date('2026-06-15T03:00:00Z'),loadReport:()=>{throw Error('must not fetch')}}),/48 hours/);
});

test('Middleton authenticated snapshot avoids archive resolver; Seaford never falls back to a current report',async()=>{
  const db=new Store();let archives=0,comparisons=0;
  const handler=createObservationHandler({openStore:()=>db,authorize:()=>true,resolveArchive:async()=>{archives++;throw Object.assign(Error('No valid forecast archive'),{status:404})},resolveComparison:async()=>{comparisons++;return snapshotEvidence(sample())}});
  let r=await handler(new Request('https://fixture.test/api/observations?spot=middleton&action=snapshot&at='+stamp()),{});assert.equal(r.status,200);assert.equal((await r.json()).observation.forecastEvidence.status,'unverified-comparison');
  r=await handler(new Request('https://fixture.test/api/observations?spot=seaford&action=snapshot&at='+stamp()),{});assert.equal(r.status,404);assert.equal(archives,1);assert.equal(comparisons,1);assert.equal(db.data.size,0);
});

for(const spot of ['seaford','middleton'])test(spot+' real authentication, CSRF, save, reload, metadata edit and location isolation',()=>secret(async cookie=>{
  const db=new Store(),name=spot==='seaford'?'Seaford':'Middleton';let archiveReads=0;
  const archived={...sample(name),schemaVersion:4,archiveReference:{id:'sealed-fixture'},evaluationProvenance:{archivedBeforeObservation:true}};
  const handler=createObservationHandler({openStore:()=>db,resolveArchive:async()=>{archiveReads++;return archived}});
  const check=input(spot==='seaford'?archived:sample(name));
  assert.equal((await handler(request(spot,{method:'POST',body:check}),{})).status,401);
  assert.equal((await handler(request(spot,{method:'POST',body:check,cookie,origin:'https://foreign.invalid'}),{})).status,403);
  assert.equal(db.data.size,0);
  const saved=await handler(request(spot,{method:'POST',body:check,cookie}),{});assert.equal(saved.status,201);
  const record=(await saved.json()).observation,original=structuredClone(record.originalForecast);
  assert.equal(record.forecastEvidence.status,spot==='seaford'?'verified-advance':'unverified-comparison');
  assert.equal(record.forecastEvidence.verifiedAdvanceForecast,spot==='seaford');
  if(spot==='middleton'){assert.equal(archiveReads,0);assert.equal(record.snapshot.archiveReference,undefined);assert.equal(record.snapshot.evaluationProvenance.sourceAvailableBeforeObservation,false)}
  const reread=await (await handler(request(spot,{cookie}),{})).json();assert.deepEqual(reread.observations[0],record);
  const edit=await handler(request(spot,{method:'PUT',cookie,id:record.id,body:{actualFt:2,evaluationDetails:{measurementDefinition:'local-surf-feet',actualValueMeaning:'typical',typicalFt:2,occasionalSetFt:3,observationConfidence:'low'}}}),{});assert.equal(edit.status,200);
  const edited=(await edit.json()).observation;assert.equal(edited.evaluationDetails.observationConfidence,'low');assert.equal(edited.evaluationDetails.occasionalSetFt,3);assert.deepEqual(edited.snapshot,record.snapshot);assert.deepEqual(edited.originalForecast,original);assert.equal(edited.evaluationHistory[0].evaluationDetails.observationConfidence,'high');
  const csv=await (await handler(new Request('https://fixture.test/api/observations?spot='+spot+'&format=csv',{headers:{cookie}}),{})).text();assert.match(csv,/forecast_evidence_status/);assert.match(csv,new RegExp(record.forecastEvidence.status));
  const other=spot==='seaford'?'middleton':'seaford';assert.equal((await handler(request(other,{cookie,id:record.id,method:'PUT',body:{actualFt:1}}),{})).status,404);
}));

test('client cannot relabel a current comparison as verified advance or retain forged archive evidence',()=>{
  const raw=sample(),before=JSON.stringify(raw),normalized=snapshotEvidence(raw);
  assert.equal(normalized.forecastEvidence.status,'unverified-comparison');assert.equal(normalized.archiveReference,undefined);assert.equal(normalized.evaluationProvenance.archivedBeforeObservation,false);assert.equal(normalized.evaluationProvenance.archiveId,undefined);assert.equal(normalized.evaluationProvenance.sourceAvailableBeforeObservation,false);assert.equal(JSON.stringify(raw),before);
  assert.equal(snapshotEvidence({...raw,evaluationProvenance:{sourceRetrievedAt:'2020-01-01T00:00:00Z'}}).evaluationProvenance.sourceAvailableBeforeObservation,null);
});

test('Middleton fake advance metadata cannot enter the Seaford prospective dataset',()=>{
  const o={...sample(),actualFt:2,evaluationDetails:{measurementDefinition:'local-surf-feet',actualValueMeaning:'typical',typicalFt:2}};
  assert.equal(prospectiveReview([o],[]).checks,0);
});

test('legacy metadata edit preserves old observation and snapshot without inventing provenance',async()=>{
  const db=new Store(),legacy={id:'legacy',location:'Middleton',revision:1,observedAt:'2025-06-01T00:00:00Z',actualFt:2,predictedFt:2,snapshot:{old:'unchanged'}};
  db.data.set('observations/legacy',structuredClone(legacy));const handler=createObservationHandler({openStore:()=>db,authorize:()=>true});
  const r=await handler(request('middleton',{method:'PUT',id:'legacy',body:{actualFt:2,evaluationDetails:{observationConfidence:'medium'}}}),{});assert.equal(r.status,200);
  const edited=(await r.json()).observation;assert.deepEqual(edited.snapshot,legacy.snapshot);assert.equal(edited.observedAt,legacy.observedAt);assert.equal(edited.forecastEvidence,undefined);
});
import {createHmac} from 'node:crypto';
test('anonymous, forged and expired sessions cannot fetch snapshots for either location',()=>secret(async()=>{
  let accesses=0;const db=new Store();const handler=createObservationHandler({openStore:()=>{accesses++;return db},resolveArchive:async()=>{throw Error('must not fetch')},resolveComparison:async()=>{throw Error('must not fetch')}});
  const payload=Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)-1})).toString('base64url');const expired=payload+'.'+createHmac('sha256',process.env.BEACH_CHECK_SECRET).update(payload).digest('base64url');
  for(const spot of ['seaford','middleton'])for(const value of ['', 'forged.signature',expired]){
    const r=await handler(new Request('https://fixture.test/api/observations?spot='+spot+'&action=snapshot&at='+stamp(),{headers:value?{cookie:'frenchy_observation_admin='+value}:{}}),{});assert.equal(r.status,401);
  }
  assert.equal(accesses,0);
}));
