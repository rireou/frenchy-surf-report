import {getSurfReport} from './report-source.mjs';
import {buildObservationSnapshot} from './report-runtime.mjs';

// Current Middleton comparisons are not evidence of an advance forecast.
export function snapshotEvidence(snapshot, verifiedAdvance=false, receivedAt=new Date().toISOString()) {
  const copy=structuredClone(snapshot),prior=copy.evaluationProvenance||{};
  if(verifiedAdvance) {
    copy.evaluationProvenance={...prior,advanceForecastVerified:true,archivedBeforeObservation:true};
    copy.forecastEvidence={status:'verified-advance',verifiedAdvanceForecast:true,archiveId:copy.archiveReference?.id||null};
  } else {
    delete copy.archiveReference;
    const sourceTime=Date.parse(prior.sourceRetrievedAt),observedTime=Date.parse(copy.observedAt);
    const {archiveId,archiveLeadMinutes,...unverified}=prior;
    copy.evaluationProvenance={...unverified,archivedBeforeObservation:false,advanceForecastVerified:false,
      sourceAvailableBeforeObservation:Number.isFinite(sourceTime)&&sourceTime>observedTime?false:null};
    copy.forecastEvidence={status:'unverified-comparison',verifiedAdvanceForecast:false,
      reason:copy.location==='Middleton'?'middleton-archives-not-supported':'no-verified-advance-archive',
      comparisonCalculatedAt:copy.calculatedAt||null,receivedAt};
  }
  return copy;
}

export async function middletonComparison({observedAt,now=new Date(),loadReport=getSurfReport}) {
  const at=Date.parse(observedAt);
  if(!/Z$|[+-]\d\d:\d\d$/.test(observedAt||'')||!Number.isFinite(at))throw Object.assign(Error('An unambiguous UTC observation time is required'),{status:400});
  if(at>+now||+now-at>48*3600000)throw Object.assign(Error('Choose an observation time within the previous 48 hours'),{status:400});
  const result=await loadReport('middleton');
  const snapshot=buildObservationSnapshot('middleton',result,observedAt);
  if(!snapshot)throw Object.assign(Error('No current Middleton comparison row matches this time. No verified advance forecast is available.'),{status:404});
  return snapshotEvidence(snapshot,false,now.toISOString());
}
