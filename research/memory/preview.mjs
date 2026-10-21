// Owner-only loopback preview. No Netlify database, secrets, providers or production writes.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readLedger,verify,privatePath} from './cli.mjs';
import {prospectiveReview} from '../../netlify/lib/research-core.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export async function createMemoryPreview(directory) {
  const privateRoot=privatePath(directory);await verify(privateRoot);
  const type=file=>file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html; charset=utf-8';
  const server=http.createServer(async(req,res)=>{
    const send=(status,content,body)=>{res.writeHead(status,{'Content-Type':content,'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});res.end(body);};
    if(!/^127\.0\.0\.1(?::\d+)?$/.test(req.headers.host||''))return send(403,'text/plain','Loopback host required');
    if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return send(403,'text/plain','Cross-origin access denied');
    if(req.method!=='GET')return send(405,'text/plain','Read-only preview. Observation test saves use this browser only.');
    const url=new URL(req.url,`http://${req.headers.host}`);
    try {
      if(url.pathname==='/research'||url.pathname==='/')return send(200,'text/html; charset=utf-8',await readFile(path.join(root,'research/memory/dashboard.html')));
      if(url.pathname==='/health')return send(200,'application/json',JSON.stringify({privateResearchPreview:true,productionWrites:false,pid:process.pid,port:server.address()?.port||null}));
      if(url.pathname==='/research/accuracy')return send(200,'text/html; charset=utf-8',(await readFile(path.join(root,'research/accuracy/dashboard.html'),'utf8')).replace("fetch('/analysis.json')","fetch('/api/research?view=historical')"));
      if(url.pathname==='/api/research') {
        const historical=JSON.parse(await readFile(path.join(privateRoot,'evidence/analysis-pr72.json'),'utf8'));
        if(url.searchParams.get('view')==='historical')return send(200,'application/json',JSON.stringify(historical));
        const model=JSON.parse(await readFile(path.join(privateRoot,'models/model-d-v1.json'),'utf8'));
        return send(200,'application/json',JSON.stringify({events:await readLedger(privateRoot),ledger:await verify(privateRoot),models:[{id:model.id,sha256:model.sha256,frozenAt:model.frozenAt}],receipts:[],health:[],context:'local / owner-only preview',archiveEnabled:false,prospective:prospectiveReview([],[])}));
      }
      if(url.pathname==='/observe')return send(200,'text/html; charset=utf-8',`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local observation preview</title><link rel="stylesheet" href="/observation.css"><body><p style="padding:12px;color:#fff;background:#173b46;margin:0">LOCAL UI TEST · synthetic forecast · browser-only saves · production untouched</p><script>window.FrenchyObservation={getSnapshotAt:at=>({schemaVersion:3,calculationVersion:'synthetic-ui-fixture',location:'Seaford',calculatedAt:new Date().toISOString(),observedAt:at,forecastTime:at.slice(0,16),displayTime:'Synthetic local UI test',predictedFt:1.5,modelPredictedFt:1.5,activeDriver:{heightM:2.1,directionDeg:232,periodS:11.4},windContext:{speedKmh:12,directionDeg:45,label:'Light NE wind · 12 km/h'},tide:{heightM:1.14,stage:'falling',positionLabel:'Dropping'},calculationResult:{}})};</script><script src="/observation.js"></script></body></html>`);
      if(['/observation.js','/observation.css'].includes(url.pathname))return send(200,type(url.pathname),await readFile(path.join(root,url.pathname.slice(1))));
      if(url.pathname==='/favicon.ico')return send(204,'image/x-icon','');
      return send(404,'text/plain','Not found');
    }catch{return send(503,'text/plain','Private research evidence is unavailable.');}
  });
  return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const directory=process.argv[2]||process.env.FRENCHY_RESEARCH_HOME||path.resolve(root,'../frenchy-research-private');
  const server=await createMemoryPreview(directory);
  server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'Port 4187 is already occupied. No preview was started. Close the earlier preview terminal, then run the launcher again.':error.message);process.exitCode=1;});
  server.listen(Number(process.argv[3]||4187),'127.0.0.1',async()=>{
    const base='http://127.0.0.1:'+server.address().port;
    try{for(const route of ['/research','/observe'])if(!(await fetch(base+route,{signal:AbortSignal.timeout(5000)})).ok)throw Error(route+' readiness failed');
      console.log('READY: both pages returned HTTP 200. Keep this terminal open.');console.log('Research: '+base+'/research');console.log('Observe:  '+base+'/observe');console.log('Local UI test only. No production writes or deployment.');
    }catch(error){console.error('Preview readiness failed: '+error.message);server.close();process.exitCode=1;}
  });
}
