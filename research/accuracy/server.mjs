// Local private research viewer. No provider requests, database access or public binding.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
export function createAccuracyServer(dataPath) {
  return http.createServer(async(req,res)=>{
    const send=(status,type,body)=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"});res.end(body);};
    if(!/^127\.0\.0\.1(?::\d+)?$/.test(req.headers.host||''))return send(403,'text/plain','Loopback host required');
    if(req.method!=='GET')return send(405,'text/plain','Read-only research preview');
    if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return send(403,'text/plain','Cross-origin access denied');
    const url=new URL(req.url,`http://${req.headers.host}`);
    try {
      if(url.pathname==='/')return send(200,'text/html; charset=utf-8',await readFile(path.join(root,'dashboard.html')));
      if(url.pathname==='/analysis.json')return send(200,'application/json; charset=utf-8',await readFile(dataPath));
      return send(404,'text/plain','Not found');
    }catch{return send(503,'text/plain','Run analyse.py with the private CSV before opening this dashboard');}
  });
}
if(typeof process!=='undefined'&&process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const data=process.argv[2];if(!data)throw Error('Pass the private analysis.json path outside the repository');
  const dataPath=path.resolve(data),repo=path.resolve(root,'../..');
  if(!path.relative(repo,dataPath).startsWith('..'))throw Error('Private data must stay outside the repository');
  const server=createAccuracyServer(dataPath);server.listen(Number(process.argv[3]||4185),'127.0.0.1',()=>console.log(`Private accuracy dashboard: http://127.0.0.1:${server.address().port}/`));
}
