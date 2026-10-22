// Diagnostics only. Never reads hosting secrets, deploys, rolls back or writes observations.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export class AuthPreflightError extends Error {
  constructor(code){super(code);this.name='AuthPreflightError';this.code=code;}
}
export function explicitCredential(value){
  // A hosting API response is not a credential source, even if it has a value property.
  if(typeof value!=='string'||value.length<8)throw new AuthPreflightError('explicit-credential-required');
  return value;
}
export async function authPreflight({origin,password,fetchImpl=fetch}){
  password=explicitCredential(password);
  const url=new URL(origin);
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||url.protocol!=='https:')throw new AuthPreflightError('https-origin-required');
  origin=url.origin;
  let cookie='';const checks=[];
  async function call(method,{authenticated=false,body}={}){
    let r;try{r=await fetchImpl(origin+'/api/observations/auth',{method,redirect:'manual',headers:{...(method==='GET'?{}:{Origin:origin,'Content-Type':'application/json'}),...(authenticated?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});}catch{throw new AuthPreflightError('network-unavailable');}
    return r;
  }
  const configured=await call('GET');if(configured.status!==200)throw new AuthPreflightError('auth-endpoint-unavailable');
  const initial=await configured.json();if(!initial.configured)throw new AuthPreflightError('authentication-not-configured');checks.push('configured');
  const login=await call('POST',{body:{password}});
  if(login.status===401)throw new AuthPreflightError('credential-rejected');
  if(login.status===403)throw new AuthPreflightError('origin-rejected');
  if(login.status!==200)throw new AuthPreflightError('login-unavailable');
  const set=login.headers.get('set-cookie')||'';
  if(!/HttpOnly/i.test(set)||!/Secure/i.test(set)||!/SameSite=Strict/i.test(set)||/Domain=/i.test(set)||!/^frenchy_observation_admin=/.test(set))throw new AuthPreflightError('unsafe-session-cookie');
  cookie=set.split(';')[0];checks.push('credential-accepted','secure-host-only-session');
  try{const session=await call('GET',{authenticated:true});if(session.status!==200||!(await session.json()).authenticated)throw new AuthPreflightError('session-not-accepted');checks.push('session-accepted');}
  finally{await call('DELETE',{authenticated:true});cookie='';}
  const anonymous=await call('GET');if(anonymous.status!==200||(await anonymous.json()).authenticated)throw new AuthPreflightError('logout-not-confirmed');checks.push('logout-confirmed');
  return {origin,passed:true,checks};
}
export async function runCli(args,env=process.env){
  const [origin,credentialFile]=args;
  // Explicit owner-provided local file or process environment; never an API lookup or command-line password.
  let password=env.FRENCHY_AUTH_PASSWORD;
  if(credentialFile){let data;try{data=JSON.parse(await readFile(credentialFile,'utf8'));}catch{throw new AuthPreflightError('credential-file-unavailable');}password=data.password;}
  return authPreflight({origin,password});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{console.log(JSON.stringify(await runCli(process.argv.slice(2))));}
  catch(error){console.error(JSON.stringify({passed:false,code:error instanceof AuthPreflightError?error.code:'preflight-failed'}));process.exitCode=1;}
}
