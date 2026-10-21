// Private append-only evidence repository. Never put its output inside this checkout.
import {readFile,writeFile,mkdir,readdir,realpath} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {existsSync,writeFileSync} from 'node:fs';
import {digest,sha,validateMemoryEvent,validateLedger,validateFrozenModel} from '../../netlify/lib/research-core.mjs';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export function privatePath(directory) {
  const full=path.resolve(directory),rel=path.relative(repo,full);
  if(!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel))throw Error('Private evidence must be outside the public repository');
  return full;
}
export async function readLedger(directory) {
  const root=privatePath(directory),files=(await readdir(path.join(root,'events'))).filter(x=>x.endsWith('.json')).sort();
  return Promise.all(files.map(file=>readFile(path.join(root,'events',file),'utf8').then(JSON.parse)));
}
export async function appendEvent(directory,value) {
  const root=privatePath(await realpath(privatePath(directory))),event=validateMemoryEvent(value),events=await readLedger(root);
  validateLedger([...events,event]);
  await verifyEvidence(root,[event]);
  if(path.relative(root,await realpath(path.join(root,'events'))).startsWith('..'))throw Error('Events directory escapes private repository');
  await writeFile(path.join(root,'events',event.id+'.json'),JSON.stringify(event,null,2)+'\n',{flag:'wx'});
  return event;
}
async function verifyEvidence(root,events) {
  const hashes=new Map();
  for(const e of events)for(const evidence of e.evidence) {
    const ref=evidence.reference.split('#')[0];if(ref.startsWith('https:'))continue;
    const file=path.resolve(root,ref),rel=path.relative(root,file);
    if(rel.startsWith('..')||path.isAbsolute(rel))throw Error('Evidence path escapes private repository');
    const actual=await realpath(file);if(path.relative(root,actual).startsWith('..'))throw Error('Evidence symlink escapes private repository');
    if(!hashes.has(ref))hashes.set(ref,sha(await readFile(file)));
    if(hashes.get(ref)!==evidence.sha256)throw Error('Evidence changed: '+ref);
  }
}
export async function verify(directory) {
  const root=privatePath(directory),resolved=await realpath(root);privatePath(resolved);
  const events=await readLedger(root),result=validateLedger(events);
  await verifyEvidence(root,events);
  validateFrozenModel(JSON.parse(await readFile(path.join(root,'models/model-d-v1.json'),'utf8')));
  return result;
}
export async function importPr72(directory,analysisFile,csvFile) {
  const root=privatePath(directory);await mkdir(root,{recursive:true});privatePath(await realpath(root));
  for(const name of ['events','evidence','models'])await mkdir(path.join(root,name),{recursive:true});
  const bytes=await readFile(analysisFile),csv=await readFile(csvFile),a=JSON.parse(bytes);
  if(a.sourceSha256!==sha(csv)||a.quality.total!==100)throw Error('PR72 source hash/count mismatch');
  const frozenAt=new Date().toISOString();
  await writeFile(path.join(root,'evidence/analysis-pr72.json'),bytes,{flag:'wx'});
  await writeFile(path.join(root,'evidence/original-observations.csv'),csv,{flag:'wx'});
  const protocol={sourceAnalysisSha256:sha(bytes),sourceCsvSha256:sha(csv),predecessor:'PR72',trainingDays:a.fittedStates.D.trainingDays,trainingIds:a.fittedStates.D.trainingIds,development:a.protocol,evaluationStatus:'Historical exploratory comparison, not prospective; freeze begins now',target:'Historical scalar definition unspecified; future typical and sets kept separate',clipResidualFt:.75,clipPredictionFt:[0,6],features:['storedPrediction','selectedDirection','selectedPeriod','localWave','westOnshoreWindComponent']};
  const model={id:'model-d-v1',frozenAt,parameters:a.fittedStates.D,protocol};model.sha256=digest(model);validateFrozenModel(model);
  await writeFile(path.join(root,'models/model-d-v1.json'),JSON.stringify(model,null,2)+'\n',{flag:'wx'});
  const evidence=[{reference:'evidence/analysis-pr72.json',sha256:sha(bytes)},{reference:'evidence/original-observations.csv',sha256:sha(csv)}];
  const common={recordedAt:frozenAt,modelVersions:Object.keys(a.quality.versions),evidence,relations:[],limitations:['Historical scalar size definition is unknown. Checks within days and consecutive swell events are related. Stored versions are not reconstructed current forecasts.']};
  const add=(id,kind,subject,title,status,conclusion,extra={})=>appendEvent(root,{...common,id,kind,subject,title,status,conclusion,...extra});
  await add('pr72-data-provenance','limitation','forecast-timing','Historical evidence provenance','established-limitation','Preserve all 100 original observations and snapshots. Source retrieval after a check is not verified advance evidence. Provider issue time is unknown; do not invent lead time.',{metrics:{nChecks:100,nDays:a.quality.uniqueDays,...a.baseline},quality:a.quality,supportingObservations:a.rows.map(r=>({id:r.id,day:r.day,version:r.version,flags:r.flags})),uncertainty:'41 calendar days and 15 consecutive-day blocks, not 100 independent events.'});
  for(const [label,subject,id,text] of [['>225–235°','seaford-direction-classic','pr72-classic-sector','Historical tendency to overcall, not a universal sector correction.'],['>245°','seaford-direction-west','pr72-west-sector','Historical tendency to undercall; collect more independent westerly events.']]) {
    const s=a.strata.direction.find(s=>s.label===label);if(!s)throw Error('Missing PR72 sector '+label);
    const rows=a.rows.filter(r=>r.sector===label);
    await add(id,'finding',subject,label+' direction evidence','hypothesis',text,{metrics:{...s,nChecks:s.n,nDays:s.days},supportingObservations:rows.map(r=>({id:r.id,day:r.day,modelVersion:r.version})),uncertainty:'Exploratory mixed-version strata; conditional associations, no causal or prospective proof.'});
  }
  await add('pr72-rule-interactions','finding','seaford-wind-compression','Wind, tide, Gulf and calibration interactions','inconclusive','Arithmetic ablations identify hypotheses, not complete history replays. Wind compression harms four of six traced cases across only two days. Tide effects are mixed; existing calibration helps some and harms others.',{metrics:{nChecks:a.quality.traceRecords,nDays:new Set(a.rows.filter(r=>!r.flags.includes('no_rule_trace')).map(r=>r.day)).size},rules:a.rules,conflicts:a.conflicts,uncertainty:'Small selected traced samples; ablations do not replay downstream nonlinear rules.'});
  await add('pr72-period-tide','finding','seaford-period','Long periods and tide remain uncertain','insufficient-evidence','Do not change long-period bonuses or tide rules on these observations. Period at least 14 s has only two checks; tide/wind combinations are confounded.',{strata:{period:a.strata.period,tideStage:a.strata.tideStage,tideHeight:a.strata.tideHeight},uncertainty:'No independent causal estimate or justified universal coefficient.'});
  for(const name of ['A','B','C','D']) {
    const e=a.evaluation[name];
    await add('pr72-model-'+name.toLowerCase(),'experiment',name==='D'?'model-d-v1':'model-'+name.toLowerCase(),'Historical model '+name,name==='A'?'baseline':name==='D'?'shadow-only':'rejected-for-promotion',name==='A'?'Saved historical production predictions, retained as reference.':name==='D'?'Promising historical MAE, but uncertainty crosses zero and serious undercalls increase. Frozen for prospective shadow testing only.':'No improvement on the shared chronological evaluation; retain negative result.',{metrics:{nChecks:e.checkWeighted.n,nDays:e.checkWeighted.days,...e.checkWeighted},results:e,parametersReference:name==='D'?'models/model-d-v1.json':null,uncertainty:e.ci,limitations:[...common.limitations,'Holdout inspected during exploratory research; not pristine prospective validation.'],relations:name==='A'?[]:[{type:'qualifies',eventId:'pr72-model-a',reason:'Compared on the same evaluation observations; no production promotion.'}]});
  }
  await add('pr72-preserve-calibration','decision','prior-calibration','Keep current coefficients and successful prior work','retained-baseline','No production calibration changes. Preserve August observation calibration and subsequent Gulf/floor/hold rules pending stronger prospective evidence.',{sourceCommits:['cc8a4ea','075286e','166a0ea','82bf9f5','b0ca9bb','52cf130'],relations:[{type:'qualifies',eventId:'pr72-rule-interactions',reason:'Exploratory weaknesses do not justify deleting successful existing rules.'}]});
  await add('prospective-protocol-v1','protocol','model-d-v1','Frozen prospective evaluation protocol','collecting-not-active','Use scheduled server archives sealed at least ten minutes before checks, at most six hours earlier, matching valid time within thirty minutes. Separate exact production and Model D fingerprints. Typical local surf scale only; retain occasional sets separately. Review after at least thirty new calendar days, with day/event uncertainty and larger-surf undercall checks. Thirty days is a milestone, not evidence of reliability.',{relations:[{type:'qualifies',eventId:'pr72-model-d',reason:'Future evaluation must be independent of training and retrospective source retrieval.'}],modelFrozenAt:frozenAt,modelSha256:model.sha256});
  await writeFile(path.join(root,'README.md'),'# PRIVATE Frenchy research evidence\n\nContains personal observations, snapshots and fitted parameters. Never publish or add a public remote. Events/evidence/models are append-only; use the public CLI to verify and append. Commit each append; back up this complete repository to owner-controlled private storage. Production collection is not activated by this local import.\n',{flag:'wx'});
  return verify(root);
}
export function commitPrivate(directory,message='Append private research evidence') {
  const root=privatePath(directory),git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8'});
  if(!existsSync(path.join(root,'.git')))git(['init','--initial-branch=main']);
  // Do not accept an accidentally inherited parent repository.
  if(path.resolve(git(['rev-parse','--show-toplevel']).trim())!==root)throw Error('Private ledger must have its own Git repository');
  if(git(['remote']).trim())throw Error('Review private remote configuration before committing');
  git(['config','core.autocrlf','false']);
  if(!existsSync(path.join(root,'.gitattributes')))writeFileSync(path.join(root,'.gitattributes'),'* -text\n',{flag:'wx'});
  git(['add','.gitattributes','events','evidence','models','README.md']);
  return git(['-c','user.name=Codex','-c','user.email=codex@openai.local','commit','-m',message]);
}
export async function importBackup(directory,file) {
  const root=privatePath(directory),data=JSON.parse(await readFile(file,'utf8'));
  validateLedger(data.events);for(const m of data.models)validateFrozenModel(m);
  for(const m of data.models){const target=path.join(root,'models',m.id+'.json'),text=JSON.stringify(m,null,2)+'\n';try{await writeFile(target,text,{flag:'wx'});}catch(e){if(e.code!=='EEXIST'||await readFile(target,'utf8')!==text)throw Error('Existing frozen model differs');}}
  const pending=[...data.events];while(pending.length){const known=new Set((await readLedger(root)).map(e=>e.id));let progress=false;
    for(let i=pending.length-1;i>=0;i--){const e=pending[i];if(known.has(e.id)){const existing=(await readLedger(root)).find(x=>x.id===e.id);if(existing.sha256!==e.sha256)throw Error('Existing event differs');pending.splice(i,1);progress=true;}else if(e.relations.every(r=>known.has(r.eventId))){await appendEvent(root,e);pending.splice(i,1);progress=true;}}
    if(!progress)throw Error('Cannot resolve research relationships');
  }
  const bytes=JSON.stringify(data,null,2)+'\n',target=path.join(root,'evidence','hosted-backup-'+sha(bytes)+'.json');try{await writeFile(target,bytes,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
  return verify(root);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [command,directory,...args]=process.argv.slice(2);if(!directory)throw Error('Usage: cli.mjs import-pr72|append|verify|commit PRIVATE_DIRECTORY [arguments]');
  if(command==='import-pr72')console.log(await importPr72(directory,...args));
  else if(command==='verify')console.log(await verify(directory));
  else if(command==='import-backup')console.log(await importBackup(directory,args[0]));
  else if(command==='append')console.log((await appendEvent(directory,JSON.parse(await readFile(args[0],'utf8')))).id);
  else if(command==='commit'){await verify(directory);console.log(commitPrivate(directory,args[0]));}
  else throw Error('Unknown command');
}
