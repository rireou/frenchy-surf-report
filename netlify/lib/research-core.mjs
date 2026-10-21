// Private research math and immutable evidence contracts. Never imported by public forecasts.
import {createHash} from 'node:crypto';
export const sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
export const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export const digest=value=>sha(canonical(value));
const finite=x=>typeof x==='number'&&Number.isFinite(x);
export const dayOf=iso=>new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Adelaide',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));
export function adelaideUtc(local) {
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(local||''))return null;
  const wall=Date.parse(local.slice(0,16)+':00Z');
  const format=ms=>{
    const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Adelaide',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms));
    const get=k=>p.find(x=>x.type===k)?.value;return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
  };
  const candidates=[570,630].map(m=>wall-m*60000).filter(ms=>format(ms)===local.slice(0,16));
  return candidates.length===1?new Date(candidates[0]).toISOString():null; // Ambiguous/nonexistent DST hours are not invented.
}
export function validateFrozenModel(artifact) {
  const m=artifact?.parameters;
  if(artifact?.id!=='model-d-v1'||!Number.isFinite(Date.parse(artifact.frozenAt))||!m||m.model!=='D'||m.alpha!==10)throw Error('Unknown frozen Model D artifact');
  if(!['medians','means','scales'].every(k=>Array.isArray(m[k])&&m[k].length===5&&m[k].every(finite))||!Array.isArray(m.beta)||m.beta.length!==6||!m.beta.every(finite)||m.scales.some(v=>v<=0))throw Error('Invalid Model D parameters');
  if(artifact.sha256!==digest({id:artifact.id,frozenAt:artifact.frozenAt,parameters:m,protocol:artifact.protocol}))throw Error('Model D fingerprint mismatch');
  return artifact;
}
export function shadowPrediction(row, artifact) {
  const m=validateFrozenModel(artifact).parameters;
  const p=row.finalFt??row.predicted,driver=row.activeDriver||{};
  if(!finite(p))return {predictionFt:null,status:'unavailable'};
  const windSpeed=row.windSpeed,windDir=row.windDir;
  const feature=[p,driver.directionDeg,driver.periodS,row.localRaw?.wave_height,finite(windSpeed)&&finite(windDir)?windSpeed*Math.cos((windDir-270)*Math.PI/180):null];
  const missing=feature.map((v,i)=>finite(v)?null:i).filter(v=>v!=null);
  const z=feature.map((v,i)=>((finite(v)?v:m.medians[i])-m.means[i])/m.scales[i]);
  const adjustment=Math.max(-.75,Math.min(.75,m.beta[0]+z.reduce((s,x,i)=>s+x*m.beta[i+1],0)));
  return {predictionFt:Math.max(0,Math.min(6,p+adjustment)),adjustmentFt:adjustment,status:missing.length?'training-median-imputation':'complete',missingFeatures:missing};
}
export function validateMemoryEvent(value) {
  const allowed=['finding','experiment','decision','evidence-update','protocol','limitation'];
  if(!value||typeof value!=='object'||!allowed.includes(value.kind)||!/^[a-z0-9][a-z0-9._-]{2,100}$/.test(value.id||''))throw Error('Invalid research event');
  for(const key of ['subject','title','conclusion','status'])if(typeof value[key]!=='string'||!value[key].trim()||value[key].length>6000)throw Error('Missing research field '+key);
  if(!Number.isFinite(Date.parse(value.recordedAt))||!Array.isArray(value.evidence)||!Array.isArray(value.modelVersions)||!Array.isArray(value.relations))throw Error('Research provenance is required');
  if(!value.uncertainty&&!(Array.isArray(value.limitations)&&value.limitations.length))throw Error('Record uncertainty or explicit limitations');
  for(const e of value.evidence)if(!e.reference||!e.sha256||!/^[a-f0-9]{64}$/.test(e.sha256))throw Error('Evidence requires a stable reference and hash');
  for(const r of value.relations)if(!['supports','contradicts','qualifies','supersedes'].includes(r.type)||!r.eventId||!r.reason)throw Error('Invalid evidence relationship');
  if(value.metrics!=null&&(!Number.isInteger(value.metrics.nChecks)||!Number.isInteger(value.metrics.nDays)||value.metrics.nChecks<0||value.metrics.nDays<0||value.metrics.nDays>value.metrics.nChecks))throw Error('Metrics require checks and independent-day counts');
  const {sha256,...body}=value;if(sha256&&sha256!==digest(body))throw Error('Research event fingerprint mismatch');
  return {...body,sha256:digest(body)};
}
export function validateLedger(events) {
  const ids=new Set();
  for(const e of events) {validateMemoryEvent(e);if(ids.has(e.id))throw Error('Duplicate research event ID');ids.add(e.id);}
  for(const e of events)for(const r of e.relations)if(!ids.has(r.eventId)||r.eventId===e.id)throw Error('Research relationship references an unknown event');
  return {events:events.length,sha256:digest([...events].sort((a,b)=>a.id.localeCompare(b.id)))};
}
export function chooseArchive(observation, receipts, {minLeadMinutes=10,maxLeadHours=6}={}) {
  const at=Date.parse(observation.observedAt);if(!Number.isFinite(at))return null;
  const choices=[];
  for(const receipt of receipts) {
    const sealed=Date.parse(receipt.sealedAt),captured=Date.parse(receipt.capturedAt),frozen=Date.parse(receipt.modelFrozenAt);
    const lead=(at-sealed)/60000;
    if(![sealed,captured,frozen].every(Number.isFinite)||captured>sealed||frozen>captured||receipt.status!=='sealed'||receipt.origin!=='scheduled-server'||lead<minLeadMinutes||lead>maxLeadHours*60||receipt.sourceStale)continue;
    const row=receipt.rows?.filter(r=>r.validAtUtc&&finite(r.productionFt)&&finite(r.modelDFt)&&(!receipt.modelDSha256||r.modelDSha256===receipt.modelDSha256)&&(!receipt.calculationSourceSha256||r.calculationSourceSha256===receipt.calculationSourceSha256)).map(row=>({row,distance:Math.abs(Date.parse(row.validAtUtc)-at)/60000})).sort((a,b)=>a.distance-b.distance)[0];
    if(row?.distance<=30)choices.push({receipt,row:row.row,distanceMinutes:row.distance,archiveLeadMinutes:lead});
  }
  return choices.sort((a,b)=>b.receipt.sealedAt.localeCompare(a.receipt.sealedAt))[0]||null;
}
export function scorePairs(pairs, field='productionFt',dayWeighted=false) {
  if(!pairs.length)return {n:0,days:0,mae:null,rmse:null,bias:null,within05:null,within1:null,over05:0,under05:0,largeSurfUndercalls:0};
  const counts=new Map();for(const p of pairs)counts.set(p.day,(counts.get(p.day)||0)+1);
  const weight=p=>dayWeighted?1/counts.get(p.day)/counts.size:1/pairs.length;
  const avg=fn=>pairs.reduce((s,p)=>s+weight(p)*fn(p[field]-p.actualFt),0);
  return {n:pairs.length,days:counts.size,mae:avg(Math.abs),rmse:Math.sqrt(avg(e=>e*e)),bias:avg(e=>e),within05:avg(e=>Math.abs(e)<=.500001?1:0),within1:avg(e=>Math.abs(e)<=1.000001?1:0),over05:pairs.filter(p=>p[field]-p.actualFt>.500001).length,under05:pairs.filter(p=>p[field]-p.actualFt<-.500001).length,largeSurfUndercalls:pairs.filter(p=>p.actualFt>=3&&p.actualFt-p[field]>.5).length};
}
export function pairedInterval(pairs, count=2000) {
  const groups=new Map();for(const p of pairs){if(!groups.has(p.day))groups.set(p.day,[]);groups.get(p.day).push(Math.abs(p.productionFt-p.actualFt)-Math.abs(p.modelDFt-p.actualFt));}
  const means=[...groups.values()].map(v=>v.reduce((a,b)=>a+b,0)/v.length);if(means.length<2)return {days:means.length,low:null,high:null,mean:means[0]??null};
  let seed=20261021;const rng=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296};
  const values=Array.from({length:count},()=>means.reduce(s=>s+means[Math.floor(rng()*means.length)],0)/means.length).sort((a,b)=>a-b);
  return {days:means.length,low:values[Math.floor(count*.025)],high:values[Math.floor(count*.975)],mean:means.reduce((a,b)=>a+b,0)/means.length};
}
export function prospectiveReview(observations, receipts) {
  const pairs=[],excluded=[];
  for(const o of observations) {
    const d=o.evaluationDetails||{},actual=d.actualValueMeaning==='typical'?(d.typicalFt??o.actualFt):d.typicalFt;
    const match=chooseArchive(o,receipts);
    let reason=!match?'no-verified-pre-observation-archive':d.measurementDefinition!=='local-surf-feet'||!finite(actual)?'typical-local-surf-size-not-defined':null;
    if(reason){excluded.push({id:o.id,reason});continue;}
    if(o.location&&o.location.toLowerCase()!=='seaford')continue;
    if(!/^[a-f0-9]{64}$/.test(match.row.calculationSourceSha256||'')||!/^[a-f0-9]{64}$/.test(match.row.modelDSha256||'')){excluded.push({id:o.id,reason:'missing-version-fingerprint'});continue;}
    pairs.push({...match.row,observationId:o.id,observedAt:o.observedAt,day:dayOf(o.observedAt),actualFt:actual,archiveId:match.receipt.id,archiveLeadMinutes:match.archiveLeadMinutes,confidence:d.observationConfidence||'unknown',occasionalSetFt:d.occasionalSetFt??null});
  }
  const byVersion={};for(const p of pairs){const key=p.productionVersion+' / '+p.calculationSourceSha256+' / '+p.modelDSha256;(byVersion[key]??=[]).push(p);}
  const groups=Object.entries(byVersion).map(([version,rows])=>({version,production:scorePairs(rows),modelD:scorePairs(rows,'modelDFt'),productionDayWeighted:scorePairs(rows,'productionFt',true),modelDDayWeighted:scorePairs(rows,'modelDFt',true),interval:pairedInterval(rows),eventSensitivity:pairedInterval(eventCollapsed(rows)),strata:conditionScores(rows),improved:rows.filter(p=>Math.abs(p.modelDFt-p.actualFt)<Math.abs(p.productionFt-p.actualFt)-1e-9).length,worsened:rows.filter(p=>Math.abs(p.modelDFt-p.actualFt)>Math.abs(p.productionFt-p.actualFt)+1e-9).length}));
  const days=new Set(pairs.map(p=>p.day)).size;
  return {schemaVersion:1,classification:'prospective-archived-forecast',definition:'Typical waves on local surf-size scale; model D training target historically unspecified',minArchiveLeadMinutes:10,days,checks:pairs.length,reviewMilestoneDays:30,milestoneReached:days>=30,adoptionApproved:false,groups,pairs,excluded};
}
function eventCollapsed(rows) {
  const days=[...new Set(rows.map(r=>r.day))].sort(),block={};let n=0,last=null;
  for(const day of days){if(!last||Date.parse(day)-Date.parse(last)>86400000)n++;block[day]='event-'+n;last=day;}
  // Equal days within each contiguous-day block, then equal blocks. These are proxies, not known independent swell events.
  return days.map(day=>{const sub=rows.filter(r=>r.day===day);return {day:block[day],actualFt:0,productionFt:sub.reduce((s,r)=>s+Math.abs(r.productionFt-r.actualFt),0)/sub.length,modelDFt:sub.reduce((s,r)=>s+Math.abs(r.modelDFt-r.actualFt),0)/sub.length};});
}
export function conditionScores(rows) {
  const groups={};
  for(const row of rows) {
    const labels=[row.directionDeg==null?'Direction unknown':row.directionDeg>245?'Direction >245°':row.directionDeg>225&&row.directionDeg<=235?'Direction 225–235°':'Other direction',row.periodS==null?'Period unknown':row.periodS>=14?'Period ≥14 s':'Period <14 s',row.heightM==null?'Offshore unknown':row.heightM>=2.8?'Offshore ≥2.8 m':'Offshore <2.8 m',row.windDir==null?'Wind unknown':row.windDir>=350||row.windDir<=100?'N/NE/E wind':'Other wind',row.windSpeed==null?'Wind speed unknown':row.windSpeed>=20?'Wind ≥20 km/h':'Wind <20 km/h','Tide '+(row.tideStage||'unknown')];
    for(const label of labels)(groups[label]??=[]).push(row);
  }
  return Object.entries(groups).map(([label,rows])=>({label,production:scorePairs(rows),modelD:scorePairs(rows,'modelDFt'),insufficientEvidence:new Set(rows.map(r=>r.day)).size<10}));
}
