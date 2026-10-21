import source from './seaford-data.js';
import {researchStore,researchEnvironment} from '../lib/research-store.mjs';
import {scheduledArchive} from '../lib/research-archive.mjs';
export default async(_request,context)=> {
  const env=researchEnvironment(context);
  if(env.RESEARCH_ARCHIVE_ENABLED!=='true'||env.CONTEXT!=='production'||env.RESEARCH_DEPLOY_PUBLISHED!=='true')return new Response('Research archive disabled');
  const result=await scheduledArchive({env,store:researchStore(env),fetchSource:async()=>{
    const response=await source.handler();if(response.statusCode!==200)throw Error('Source unavailable');return JSON.parse(response.body);
  }});
  return Response.json(result);
};
export const config={schedule:'15 */3 * * *'};
