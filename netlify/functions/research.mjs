import {getStore} from '@netlify/blobs';
import {isObservationAdmin,verifySameOrigin} from '../lib/observation-auth.mjs';
import {researchStore,researchEnvironment,researchState,appendMemory,registerModel,putImmutable,listJson} from '../lib/research-store.mjs';
import {prospectiveReview} from '../lib/research-core.mjs';
import {readProjectText} from '../lib/project-files.mjs';
const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"};
const send=(status,body,type='application/json; charset=utf-8')=>new Response(type.startsWith('application/json')?JSON.stringify(body):body,{status,headers:{...headers,'Content-Type':type}});
const login=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Private research sign in</title><style>body{max-width:400px;margin:12vh auto;padding:24px;font:16px system-ui;background:#eef3f2;color:#173b46}input,button{box-sizing:border-box;width:100%;padding:14px;margin:10px 0;font:inherit}button{background:#173b46;color:white;border:0;border-radius:6px}</style><h1>Private research</h1><p>Use your existing observation administrator password.</p><form><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button>Sign in</button><p id="message" role="status"></p></form><script>document.querySelector('form').onsubmit=async e=>{e.preventDefault();try{const r=await fetch('/api/observations/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:e.target.password.value})});if(r.ok)location.reload();else document.getElementById('message').textContent='Unable to sign in. Check your password.'}catch{document.getElementById('message').textContent='Connection unavailable.'}};</script></html>`;
export function createResearchHandler({store=researchStore,authorize=isObservationAdmin,observations=async env=>{
  // A preview must never read production observations through this new research endpoint.
  if(env.CONTEXT!=='production'||!env.SITE_ID||env.RESEARCH_DEPLOY_PUBLISHED!=='true')return [];
  return (await listJson(getStore({name:'frenchy-surf-observations',consistency:'strong'}),'observations/')).filter(o=>o.location==='Seaford');
},readText=readProjectText}={}) {
  return async(request,context)=>{
    const url=new URL(request.url);
    if(!authorize(request))return url.pathname.startsWith('/api/')?send(401,{error:'Administrator sign in required'}):send(401,login,'text/html; charset=utf-8');
    const env=researchEnvironment(context);
    if(request.method==='GET') {
      if(url.pathname==='/research')return send(200,readText('research/memory/dashboard.html'),'text/html; charset=utf-8');
      if(url.pathname==='/research/accuracy')return send(200,readText('research/accuracy/dashboard.html').replace("fetch('/analysis.json')","fetch('/api/research?view=historical')").replace('Loopback-only','Administrator-only'),'text/html; charset=utf-8');
      try {
        const data=await researchState(store(env),{observations:await observations(env)});
        if(url.searchParams.get('view')==='backup')return send(200,{...data,observations:undefined,models:await listJson(store(env),'models/')});
        if(url.searchParams.get('view')==='historical')return data.historical?send(200,data.historical):send(404,{error:'Private PR72 evidence has not been imported'});
        const prospective=prospectiveReview(data.observations,data.receipts);
        return send(200,{...data,historical:undefined,receipts:data.receipts.map(({rows,...summary})=>summary),observations:undefined,prospective,archiveEnabled:env.RESEARCH_ARCHIVE_ENABLED==='true'&&env.CONTEXT==='production'&&env.RESEARCH_DEPLOY_PUBLISHED==='true',context:env.CONTEXT});
      }catch{return send(503,{error:'Private research storage unavailable. Observations and public forecasts are unaffected.'});}
    }
    if(request.method!=='POST')return send(405,{error:'Research history is append-only'});
    try{verifySameOrigin(request);}catch{return send(403,{error:'Forbidden'});}
    const text=await request.text();if(Buffer.byteLength(text)>2000000)return send(413,{error:'Private import is too large'});
    try {
      const input=JSON.parse(text),db=store(env);
      if(input.action==='append')return send(201,{event:await appendMemory(db,input.event)});
      if(input.action==='register-model'){await registerModel(db,input.model);return send(201,{registered:input.model.id});}
      if(input.action==='import-pr72'){
        const a=input.analysis;if(!/^[a-f0-9]{64}$/.test(a?.sourceSha256||'')||a.quality?.total!==100||a.rows?.length!==100)throw Error('PR72 analysis format required');
        await putImmutable(db,'historical/pr72.json',a);return send(201,{imported:true});
      }
      return send(400,{error:'Unknown append action'});
    }catch(error){return send(400,{error:error.message});}
  };
}
export default createResearchHandler();
export const config={path:['/research','/research/accuracy','/api/research']};
