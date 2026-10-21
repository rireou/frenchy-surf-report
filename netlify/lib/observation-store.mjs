import {getStore} from '@netlify/blobs';

// A site-wide store is visible to every deploy. Only the published production
// invocation may use the historical observation namespace. Never trust build env.
export function observationStoreName(context) {
  if(context?.deploy?.context==='production'&&context.deploy.published===true&&context?.site?.id)return 'frenchy-surf-observations';
  const deploy=String(context?.deploy?.id||'local').replace(/[^a-zA-Z0-9-]/g,'').slice(0,60);
  return 'frenchy-surf-observations-preview-'+(deploy||'local');
}
export const observationStore=context=>getStore({name:observationStoreName(context),consistency:'strong'});
