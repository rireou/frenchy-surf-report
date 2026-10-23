// Offline sensitivity only. Writes evidence outside the public repository.
import fs from 'node:fs/promises';import path from 'node:path';
import {buildReportFromSource} from '../../netlify/lib/report-runtime.mjs';
import {pairedInterval,scorePairs} from '../../netlify/lib/research-core.mjs';
import {readLedger,verify,privatePath} from '../memory/cli.mjs';
const directory=privatePath(process.argv[2]||'../frenchy-research-private');
const evidenceId=process.argv[3]||'period-31';if(!/^[a-z0-9-]+$/.test(evidenceId))throw Error('Use a safe new evidence ID');
try{await fs.access(path.join(directory,'evidence',evidenceId+'.json'));throw Error('Evidence already exists; use a new run ID rather than overwrite historical results');}catch(error){if(error.code!=='ENOENT')throw error;}
const ledger=await verify(directory),events=await readLedger(directory);
const input=JSON.parse(await fs.readFile('tests/fixtures/seaford-input.json')),html=await fs.readFile('index.html','utf8');
const bonus=p=>p<=9?-.5:p<=13?0:p<=16?.5:p<=20?1:.7;
const alternatives={current:null,bounded:"function periodBonusFt(period) { return Math.max(-.25,Math.min(.25,(Number(period)-11)/6)); }",noBonus:"function periodBonusFt(period) { return 0; }"};
const grid=[];
for(const height of [1,2.4,3.2])for(const direction of [220,225,235,245,255])for(const wind of [{speed:12,dir:45},{speed:18,dir:250}])for(const period of [9,14]) {
 const source=structuredClone(input.source);const h=source.offshore.hourly;
 for(const key of ['wave_height','swell_wave_height'])h[key]=h.time.map(()=>height);
 for(const key of ['wave_direction','swell_wave_direction'])h[key]=h.time.map(()=>direction);
 for(const key of ['wave_period','swell_wave_period'])h[key]=h.time.map(()=>period);
 for(const key of ['secondary_swell_wave_height','wind_wave_height'])h[key]=h.time.map(()=>0);
 source.wind.hourly.wind_speed_10m=h.time.map(()=>wind.speed);source.wind.hourly.wind_direction_10m=h.time.map(()=>wind.dir);
 // All local/Gulf cells, timestamps and tide tables stay byte-identical across each period pair.
 const results={};for(const [name,body]of Object.entries(alternatives)){
  const sourceHtml=body?html.replace(/function periodBonusFt\(period\) \{[^\n]*?\}/,body):html;
  const report=buildReportFromSource('seaford',source,input.tides,{now:new Date(input.now),sourceHtml}).hydration.report.reports;
  results[name]=report.filter(r=>['06:00','12:00','18:00'].includes(r.time.slice(11))).slice(0,3).map(r=>({time:r.time,ft:r.finalFt,driver:r.activeDriver?.kind,period:r.activeDriver?.periodS,tideDrag:r.tideDrag?.penaltyFt??0,tidePush:r.tidePush?.boostFt??0,gulfConfirmed:r.gulfRealityConfirmed}));
 }grid.push({height,direction,wind,period,results});
}
const analysis=JSON.parse(await fs.readFile(path.join(directory,'evidence/analysis-pr72.json')));const rows=analysis.rows.filter(r=>r.eligible&&Number.isFinite(r.period));
function metrics(values){if(!values.length)return{n:0,mae:null,bias:null};const e=values.map(v=>v.p-v.r.actual);return{n:e.length,days:new Set(values.map(v=>v.r.day)).size,mae:e.reduce((s,x)=>s+Math.abs(x),0)/e.length,bias:e.reduce((s,x)=>s+x,0)/e.length,overHalf:e.filter(x=>x>.5).length,underHalf:e.filter(x=>x<-.5).length};}
const sensitivities=Object.entries(alternatives).map(([name])=>{
 const prediction=r=>Math.max(0,Math.min(6,r.predicted+(name==='current'?0:name==='noBonus'?-bonus(r.period):Math.max(-.25,Math.min(.25,(r.period-11)/6))-bonus(r.period))));
 const evaluate=rs=>{const values=rs.map(r=>({r,p:prediction(r)}));const pairs=values.map(v=>({day:v.r.day,actualFt:v.r.actual,productionFt:v.r.predicted,modelDFt:v.p}));return{...metrics(values),dayWeighted:scorePairs(pairs,'modelDFt',true),dayBootstrapMAEImprovement:pairedInterval(pairs),improved:values.filter(v=>Math.abs(v.p-v.r.actual)<Math.abs(v.r.predicted-v.r.actual)-1e-9).length,worsened:values.filter(v=>Math.abs(v.p-v.r.actual)>Math.abs(v.r.predicted-v.r.actual)+1e-9).length,newOvercalls:values.filter(v=>v.p-v.r.actual>.5&&v.r.predicted-v.r.actual<=.5).length,newUndercalls:values.filter(v=>v.p-v.r.actual<-.5&&v.r.predicted-v.r.actual>=-.5).length};};
 return{name,all:evaluate(rows),development:evaluate(rows.filter(r=>r.partition==='development')),evaluation:evaluate(rows.filter(r=>r.partition==='evaluation'))};
});
const evidence={schemaVersion:1,createdAt:new Date().toISOString(),consultedLedger:ledger,consultedIds:events.map(e=>e.id),baseline:'6e46f1bde86f0aea25c74926e033acbcd715b338',controls:'Each 9/14-second pair preserves height, direction, wind, local/Gulf data, tide tables and valid times. Only primary offshore period changes. Alternative additive bonuses are in-memory HTML copies; ranking periodFactor and every public file stay unchanged.',limitations:['Synthetic scenarios measure model behavior, not real accuracy.','Historical adjustments are arithmetic partial sensitivities: downstream nonlinear gates and driver selection are NOT recomputed for old observations.','The same previously inspected historical evaluation block is reused; no untouched holdout or independent causal period effect is claimed.','Only two historical checks on two days have period >=14s. Typical versus occasional targets were not historically defined.','No energy proxy is used as a wave-height multiplier.'],grid,historicalSensitivity:sensitivities,periodStrata:analysis.strata.period,recommendation:'Retain the current public period behavior. Do not promote either candidate; collect prospectively archived 9s and >=14s cases with typed typical/set sizes across directions, Gulf confirmation, wind and tide.'};
await fs.writeFile(path.join(directory,'evidence/'+evidenceId+'.json'),JSON.stringify(evidence,null,2));
const data=JSON.stringify(evidence).replace(/</g,'\\u003c');
const page=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Private Seaford period review</title><style>body{font:16px system-ui;margin:24px;max-width:1100px;background:#eef3f2;color:#173b46}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:9px;border-bottom:1px solid #abb}select{font:inherit;padding:10px}.scroll{overflow:auto}p{max-width:85ch}</style><h1>Seaford: 9 s versus 14 s</h1><p>PRIVATE · Experimental sensitivity only · Public forecasts unchanged.</p><p id="limits"></p><label>Direction <select id="dir"><option value="">All</option>${[220,225,235,245,255].map(d=>'<option>'+d+'</option>').join('')}</select></label><div class="scroll"><table><thead><tr><th>Direction / height / wind</th><th>Period</th><th>Current, ft (6 / 12 / 18)</th><th>Bounded, ft</th><th>No bonus, ft</th></tr></thead><tbody id="rows"></tbody></table></div><h2>Historical arithmetic sensitivity</h2><p>These are partial diagnostic adjustments, not full historical replay or demonstrated improvements. Includes regressions and previously inspected evaluation data.</p><pre id="stats" style="overflow:auto"></pre><script>const d=${data};document.getElementById('limits').textContent=d.limitations.join(' ');function render(){document.getElementById('rows').innerHTML=d.grid.filter(r=>!dir.value||r.direction==dir.value).map(r=>'<tr><td>'+r.direction+'° / '+r.height+' m / '+r.wind.speed+' km/h @ '+r.wind.dir+'°</td><td>'+r.period+' s</td>'+['current','bounded','noBonus'].map(k=>'<td>'+r.results[k].map(x=>x.ft.toFixed(2)).join(' / ')+'</td>').join('')+'</tr>').join('')}dir.onchange=render;render();document.getElementById('stats').textContent=JSON.stringify(d.historicalSensitivity,null,2);</script>`;
await fs.writeFile(path.join(directory,'evidence/'+evidenceId+'.html'),page);console.log(JSON.stringify({gridCases:grid.length,ledger,historicalSensitivity:sensitivities},null,2));
