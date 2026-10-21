import {gzipSync} from 'node:zlib';
import {randomUUID} from 'node:crypto';
import {buildReportFromSource,buildObservationSnapshot,createLegacyEngine} from './report-runtime.mjs';
import {readProjectText,readProjectJson} from './project-files.mjs';
import {adelaideUtc,sha,digest,shadowPrediction,validateFrozenModel} from './research-core.mjs';
import {putImmutable} from './research-store.mjs';
export async function archiveForecast({source,model,store,now=()=>new Date(),origin='scheduled-server',id=randomUUID(),tides=readProjectJson('port_noarlunga_2026_tides.json')}) {
  validateFrozenModel(model);
  const capturedAt=now().toISOString(),captured=Date.parse(capturedAt),retrieved=Date.parse(source.generatedAt);
  if(Date.parse(model.frozenAt)>captured||!Number.isFinite(retrieved)||retrieved>captured+300000||captured-retrieved>3600000||source.staleDataUsed||!source.ok)throw Error('Fresh time-valid source and already-frozen model required');
  const result=buildReportFromSource('seaford',source,tides,{now:new Date(capturedAt)}),hydration=result.hydration;
  const first=hydration.report.reports.find(row=>Number.isFinite(row.finalFt));if(!first)throw Error('No complete predictions');
  const fingerprint=buildObservationSnapshot('seaford',result,adelaideUtc(first.time))?.calculationSourceSha256;if(!fingerprint)throw Error('Missing calculation fingerprint');
  const engine=createLegacyEngine('seaford');engine.state.portNoarlungaTides=hydration.tides;
  const rows=hydration.report.reports.map(row=>{
    const shadow=shadowPrediction(row,model),tide=engine.currentTideObservationSnapshot(row.time);
    return {validAtLocal:row.time,validAtUtc:adelaideUtc(row.time),productionFt:row.finalFt,modelDFt:shadow.predictionFt,shadowStatus:shadow.status,missingFeatures:shadow.missingFeatures||[],productionVersion:result.canonical.calculation_version,calculationSourceSha256:fingerprint,modelDSha256:model.sha256,directionDeg:row.activeDriver?.directionDeg??null,heightM:row.activeDriver?.heightM??null,periodS:row.activeDriver?.periodS??null,localWave:row.localRaw?.wave_height??null,windSpeed:row.windSpeed??null,windDir:row.windDir??null,tideHeightM:tide?.heightM??null,tideStage:tide?.stage??null,providerIssuedAt:row.provenance?.modelIssuedAt||null};
  }).filter(r=>r.validAtUtc&&Number.isFinite(r.productionFt)&&Number.isFinite(r.modelDFt));
  const matchingRows=rows.filter(row=>Date.parse(row.validAtUtc)>=captured-1800000&&Date.parse(row.validAtUtc)<=captured+6.5*3600000);
  if(!matchingRows.length)throw Error('Source has no valid forecast in the archive matching horizon');
  const payload={schemaVersion:1,id,capturedAt,source,hydration,comparisonRows:rows,model,codeRevision:process.env.COMMIT_REF||null,runtime:{node:process.version,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,platform:process.platform},sourceFiles:{'index.html':readProjectText('index.html'),'phase1-engine.js':readProjectText('phase1-engine.js'),'port_noarlunga_2026_tides.json':tides}};
  const compressed=gzipSync(JSON.stringify(payload));if(compressed.length>500000)throw Error('Archive exceeds 500 KB compressed budget');
  const key='payloads/'+id+'.json.gz';const written=await store.set(key,compressed,{onlyIfNew:true});if(!written?.modified)throw Error('Archive payload ID collision');
  // Seal only after durable payload write succeeds; observation-triggered snapshots never receive this origin.
  const receipt={schemaVersion:1,id,status:'sealed',origin,capturedAt,sealedAt:now().toISOString(),sourceRetrievedAt:source.generatedAt,providerIssueTimeKnown:rows.some(r=>r.providerIssuedAt),sourceStale:false,modelFrozenAt:model.frozenAt,modelDSha256:model.sha256,productionVersion:result.canonical.calculation_version,calculationSourceSha256:fingerprint,payloadKey:key,payloadSha256:sha(compressed),payloadBytes:compressed.length,rows:matchingRows,totalForecastRows:rows.length};
  await putImmutable(store,'receipts/'+id+'.json',receipt);return receipt;
}
export async function scheduledArchive({env=process.env,store,fetchSource,now=()=>new Date()}) {
  if(env.RESEARCH_ARCHIVE_ENABLED!=='true'||env.CONTEXT!=='production'||!env.SITE_ID||env.RESEARCH_DEPLOY_PUBLISHED!=='true')return {status:'disabled'};
  const model=await store.get('models/model-d-v1.json',{type:'json'});if(!model)return {status:'missing-frozen-model'};
  validateFrozenModel(model);if(Date.parse(model.frozenAt)>now().getTime())throw Error('Future model freeze');
  // Idempotent slot lock also bounds concurrent retries and provider usage. A failed slot is visible, never faked/backfilled.
  const slot=new Date(Math.floor(now().getTime()/10800000)*10800000).toISOString();
  const lock=await store.set('slots/'+slot,JSON.stringify({startedAt:now().toISOString()}),{onlyIfNew:true});if(!lock?.modified)return {status:'already-attempted'};
  try {const receipt=await archiveForecast({source:await fetchSource(),model,store,now});await putImmutable(store,'health/'+slot+'.json',{slot,status:'sealed',receiptId:receipt.id,at:now().toISOString()});return {status:'sealed',id:receipt.id};}
  catch {await putImmutable(store,'health/'+slot+'.json',{slot,status:'failed',at:now().toISOString(),reason:'Source, calculation or durable storage unavailable; no valid forecast archive produced.'});return {status:'failed'};}
}
