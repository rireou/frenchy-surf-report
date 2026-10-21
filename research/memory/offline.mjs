// Owner-only fallback artifact, outside all public/deployment directories.
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readLedger,verify,privatePath} from './cli.mjs';
import {prospectiveReview} from '../../netlify/lib/research-core.mjs';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const root=privatePath(process.argv[2]||path.join(repo,'../frenchy-research-private'));
const model=JSON.parse(await readFile(path.join(root,'models/model-d-v1.json'),'utf8'));
const state={events:await readLedger(root),ledger:await verify(root),models:[{id:model.id,sha256:model.sha256,frozenAt:model.frozenAt}],receipts:[],health:[],context:'private offline copy',archiveEnabled:false,prospective:prospectiveReview([],[])};
const json=JSON.stringify(state).replace(/</g,'\\u003c');
let html=await readFile(path.join(repo,'research/memory/dashboard.html'),'utf8');
html=html.replace("const r=await fetch('/api/research');",`const r={ok:true,json:async()=>(${json})};`)
  .replace('href="/research/accuracy"','href="historical-accuracy.html"')
  .replace('<a class="action" href="/observe">Beach observations ↗</a>','')
  .replace('<details class="card"><summary>Append a finding or contradictory evidence</summary>','<details class="card" hidden><summary>Append a finding or contradictory evidence</summary>')
  .replace('<a href="/api/research?view=backup" download="private-research-export.json">Download private memory and evaluation state</a>','Offline read-only copy; use the private Git ledger to append and back up evidence');
await writeFile(path.join(root,'research-memory.html'),html);
// Reuse PR72's template and data loader; retain subsequent mobile fixes.
const analysis=await readFile(path.join(root,'evidence/analysis-pr72.json'),'utf8');
const marker="fetch('/analysis.json').then(r=>{if(!r.ok)throw Error('Analysis is unavailable');return r.json()})";
const historical=(await readFile(path.join(repo,'research/accuracy/dashboard.html'),'utf8')).replace(marker,'Promise.resolve('+analysis.replace(/</g,'\\u003c')+')');
await writeFile(path.join(root,'historical-accuracy.html'),historical);
console.log('Private offline dashboard: '+path.join(root,'research-memory.html'));
