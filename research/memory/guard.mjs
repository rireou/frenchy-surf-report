import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
const base=process.argv[2]||process.env.RESEARCH_BASE_REF||'origin/master';
const files=execFileSync('git',['diff','--name-only',base],{encoding:'utf8'}).trim().split(/\r?\n/);
const sensitive=/^(index\.html|middleton\.html|phase1-engine\.js|netlify\/lib\/report-(runtime|source)\.mjs|netlify\/functions\/(seaford|middleton)-data\.js)$/;
if(files.some(f=>sensitive.test(f))) {
  const reviews=readdirSync('research/memory/reviews').filter(x=>x.endsWith('.json')&&files.includes('research/memory/reviews/'+x));
  const valid=reviews.some(f=>{const r=JSON.parse(readFileSync('research/memory/reviews/'+f));return r.consultedFindingIds?.length&&/^[a-f0-9]{64}$/.test(r.privateLedgerDigest||'')&&r.rationale&&r.productionChangeApproved===false;});
  if(!valid)throw Error('Forecast source changed: add a sanitized research consultation review. This guard does not approve deployment.');
}
console.log('Research continuity guard passed. No production permission is implied.');
