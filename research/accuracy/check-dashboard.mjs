// Logic/HTML checks with a small DOM fixture; not a substitute for browser visual QA.
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const file=process.argv[2];if(!file)throw Error('Pass private offline dashboard.html');
const html=await readFile(file,'utf8');
assert.doesNotMatch(html,/fetch\(|https?:\/\/|<script[^>]+src=/,'Offline dashboard must not request external data');
const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1];assert.ok(script);
const elements=new Map();
const make=id=>({id,value:({version:'all',partition:'all',quality:'all',sector:'all',group:'direction',sort:'worst',search:'',candidate:'D'})[id]||'',innerHTML:'',textContent:'',hidden:false,options:[],add(v){this.options.push(v)},querySelectorAll(){return []}});
const element=id=>{if(!elements.has(id))elements.set(id,make(id));return elements.get(id)};
const document={getElementById:element,querySelectorAll(){return []}};
const context=vm.createContext({document,console,Option:function(label,value){this.label=label;this.value=value},setTimeout});
new vm.Script(script,{filename:'accuracy-dashboard-inline.js'}).runInContext(context);
await new Promise(r=>setImmediate(r));
assert.equal(element('error').innerHTML,'');assert.match(element('count').textContent,/100 checks · 41 days/);
assert.match(element('metrics').innerHTML,/0\.46 ft/);assert.match(element('modelTable').innerHTML,/0\.52/);
element('version').value='recent';element('version').onchange();assert.match(element('count').textContent,/33 checks · 12 days/);
element('version').value='all';element('partition').value='evaluation';element('partition').onchange();assert.match(element('count').textContent,/26 checks · 9 days/);
element('quality').value='strict';element('quality').onchange();assert.match(element('count').textContent,/4 checks · 2 days/);
for(const group of ['period','height','windCompass','windSpeed','tideStage','tideHeight','surfSize','combination']){element('group').value=group;element('group').onchange();assert.match(element('groupTable').innerHTML,/<table>/)}
for(const m of ['B','C','D']){element('candidate').value=m;element('candidate').onchange();assert.match(element('candidateChart').innerHTML,/<svg/);assert.match(element('regressions').innerHTML,/New overcalls/)}
element('search').value='2026-10-21';element('search').oninput();assert.match(element('records').innerHTML,/2026-10-21/);
console.log('Offline dashboard: syntax, data load, core metrics, version/time/timing filters, 8 condition views, 3 candidates and audit search pass. Browser visual QA remains pending.');
