// Build verification only. No deploy/upload command and no private evidence is copied.
import {build} from 'esbuild';
import {readdir,readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
const output='.netlify/research-build';await mkdir(output,{recursive:true});
async function syntax(directory) {
  for(const f of await readdir(directory,{withFileTypes:true})){
    const file=directory+'/'+f.name;if(f.isDirectory())await syntax(file);
    else if(/\.(mjs|js)$/.test(file))execFileSync(process.execPath,['--check',file]);
    else if(file.endsWith('.html'))for(const [i,m]of [...(await readFile(file,'utf8')).matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries())if(m[1].trim())new vm.Script(m[1],{filename:file+' inline '+i});
  }
}
await syntax('netlify');await syntax('research/memory');execFileSync(process.execPath,['--check','observation.js']);
for(const name of ['research','research-archive','surf-observations'])await build({entryPoints:['netlify/functions/'+name+'.mjs'],bundle:true,platform:'node',format:'esm',target:'node22',packages:'external',outfile:output+'/'+name+'.mjs',logLevel:'warning'});
for(const name of ['research','research-archive']){const content=await readFile(output+'/'+name+'.mjs','utf8');if(/trainingIds\s*:\s*\["[a-f\d-]{36}/.test(content))throw Error('Private fitted data leaked into bundle');}
await writeFile(output+'/README.txt','Verified function bundles for local review only. No deployment. Dashboard templates are included via Netlify configuration; private evidence is never a static asset.\n');
console.log('Build passed: function bundles, JS/inline syntax and private boundary. No deployment.');
