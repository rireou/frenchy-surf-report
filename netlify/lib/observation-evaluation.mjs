// Additive metadata for new checks; never estimates missing historical fields.
const finite=(value,min,max)=>value!==''&&value!=null&&Number.isFinite(Number(value))&&Number(value)>=min&&Number(value)<=max?Number(value):null;
export function validateEvaluationDetails(value, actualFt=null) {
  if(value==null)return undefined;
  if(typeof value!=='object'||Array.isArray(value))throw Error('Invalid observation evaluation details');
  const definition=['unknown','local-surf-feet','wave-face-feet'].includes(value.measurementDefinition)?value.measurementDefinition:'unknown';
  if(value.observationConfidence!=null&&!['unknown','low','medium','high'].includes(value.observationConfidence))throw Error('Choose a valid observation confidence');
  const confidence=value.observationConfidence||'unknown';
  const target=['unspecified','typical','occasional-sets'].includes(value.actualValueMeaning)?value.actualValueMeaning:'unspecified';
  const size=key=>{if(value[key]==null||value[key]==='')return null;const n=finite(value[key],0,8);if(n==null)throw Error('Observed sizes must be between 0 and 8 ft');return n;};
  let typicalFt=size('typicalFt'),occasionalSetFt=size('occasionalSetFt');
  if(Number.isFinite(actualFt)&&target!=='unspecified') {
    const entered=target==='typical'?typicalFt:occasionalSetFt;
    if(entered!=null&&Math.abs(entered-actualFt)>.01)throw Error('The size definition must match the actual size entered above');
    if(target==='typical')typicalFt=actualFt;else occasionalSetFt=actualFt;
  }
  if(typicalFt!=null&&occasionalSetFt!=null&&occasionalSetFt<typicalFt)throw Error('Occasional sets cannot be smaller than typical surf');
  return {schemaVersion:1,measurementDefinition:definition,observationConfidence:confidence,actualValueMeaning:target,typicalFt,occasionalSetFt,
    unusualLocalFactors:String(value.unusualLocalFactors||'').trim().slice(0,300),observerLabel:String(value.observerLabel||'').trim().slice(0,80),observerIdentityVerified:false};
}
export function evaluationProvenance({observedAt,forecastLocalTime,sourceRetrievedAt,providerIssuedAt,revision=null}) {
  const observed=new Date(observedAt),wallParts=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Adelaide',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(observed);
  const part=k=>wallParts.find(p=>p.type===k)?.value;
  const wallMs=Date.parse(`${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}Z`);
  const offset=wallMs-Math.floor(observed.getTime()/1000)*1000;
  const validMs=Date.parse(forecastLocalTime+'Z')-offset;
  const difference=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)?Math.round((a-b)/60000*100)/100:null;
  const retrievedMs=Date.parse(sourceRetrievedAt),issueMs=Date.parse(providerIssuedAt);
  return {schemaVersion:1,forecastValidAtUtc:Number.isFinite(validMs)?new Date(validMs).toISOString():null,
    providerIssuedAt:providerIssuedAt||null,forecastLeadTimeMinutes:difference(validMs,issueMs),
    sourceRetrievedAt:sourceRetrievedAt||null,sourceRetrievalLeadMinutes:difference(validMs,retrievedMs),
    sourceAgeAtObservationMinutes:difference(observed.getTime(),retrievedMs),
    sourceAvailableBeforeObservation:Number.isFinite(retrievedMs)?retrievedMs<=observed.getTime():null,
    codeRevision:/^[0-9a-f]{40}$/i.test(revision||'')?revision:null};
}
