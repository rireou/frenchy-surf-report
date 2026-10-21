import test from 'node:test';
import assert from 'node:assert/strict';
import {validateEvaluationDetails,evaluationProvenance} from '../netlify/lib/observation-evaluation.mjs';
import {readFileSync} from 'node:fs';
import {buildObservationSnapshot,buildReportFromSource} from '../netlify/lib/report-runtime.mjs';

test('legacy observations remain compatible; missing evaluation fields stay unknown',()=>{
  assert.equal(validateEvaluationDetails(undefined),undefined);
  const details=validateEvaluationDetails({});assert.equal(details.typicalFt,null);assert.equal(details.actualValueMeaning,'unspecified');assert.equal(details.measurementDefinition,'unknown');assert.equal(details.observerIdentityVerified,false);
});
test('new observations preserve separate typical and occasional sizes without inferring identity',()=>{
  const input={measurementDefinition:'local-surf-feet',actualValueMeaning:'occasional-sets',typicalFt:1,occasionalSetFt:2,observationConfidence:'high',observerLabel:'Observer A',unusualLocalFactors:'Slow sets'};
  const before=structuredClone(input),output=validateEvaluationDetails(input);assert.deepEqual(input,before);assert.equal(output.typicalFt,1);assert.equal(output.occasionalSetFt,2);assert.equal(output.observerIdentityVerified,false);assert.equal(output.unusualLocalFactors,'Slow sets');
  assert.throws(()=>validateEvaluationDetails({typicalFt:2,occasionalSetFt:1}),/smaller/);assert.throws(()=>validateEvaluationDetails({typicalFt:-1}),/between/);
  assert.equal(validateEvaluationDetails({actualValueMeaning:'typical'},1.5).typicalFt,1.5);
  assert.throws(()=>validateEvaluationDetails({actualValueMeaning:'typical',typicalFt:1},2),/match/);
});
test('lead time uses provider issue time only; retrospective source retrieval remains visible',()=>{
  const p=evaluationProvenance({observedAt:'2026-10-21T07:10:00Z',forecastLocalTime:'2026-10-21T18:00',sourceRetrievedAt:'2026-10-21T08:00:00Z'});
  assert.equal(p.forecastValidAtUtc,'2026-10-21T07:30:00.000Z');assert.equal(p.forecastLeadTimeMinutes,null);assert.equal(p.sourceAgeAtObservationMinutes,-50);assert.equal(p.sourceRetrievalLeadMinutes,-30);assert.equal(p.sourceAvailableBeforeObservation,false);assert.equal(p.codeRevision,null);
});
test('winter offset and genuine provider issue time are captured exactly',()=>{
  const p=evaluationProvenance({observedAt:'2026-07-21T02:10:00Z',forecastLocalTime:'2026-07-21T12:00',sourceRetrievedAt:'2026-07-21T02:00:00Z',providerIssuedAt:'2026-07-21T00:00:00Z',revision:'a'.repeat(40)});
  assert.equal(p.forecastValidAtUtc,'2026-07-21T02:30:00.000Z');assert.equal(p.forecastLeadTimeMinutes,150);assert.equal(p.sourceAgeAtObservationMinutes,10);assert.equal(p.codeRevision,'a'.repeat(40));
});
test('snapshot includes a stable exact calculation source fingerprint even without deployment metadata',()=>{
  const input=JSON.parse(readFileSync('tests/fixtures/seaford-input.json','utf8'));
  const result=buildReportFromSource('seaford',input.source,input.tides,{now:new Date(input.now)});
  const a=buildObservationSnapshot('seaford',result,'2026-06-11T20:30:00Z'),b=buildObservationSnapshot('seaford',result,'2026-06-12T02:30:00Z');
  assert.match(a.calculationSourceSha256,/^[a-f0-9]{64}$/);assert.equal(a.calculationSourceSha256,b.calculationSourceSha256);assert.equal(a.predictedFt,2);assert.equal(b.predictedFt,2.5);
});
