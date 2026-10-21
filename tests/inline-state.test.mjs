import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {packInlineState,unpackInlineState} from '../netlify/lib/inline-state.mjs';
import {buildReportFromSource,buildObservationSnapshot} from '../netlify/lib/report-runtime.mjs';
import {__test} from '../netlify/functions/surf-report.mjs';
const json=value=>JSON.parse(JSON.stringify(value));

test('inline transport preserves JSON data, dangerous keys and independent repeated objects',()=>{
  const shared={long:'A diagnostic string. '.repeat(200),values:[0,null,false,'',-1]};
  const data=JSON.parse('{"__proto__":{"safe":true},"constructor":"text"}');
  Object.assign(data,{a:shared,b:shared,date:new Date('2026-10-21T00:00:00Z'),missing:undefined,nan:NaN});
  const restored=unpackInlineState(json(packInlineState(data)));
  assert.deepEqual(restored,json(data));
  assert.notEqual(restored.a,restored.b,'Do not introduce shared mutable references after decoding');
  assert.equal(Object.getPrototypeOf(restored),Object.prototype);
  assert.equal({}.safe,undefined);
  assert.throws(()=>{const loop={};loop.self=loop;packInlineState(loop);},/Circular/);
});

function extend(value){
  if(!value||typeof value!=='object')return;
  if(value.hourly?.time)for(const[key,rows]of Object.entries(value.hourly))if(Array.isArray(rows))value.hourly[key]=Array.from({length:168},(_,i)=>key==='time'?new Date(Date.UTC(2026,5,12,i)).toISOString().slice(0,16):rows[i%rows.length]);
  for(const[key,child]of Object.entries(value))if(key!=='hourly')extend(child);
}

for(const location of ['seaford','middleton'])test(`${location}: 168-hour HTML fits crawl budget with complete hydration and observation snapshots`,()=>{
  const input=JSON.parse(readFileSync(`tests/fixtures/${location}-input.json`,'utf8'));
  extend(input.source);
  const result=buildReportFromSource(location,input.source,input.tides,{now:new Date(input.now)});
  const html=__test.renderReportHtml(__test.LOCATION_MAP[location],result);
  assert.ok(Buffer.byteLength(html)<1900000,'Full report HTML must fit below Googlebot\'s 2 MB limit');
  const start=html.indexOf('window.__FRENCHY_CANONICAL_REQUIRED__');
  assert.ok(html.indexOf('id="mainSize"')<start,'Visible report must precede hydration data');
  assert.ok(html.indexOf('report-intro',html.indexOf('<body>'))<start,'Discovery links must precede hydration data');
  assert.ok(start<html.indexOf('<script src="./phase1-engine.js">'),'Hydration must precede application execution');
  const script=html.match(/<script>(window\.__FRENCHY_CANONICAL_REQUIRED__=[\s\S]*?)<\/script>/)[1];
  const context={window:{}};
  vm.runInNewContext(script,context,{timeout:2000});
  const restored=json(context.window.__FRENCHY_SSR_STATE__);
  assert.deepEqual(restored,json(result.hydration));
  assert.equal(restored.report.reports.length,168);
  assert.deepEqual(json(context.window.__FRENCHY_CANONICAL_REPORT__),json(result.canonical));
  const observedAt='2026-06-12T06:00:00+09:30';
  const before=buildObservationSnapshot(location,result,observedAt);
  const after=buildObservationSnapshot(location,{...result,hydration:restored},observedAt);
  assert.ok(before&&after);
  delete before.calculatedAt;delete after.calculatedAt;
  assert.deepEqual(json(after),json(before),'All observation snapshot fields must remain available');
  console.log(`${location}: ${Buffer.byteLength(html)} bytes, 168 rows, observation snapshot preserved`);
});
