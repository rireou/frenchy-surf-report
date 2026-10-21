import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildReportFromSource } from '../netlify/lib/report-runtime.mjs';
import { __test } from '../netlify/functions/surf-report.mjs';

const site = 'https://report.frenchysurfschool.com.au';
const read = path => readFileSync(path, 'utf8');

for (const location of ['seaford', 'middleton', 'mid-coast', 'south-port']) {
  test(`${location}: canonical, Open Graph and structured data share the official domain`, () => {
    const config = __test.LOCATION_MAP[location];
    const input = JSON.parse(read(`tests/fixtures/${config.engine}-input.json`));
    const base = buildReportFromSource(config.engine, input.source, input.tides, { now: new Date(input.now) });
    const result = config.scope === 'spot-specific' ? base : { ...base, canonical: __test.regionalise(base.canonical, config) };
    const pathname = location === 'seaford' ? '/' : location === 'middleton' ? '/middleton.html' : `/surf-report/${location}`;
    assert.equal(result.canonical.canonical_url, site + pathname);
    assert.equal(result.canonical.methodology_url, site + '/surf-report-data');
    const html = __test.renderReportHtml(config, result);
    assert.ok(html.includes(`<link rel="canonical" href="${site}${pathname}"`));
    assert.ok(html.includes(`<meta property="og:url" content="${site}${pathname}"`));
    assert.doesNotMatch(html, /https:\/\/frenchyreview\.netlify\.app/);
    assert.ok(JSON.stringify(__test.reportJsonLd(result.canonical)).includes(site + '/api/surf-reports/'));
  });
}

test('discovery files advertise only the official report origin', () => {
  for (const path of ['sitemap.xml', 'robots.txt', 'llms.txt', 'surf-report-data.html', 'wave-map.html']) {
    const text = read(path);
    assert.ok(text.includes(site), path);
    assert.doesNotMatch(text, /https:\/\/frenchyreview\.netlify\.app/, path);
  }
});

test('forced legacy-host 301 rules precede existing routing and exclude previews and school hosts', () => {
  const rules = read('netlify.toml').split('[[redirects]]').slice(1);
  for (const [i, scheme] of ['https', 'http'].entries()) {
    const rule = rules[i];
    assert.ok(rule.includes(`from = "${scheme}://frenchyreview.netlify.app/*"`));
    assert.ok(rule.includes(`to = "${site}/:splat"`));
    assert.match(rule, /status\s*=\s*301/);
    assert.match(rule, /force\s*=\s*true/);
    // No query filter: Netlify retains every query parameter automatically.
    assert.doesNotMatch(rule, /query\s*=/);
  }
  const absoluteFrom = rules.map(rule => rule.match(/from\s*=\s*"(https?:[^" ]+)"/)?.[1]).filter(Boolean);
  assert.deepEqual(absoluteFrom, ['https://frenchyreview.netlify.app/*', 'http://frenchyreview.netlify.app/*']);
  assert.ok(rules[2].includes('/api/surf-reports/index.json'));
});
