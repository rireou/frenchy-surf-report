import {getStore} from '@netlify/blobs';
import {digest,validateMemoryEvent,validateLedger,validateFrozenModel} from './research-core.mjs';
// Build variables such as CONTEXT are not guaranteed at function runtime. Use Netlify's trusted invocation context.
export function researchEnvironment(context,env=process.env) {
  return {...env,CONTEXT:context?.deploy?.context||'local',SITE_ID:context?.site?.id||'',DEPLOY_ID:context?.deploy?.id||'local',RESEARCH_DEPLOY_PUBLISHED:context?.deploy?.published===true?'true':'false'};
}
export function researchStoreName(env=process.env) {
  if(env.CONTEXT==='production'&&env.SITE_ID)return 'frenchy-private-research-v1';
  const id=String(env.DEPLOY_ID||'local').replace(/[^a-zA-Z0-9-]/g,'').slice(0,60);
  return 'frenchy-private-research-preview-'+id;
}
export const researchStore=(env=process.env)=>getStore({name:researchStoreName(env),consistency:'strong'});
export async function listJson(store,prefix) {
  const records=[];let cursor;
  do {const page=await store.list({prefix,...(cursor?{cursor}:{})});const blobs=page.blobs||[];for(let i=0;i<blobs.length;i+=16)records.push(...await Promise.all(blobs.slice(i,i+16).map(item=>store.get(item.key,{type:'json',consistency:'strong'}))));cursor=page.cursor;}while(cursor);
  return records.filter(Boolean);
}
export async function putImmutable(store,key,value) {
  // SDK 10.1.0 setJSON drops the conditional request options. set preserves If-None-Match.
  const result=await store.set(key,JSON.stringify(value),{onlyIfNew:true});
  if(!result?.modified){const prior=await store.get(key,{type:'json',consistency:'strong'});if(digest(prior)!==digest(value))throw Error('Immutable research key already exists');}
}
export async function appendMemory(store,value) {
  const event=validateMemoryEvent(value),events=await listJson(store,'memory/');validateLedger([...events.filter(e=>e.id!==event.id),event]);
  await putImmutable(store,'memory/'+event.id+'.json',event);return event;
}
export async function registerModel(store,model,now=new Date()) {
  validateFrozenModel(model);if(Date.parse(model.frozenAt)>now.getTime())throw Error('Model freeze is in the future');
  await putImmutable(store,'models/'+model.id+'.json',model);
}
export async function researchState(store,{observations=[]}={}) {
  const [events,receipts,models,health,historical]=await Promise.all([listJson(store,'memory/'),listJson(store,'receipts/'),listJson(store,'models/'),listJson(store,'health/'),store.get('historical/pr72.json',{type:'json'})]);
  return {events,ledger:validateLedger(events),receipts,models:models.map(m=>({id:m.id,sha256:m.sha256,frozenAt:m.frozenAt})),health,historical,observations};
}
