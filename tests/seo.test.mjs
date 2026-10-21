import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildReportFromSource} from '../netlify/lib/report-runtime.mjs';
import {__test} from '../netlify/functions/surf-report.mjs';

for (const location of ['seaford', 'middleton', 'mid-coast', 'south-port']) {
  test(`${location}: server-rendered local title and structured page describe the canonical location`, () => {
    const config=__test.LOCATION_MAP[location];
    const input=JSON.parse(readFileSync(`tests/fixtures/${config.engine}-input.json`,'utf8'));
    const base=buildReportFromSource(config.engine,input.source,input.tides,{now:new Date(input.now)});
    const result=config.scope==='spot-specific'?base:{...base,canonical:__test.regionalise(base.canonical,config)};
    const before=JSON.stringify(result);
    const html=__test.renderReportHtml(config,result);
    assert.ok(html.includes(`<title>${config.searchTitle}</title>`));
    assert.ok(html.includes(`<meta property="og:title" content="${config.searchTitle}"`));
    assert.match(config.searchTitle,/Adelaide|South Coast SA/);
    const schemas=[...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]));
    const pages=schemas.flatMap(s=>s['@graph']||[]).filter(n=>n['@type']==='WebPage');
    assert.ok(pages.length>0);
    for(const page of pages) {
      assert.equal(page.url,result.canonical.canonical_url);
      assert.equal(page['@id'],result.canonical.canonical_url+'#webpage');
      assert.equal(page.about['@id'],result.canonical.canonical_url+'#place');
    }
    assert.equal(JSON.stringify(result),before,'SEO rendering must not mutate forecast results');
    assert.doesNotMatch(html,/<meta name="robots" content="[^"]*noindex/);
  });
}

test('report pages retain crawlable regional and directory links outside the rebuilt header',()=>{
  for(const file of ['index.html','middleton.html']) {
    const html=readFileSync(file,'utf8');
    const intro=html.match(/<p class="subtitle report-intro">([\s\S]*?)<\/p>/)?.[1];
    assert.ok(intro.includes('href="/surf-report/mid-coast"'));
    assert.ok(intro.includes('href="/surf-reports"'));
  }
});

test('sitemap retains required canonical pages without stale hard-coded last-modified dates',()=>{
  const xml=readFileSync('sitemap.xml','utf8');
  for(const path of ['/','/middleton.html','/surf-report/mid-coast','/surf-reports']) assert.ok(xml.includes(`<loc>https://report.frenchysurfschool.com.au${path}</loc>`));
  assert.doesNotMatch(xml,/<lastmod>/);
  assert.equal(readFileSync('google9b4b6bf2653de717.html','utf8').trim(),'google-site-verification: google9b4b6bf2653de717.html');
});
