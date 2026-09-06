import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildReportFromSource, createLegacyEngine, buildObservationSnapshot } from '../netlify/lib/report-runtime.mjs';
import { __test as renderer } from '../netlify/functions/surf-report.mjs';
const helper=readFileSync('phase1-engine.js','utf8');
test('spot introductions are concise and cross-linked without beach-check claims',()=>{
  for(const [file,target] of [['index.html','middleton.html'],['middleton.html','index.html']]){
    const html=readFileSync(file,'utf8');
    assert.doesNotMatch(html,/Local guide|Frenchy's beach checks/);
    const intro=html.match(/<p class="subtitle report-intro">([\s\S]*?)<\/p>/)?.[1];
    assert.ok(intro);
    assert.ok(intro.includes('href="./'+target+'"'));
    assert.doesNotMatch(intro,/coaching/);
  }
});
function fixture(spot){return JSON.parse(readFileSync('tests/fixtures/'+spot+'-input.json','utf8'))}
for(const spot of ['seaford','middleton']){
  test(spot+' missing wind is unknown, not zero, clean or flat',()=>{
    const input=fixture(spot);
    input.source.wind.hourly.wind_speed_10m=input.source.wind.hourly.time.map(()=>null);
    input.source.wind.hourly.wind_direction_10m=input.source.wind.hourly.time.map(()=>null);
    const result=buildReportFromSource(spot,input.source,input.tides,{now:new Date(input.now)});
    assert.equal(result.canonical.wind.speed_kmh,null);
    assert.equal(result.canonical.wind.direction_deg,null);
    assert.equal(result.canonical.wave.value_ft,null);
    assert.equal(result.canonical.wave.display,'Unavailable');
    assert.equal(result.canonical.wave.min_ft,null);
    assert.equal(buildObservationSnapshot(spot,result,'2026-06-12T02:30:00Z'),null);
    assert.match(result.canonical.summary.text,/unavailable/i);
    for(const r of result.hydration.report.reports){
      assert.equal(r.windSpeed,null);assert.equal(r.finalFt,null);assert.equal(r.windQuality,0);
    }
    const html=renderer.renderReportHtml(renderer.LOCATION_MAP[spot],result);
    assert.match(html,/id="windMain">Unknown/);
    assert.doesNotMatch(JSON.stringify(renderer.reportJsonLd(result.canonical)),/"name":"Wind speed","value":0/);
  });
  test(spot+' every valid row has raw input provenance and reconciled trace',()=>{
    const i=fixture(spot),r=buildReportFromSource(spot,i.source,i.tides,{now:new Date(i.now)});
    for(const row of r.hydration.report.reports){
      assert.ok(row.calculationTrace.steps.length>0);
      assert.equal(row.calculationTrace.finalFt,row.finalFt);
      assert.equal(row.calculationTrace.steps.at(-1).afterFt,row.finalFt);
      assert.equal(row.provenance.forecastValidLocal,row.time);
      assert.equal(row.provenance.modelIssuedAt,null);
      assert.ok(row.calculationTrace.rawInputs.wind);
    }
    const obs=buildObservationSnapshot(spot,r,'2026-06-12T02:30:00Z');
    assert.ok(obs.provenance);assert.ok(obs.calculationTrace);
  });
}
test('daylight, minute formatting and single-unit output',()=>{
  const ctx=vm.createContext({});
  vm.runInContext(helper+';globalThis.api=installPhase1(()=>({data:{weather:{daily:{time:["2026-09-05"],sunrise:["2026-09-05T06:34"],sunset:["2026-09-05T18:02"]}}}}),{},"seaford")',ctx);
  assert.equal(ctx.api.bounds('2026-09-05').end,1082);
  assert.equal(ctx.api.clock('2026-09-05T18:02'),'6:02 PM');
  assert.equal(ctx.api.unit('5ft'),'5 ft');
  assert.equal(ctx.api.unit('Flat'),'Flat');
  assert.equal(ctx.api.daylight({time:'2026-09-05T00:00'}),false);
  assert.equal(ctx.api.daylight({time:'2026-09-05T18:02'}),false);
  assert.equal(ctx.api.bounds('2026-09-06').source.includes('fallback'),true);
});
test('UI does not claim fabricated confidence or convert missing text to a quality score',()=>{
  const ui=readFileSync('frenchy-ui-v6.js','utf8');
  assert.doesNotMatch(ui,/High confidence|width:88%|width:64%|width:82%|3\.2\+score/);
  assert.doesNotMatch(ui,/FORECAST CONFIDENCE|FRENCHY BEACH CHECK|confidenceTitle|beachCheck|loadBeachCheck|functions\/beach-check/);
  assert.match(ui,/BEACH COMFORT/);
  assert.match(ui,/Not assessed/);
});
test('both API implementations and browser fallbacks retain null wind',()=>{
  for(const file of ['index.html','middleton.html','netlify/functions/seaford-data.js','netlify/functions/middleton-data.js']){
    const text=readFileSync(file,'utf8');assert.doesNotMatch(text,/buildCalmWindFallback|using calm fallback/);
    assert.match(text,/sunrise,sunset/);
  }
});
test('unknown numeric inputs differ from actual calm wind',()=>{
  const ctx=vm.createContext({});
  vm.runInContext(helper+';globalThis.valid=phase1Number',ctx);
  for(const value of [null,undefined,'',NaN,Infinity])assert.equal(ctx.valid(value),false);
  assert.equal(ctx.valid(0),true);
});
test('observation updates preserve original prediction and archive replaced snapshots',()=>{
  const source=readFileSync('netlify/functions/surf-observations.mjs','utf8');
  assert.match(source,/originalForecast: current.originalForecast \|\|/);
  assert.match(source,/forecastHistory: validated.snapshot/);
  const fn=source.match(/function finiteNumber\(value, min, max\) \{[\s\S]*?\n\}/)[0];
  const ctx=vm.createContext({});vm.runInContext(fn+';globalThis.check=finiteNumber',ctx);
  assert.equal(ctx.check(null,0,8),null);assert.equal(ctx.check('',0,8),null);
  assert.equal(ctx.check(0,0,8),0);
});
