// Read-only historical observation lookup. No providers or recalculation.
import {gunzipSync} from 'node:zlib';
import {sha,chooseArchive} from './research-core.mjs';
import {listJson,researchEnvironment,researchStore} from './research-store.mjs';
export const noArchive=()=>Object.assign(new Error('No valid forecast archived before this observation time is available. No later forecast has been substituted.'),{status:404,code:'NO_ARCHIVED_FORECAST'});
export async function archivedObservation({store,location,observedAt,now=new Date()}) {
  if(!/Z$|[+-]\d\d:\d\d$/.test(observedAt||'')||!Number.isFinite(Date.parse(observedAt)))throw Object.assign(new Error('An unambiguous UTC observation time is required'),{status:400});
  const at=Date.parse(observedAt);if(at>+now||+now-at>48*3600000)throw Object.assign(new Error('Choose an observation time within the previous 48 hours'),{status:400});
  if(location!=='Seaford')throw noArchive();
  const match=chooseArchive({observedAt},await listJson(store,'receipts/'));if(!match)throw noArchive();
  const {receipt,row}=match;
  if(!/^[a-f0-9]{64}$/.test(receipt.payloadSha256||'')||receipt.payloadKey!==`payloads/${receipt.id}.json.gz`)throw noArchive();
  const data=await store.get(receipt.payloadKey,{type:'arrayBuffer'});if(!data)throw noArchive();
  const bytes=Buffer.from(data);if(bytes.length>500000||sha(bytes)!==receipt.payloadSha256)throw noArchive();
  const payload=JSON.parse(gunzipSync(bytes,{maxOutputLength:16000000}));
  const report=payload.hydration?.report?.reports?.find(r=>r.time===row.validAtLocal);
  if(payload.id!==receipt.id||payload.hydration?.location!=='seaford'||!report||report.finalFt!==row.productionFt||payload.model?.sha256!==receipt.modelDSha256)throw noArchive();
  const compass=Number.isFinite(report.windDir)?['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(((report.windDir%360+360)%360)/22.5)%16]:null;
  return {schemaVersion:4,location:'Seaford',observedAt:new Date(at).toISOString(),calculatedAt:receipt.capturedAt,
    calculationVersion:receipt.productionVersion,calculationSourceSha256:receipt.calculationSourceSha256,
    forecastTime:row.validAtLocal,forecastDistanceMinutes:match.distanceMinutes,predictedFt:row.productionFt,modelPredictedFt:report.originalFinalFt??row.productionFt,
    activeDriver:report.activeDriver,offshore:report.offshoreRaw,local:report.localRaw,wind:report.windRaw,
    windContext:{speedKmh:report.windSpeed,directionDeg:report.windDir,directionCompass:compass,label:compass&&Number.isFinite(report.windSpeed)?`${compass} wind · ${Math.round(report.windSpeed)} km/h`:'Wind unavailable'},
    tide:{heightM:row.tideHeightM,stage:row.tideStage,positionLabel:row.tideStage||'Unknown',source:'Frozen archived forecast'},
    calculationResult:report,calculationTrace:report.calculationTrace,provenance:report.provenance,
    dataContext:{dataSource:'sealed-forecast-archive',generatedAt:receipt.sourceRetrievedAt,staleDataUsed:false},
    archiveReference:{id:receipt.id,sealedAt:receipt.sealedAt,capturedAt:receipt.capturedAt,payloadSha256:receipt.payloadSha256,forecastValidAtUtc:row.validAtUtc},
    evaluationProvenance:{schemaVersion:2,forecastValidAtUtc:row.validAtUtc,providerIssuedAt:row.providerIssuedAt||null,sourceRetrievedAt:receipt.sourceRetrievedAt,sourceAvailableBeforeObservation:true,archiveLeadMinutes:match.archiveLeadMinutes,archiveId:receipt.id,archivedBeforeObservation:true}};
}
export const resolveArchivedObservation=({context,...query})=>archivedObservation({...query,store:researchStore(researchEnvironment(context))});
