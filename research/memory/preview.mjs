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
      if(url.pathname==='/research/period')return send(200,'text/html; charset=utf-8',await readFile(path.join(privateRoot,'evidence/period-31.html')));
      if(url.pathname==='/research/accuracy')return send(200,'text/html; charset=utf-8',(await readFile(path.join(root,'research/accuracy/dashboard.html'),'utf8')).replace("fetch('/analysis.json')","fetch('/api/research?view=historical')"));
      if(url.pathname==='/api/research') {
        const historical=JSON.parse(await readFile(path.join(privateRoot,'evidence/analysis-pr72.json'),'utf8'));
        if(url.searchParams.get('view')==='historical')return send(200,'application/json',JSON.stringify(historical));
        const model=JSON.parse(await readFile(path.join(privateRoot,'models/model-d-v1.json'),'utf8'));
        return send(200,'application/json',JSON.stringify({events:await readLedger(privateRoot),ledger:await verify(privateRoot),models:[{id:model.id,sha256:model.sha256,frozenAt:model.frozenAt}],receipts:[],health:[],context:'local / owner-only preview',archiveEnabled:false,prospective:prospectiveReview([],[])}));
      }
      if(['/observe','/observe-seaford','/observe-middleton'].includes(url.pathname))return send(200,'text/html; charset=utf-8',`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local observation preview</title><link rel="stylesheet" href="/observation.css"><body><p style="padding:12px;color:#fff;background:#173b46;margin:0">LOCAL UI TEST · synthetic forecast · browser-only saves · production untouched</p><script>window.FrenchyObservation={getSnapshotAt:at=>({schemaVersion:3,calculationVersion:'synthetic-ui-fixture',location:'Seaford',calculatedAt:new Date().toISOString(),observedAt:at,forecastTime:at.slice(0,16),displayTime:'Synthetic local UI test',predictedFt:1.5,modelPredictedFt:1.5,activeDriver:{heightM:2.1,directionDeg:232,periodS:11.4},windContext:{speedKmh:12,directionDeg:45,label:'Light NE wind · 12 km/h'},tide:{heightM:1.14,stage:'falling',positionLabel:'Dropping'},calculationResult:{}})};</script><script src="/observation.js"></script></body></html>`);
      if(['/observation.js','/observation.css','/observation-time.js'].includes(url.pathname))return send(200,type(url.pathname),await readFile(path.join(root,url.pathname.slice(1))));
      if(url.pathname==='/favicon.ico')return send(204,'image/x-icon','');
      return send(404,'text/plain','Not found');
    }catch{return send(503,'text/plain','Private research evidence is unavailable.');}
  });
  return server;
}
// Try the actual bind rather than guessing from netstat or another fixed port.
export async function startMemoryPreview(directory,preferredPort=4187,{log=console.log}={}) {
  if(!Number.isInteger(preferredPort)||preferredPort<0||preferredPort>65535)throw Error('Preview port must be between 0 and 65535');
  const server=await createMemoryPreview(directory);
  const listen=port=>new Promise((resolve,reject)=>{
    const failure=error=>{server.removeListener('listening',ready);reject(error);};
    const ready=()=>{server.removeListener('error',failure);resolve();};
    server.once('error',failure);server.once('listening',ready);server.listen(port,'127.0.0.1');
  });
  try {await listen(preferredPort);}catch(error){
    if(preferredPort!==0&&['EADDRINUSE','EACCES'].includes(error.code)) {
      log(`Preferred port ${preferredPort} is unavailable (${error.code}); asking Windows for a free port.`);
      await listen(0);
    } else throw error;
  }
  const base='http://127.0.0.1:'+server.address().port;
  try {
    for(const route of ['/research','/observe']) {
      const response=await fetch(base+route,{signal:AbortSignal.timeout(5000)});
      if(response.status!==200)throw Error(route+' returned HTTP '+response.status);
    }
    log('READY: both pages returned HTTP 200. Keep this terminal open.');
    log('Research: '+base+'/research');log('Observe:  '+base+'/observe');log('Periods:  '+base+'/research/period');
    log('Local UI test only. No production writes or deployment.');
    return {server,base};
  }catch(error){await new Promise(resolve=>server.close(resolve));throw Error('Preview readiness failed at '+base+': '+error.message);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const directory=process.argv[2]||process.env.FRENCHY_RESEARCH_HOME||path.resolve(root,'../frenchy-research-private');
  try {await startMemoryPreview(directory,Number(process.argv[3]??4187));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
