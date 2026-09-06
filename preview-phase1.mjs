// Local-only, read-only preview. No Netlify CLI, writes, deploys or production credentials.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import seaford from './netlify/functions/seaford-data.js';
import middleton from './netlify/functions/middleton-data.js';
import { buildReportFromSource } from './netlify/lib/report-runtime.mjs';
import { __test as renderer } from './netlify/functions/surf-report.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
const base = '82bf9f5734808186052ec3f921e308a06be30b9b';
const original = Object.fromEntries(['seaford','middleton'].map(spot => [spot, execFileSync('git',['-c','safe.directory='+root.replaceAll('\\\\','/'),'show',base+':'+(spot==='seaford'?'index.html':'middleton.html')],{cwd:root,encoding:'utf8',maxBuffer:2e6})]));
const cache = new Map();
async function load(spot) {
  const old=cache.get(spot);if(old&&Date.now()-old.at<240000)return old.promise;
  const promise=(async()=>{
    const response=await (spot==='seaford'?seaford:middleton).handler();
    const source=JSON.parse(response.body);if(!source.ok)throw new Error(source.error);
    const tides=JSON.parse(await readFile(path.join(root,spot==='seaford'?'port_noarlunga_2026_tides.json':'victor_harbor_2026_tides.json'),'utf8'));
    const now=new Date();
    return { after:buildReportFromSource(spot,source,tides,{now}), before:buildReportFromSource(spot,source,tides,{now,sourceHtml:original[spot]}) };
  })();
  cache.set(spot,{at:Date.now(),promise});promise.catch(()=>cache.delete(spot));return promise;
}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml'};
http.createServer(async(req,res)=>{
  const send=(status,type,body)=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Robots-Tag':'noindex'});res.end(body)};
  try {
    if(req.method!=='GET')return send(405,'text/plain','Read-only preview: writes disabled.');
    const url=new URL(req.url,'http://127.0.0.1');
    if(url.pathname==='/review.html')return send(200,'text/html; charset=utf-8',`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Phase 1 review</title><style>body{background:#082933;color:#eefafa;font:17px system-ui;margin:20px}button{font:inherit;padding:12px;margin:4px;cursor:pointer}iframe{border:1px solid #77cabb;height:1000px;background:#082933;display:block;margin-top:16px;max-width:none}.frame-scroll{overflow:auto}a{color:#9ef3ce}</style><h1>Local Phase 1 review</h1><p>Nothing deployed. Select a spot and viewport. Desktop previews can be scrolled horizontally on smaller screens.</p><nav><button onclick="show('seaford',1440)">Seaford desktop</button><button onclick="show('seaford',390)">Seaford mobile</button><button onclick="show('middleton',1440)">Middleton desktop</button><button onclick="show('middleton',390)">Middleton mobile</button></nav><p><a href="/comparison.json">Before / after sizes</a> · <a href="/?debug=1">Seaford trace</a> · <a href="/middleton.html?debug=1">Middleton trace</a></p><div class="frame-scroll"><iframe id="preview" title="Seaford desktop" width="1440" src="/"></iframe></div><script>function show(spot,width){const f=document.getElementById('preview');f.width=width;f.title=spot+' '+(width===390?'mobile':'desktop');f.src=spot==='middleton'?'/middleton.html':'/'}</script>`);
    if(url.pathname==='/.netlify/functions/beach-check') {
      const spot=url.searchParams.get('spot')==='middleton'?'middleton':'seaford';
      const remote=await fetch('https://frenchyreview.netlify.app/.netlify/functions/beach-check?spot='+spot);
      return send(remote.status,'application/json',await remote.text());
    }
    if(url.pathname.startsWith('/.netlify/'))return send(200,'application/json',JSON.stringify({authenticated:false,active:false,preview:true}));
    if(url.pathname==='/comparison.json'){
      const out={baselineCommit:base,comparison:'Identical raw inputs; hourly calculated sizes, not display/time selection'};
      for(const spot of ['seaford','middleton']){
        const {before,after}=await load(spot);
        const rows=after.hydration.report.reports.map((r,i)=>({time:r.time,beforeFt:before.hydration.report.reports[i]?.finalFt,afterFt:r.finalFt}));
        out[spot]={hours:rows.length,changed:rows.filter(r=>r.beforeFt!==r.afterFt),before:before.canonical,after:after.canonical};
      }
      return send(200,'application/json',JSON.stringify(out,null,2));
    }
    const api=url.pathname.match(/^\/api\/surf-reports\/(seaford|middleton)\.json$/);
    if(api||['/','/index.html','/middleton.html','/middleton'].includes(url.pathname)){
      const spot=api?.[1]||(url.pathname.includes('middleton')?'middleton':'seaford');
      const {after}=await load(spot);
      if(api)return send(200,'application/json',JSON.stringify(url.searchParams.get('full')==='1'?{canonical:after.canonical,hydration:after.hydration}:after.canonical));
      let html=renderer.renderReportHtml(renderer.LOCATION_MAP[spot],after);
      html=html.replace(/<script[^>]*src=["'][^"']*(?:analytics\.js|googletagmanager)[^"']*["'][^>]*><\/script>/gi,'');
      html=html.replace('<body>','<body><div style="padding:10px;background:#e0b84b;color:#132b32;text-align:center;font:16px sans-serif">LOCAL PHASE 1 PREVIEW · Nothing deployed · <a href="/comparison.json">Before/after sizes</a> · <a href="?debug=1">Debug trace</a></div>');
      return send(200,'text/html; charset=utf-8',html);
    }
    const relative=decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if(!/^[a-zA-Z0-9_.-]+$/.test(relative)||!types[path.extname(relative)])return send(404,'text/plain','Not found');
    return send(200,types[path.extname(relative)],await readFile(path.join(root,relative)));
  }catch(error){console.error(error);send(503,'text/plain','Preview API unavailable: '+error.message)}
}).listen(8790,'127.0.0.1',()=>console.log('PHASE1_PREVIEW http://127.0.0.1:8790/ (read-only; no deployment)'));
