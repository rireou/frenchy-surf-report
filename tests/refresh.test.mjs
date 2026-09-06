import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import seaford from '../netlify/functions/seaford-data.js';
import middleton from '../netlify/functions/middleton-data.js';

test('server cache coalesces forced requests and preserves original stale timestamp',async()=>{
  const source=readFileSync('netlify/lib/report-source.mjs','utf8');
  const fn=source.match(/async function loadSource\(location, force = false\) \{[\s\S]*?\n\}/)[0];
  let calls=0, release;
  const cache=new Map();
  const ctx=vm.createContext({cache,Date,SOURCE_CACHE_MS:240000,STALE_LIMIT_MS:3600000,freshSource:()=>{
    calls++;return new Promise(resolve=>{release=resolve});
  }});
  vm.runInContext(fn,ctx);
  const a=vm.runInContext("loadSource('seaford',true)",ctx);
  const b=vm.runInContext("loadSource('seaford',true)",ctx);
  assert.equal(calls,1);
  release({generatedAt:'original'});
  await Promise.all([a,b]);
  await vm.runInContext("loadSource('seaford')",ctx);
  assert.equal(calls,1);
  const savedAt=cache.get('seaford').savedAt;
  ctx.freshSource=async()=>{throw Error('offline')};
  const stale=await vm.runInContext("loadSource('seaford',true)",ctx);
  assert.equal(stale.generatedAt,'original');
  assert.equal(stale.staleDataUsed,true);
  assert.equal(cache.get('seaford').savedAt,savedAt);
  cache.get('seaford').savedAt=Date.now()-3600001;
  await assert.rejects(vm.runInContext("loadSource('seaford',true)",ctx),/offline/);
});

test('forced JSON is not stored by browser or Netlify CDN',()=>{
  const source=readFileSync('netlify/functions/surf-report.mjs','utf8');
  assert.match(source,/query.at \|\| force/);
  assert.match(source,/'Netlify-CDN-Cache-Control': 'no-store'/);
});

for (const [spot, source, count] of [['seaford',seaford,7],['middleton',middleton,9]]) {
  test(spot+' starts independent requests concurrently with no duplicate URLs', async () => {
    const original = globalThis.fetch;
    const calls = [], release = [];
    globalThis.fetch = (url) => {
      calls.push(url);
      return new Promise(resolve => release.push(() => resolve({ok:true,json:async()=>({hourly:{time:['2026-09-06T12:00']}})})));
    };
    try {
      const pending = source.handler();
      assert.equal(calls.length,count,'all source calls start before any returns');
      assert.equal(new Set(calls).size,count);
      release.forEach(resolve=>resolve());
      assert.equal((await pending).statusCode,200);
    } finally {globalThis.fetch=original;}
  });
}

for (const file of ['index.html','middleton.html']) {
  const html=readFileSync(file,'utf8');
  const body=html.match(/    async function hydrateCanonicalReport\(force = false\) \{[\s\S]*?\n    \}/)[0];
  test(file+' failed refresh keeps the displayed report and clears loading lock',async()=>{
    const load=html.match(/    async function loadReport\(force = false\) \{[\s\S]*?\n    \}/)[0];
    const report={days:[{date:'2026-09-06'}]};
    const state={report};
    const nodes={statusText:{textContent:'Current'},plainWhy:{textContent:'Original surf plan'}};
    const window={__FRENCHY_CANONICAL_REQUIRED__:true};
    const ctx=vm.createContext({window,state,$:id=>nodes[id],console:{error(){}},setReportLoadingState(){},hydrateCanonicalReport:async()=>{throw Error('offline')},applyCanonicalFreshness:()=>{nodes.statusText.textContent='Refresh failed'}});
    vm.runInContext(load,ctx);
    await vm.runInContext('loadReport(true)',ctx);
    assert.equal(state.report,report);
    assert.equal(nodes.plainWhy.textContent,'Original surf plan');
    assert.equal(window.__FRENCHY_REFRESH_FAILED__,true);
    assert.equal(state.isLoadingReport,false);
  });
  test(file+' refresh revalidates and retains snapshot on invalid response',async()=>{
    const original={report:{reports:[{finalFt:2}]},data:{}};
    const window={__FRENCHY_SSR_STATE__:original,__FRENCHY_CANONICAL_REPORT__:{spot:{id:file==='index.html'?'seaford':'middleton'},issued_at:'old'}};
    const calls=[];
    const ctx=vm.createContext({window,AbortSignal,fetch:async(url,options)=>{
      calls.push({url,options});return {ok:true,json:async()=>({hydration:null,canonical:{status:'unavailable'}})};
    },applyServerHydration:()=>true,render:()=>{},applyCanonicalFreshness:()=>{}});
    vm.runInContext(body,ctx);
    await assert.rejects(vm.runInContext('hydrateCanonicalReport(true)',ctx),/previous report retained/);
    assert.equal(calls[0].options.cache,'no-cache');
    assert.match(calls[0].url,/refresh=1/);
    assert.equal(window.__FRENCHY_SSR_STATE__,original);
    assert.equal(window.__FRENCHY_CANONICAL_REPORT__.issued_at,'old');
  });
  test(file+' normal hydration makes no duplicate request',async()=>{
    const ctx=vm.createContext({window:{__FRENCHY_SSR_STATE__:{data:{}}},fetch:()=>{throw Error('unexpected request')},applyServerHydration:()=>true,render:()=>{},applyCanonicalFreshness:()=>{}});
    vm.runInContext(body,ctx);
    assert.equal(await vm.runInContext('hydrateCanonicalReport(false)',ctx),true);
    assert.match(html,/navigation\?\.type === 'reload'/);
    assert.match(html,/previous report retained/);
  });
}
