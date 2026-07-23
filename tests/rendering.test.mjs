import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';
import { buildReportFromSource } from '../netlify/lib/report-runtime.mjs';
import { __test } from '../netlify/functions/surf-report.mjs';

function fixtureResult(location, nowOverride) {
  const input = JSON.parse(readFileSync(resolve(`tests/fixtures/${location}-input.json`), 'utf8'));
  return buildReportFromSource(location, input.source, input.tides, {
    now: new Date(nowOverride || input.now)
  });
}

test('initial Seaford HTML contains the canonical current values without JavaScript', () => {
  const result = fixtureResult('seaford');
  const html = __test.renderReportHtml(__test.LOCATION_MAP.seaford, result);
  assert.match(html, /id="mainSize">2-2\.5<\/span>/);
  assert.match(html, /id="windMain">11 km\/h<\/div>/);
  assert.match(html, /Status: current/);
  assert.match(html, /2026-06-12T02:20:00\.000Z/);
  assert.doesNotMatch(html, /id="mainSize">--<\/span>/);
  assert.doesNotMatch(html, /id="plainWhy">Fetching data/);
  assert.match(html, /window\.__FRENCHY_SSR_STATE__=/);
});

test('HTML, JSON-LD and hydration use the same Seaford model value', () => {
  const result = fixtureResult('seaford');
  const jsonLd = __test.reportJsonLd(result.canonical);
  const waveProperty = jsonLd['@graph'][1].variableMeasured.find(item => item.name === 'Wave height');
  const selected = result.hydration.report.reports.find(item => item.time === '2026-06-12T12:00');
  assert.equal(result.canonical.wave.value_ft, 2.5);
  assert.equal(waveProperty.value, result.canonical.wave.value_ft);
  assert.equal(selected.finalFt, result.canonical.wave.value_ft);
});

test('regional pages explicitly reuse Seaford and never claim spot-specific calibration', () => {
  const base = fixtureResult('seaford');
  const regional = {
    ...base,
    canonical: __test.regionalise(base.canonical, __test.LOCATION_MAP.moana)
  };
  const html = __test.renderReportHtml(__test.LOCATION_MAP.moana, regional);
  assert.equal(regional.canonical.wave.value_ft, base.canonical.wave.value_ft);
  assert.equal(regional.canonical.spot.calibration_scope, 'regional-mid-coast');
  assert.match(regional.canonical.summary.text, /not a separate spot-specific Moana calibration/i);
  assert.match(html, /not a spot-specific estimate/i);
});

test('old source data is marked expired rather than current', () => {
  const result = fixtureResult('middleton', '2026-06-12T04:00:00.000Z');
  assert.equal(result.canonical.status, 'expired');
  assert.ok(new Date(result.canonical.valid_until) < new Date('2026-06-12T04:00:00.000Z'));
});

test('unavailable HTML never contains an invented wave value', () => {
  const report = __test.unavailableReport(__test.LOCATION_MAP.seaford, new Error('fixture outage'));
  const html = __test.renderReportHtml(__test.LOCATION_MAP.seaford, {
    canonical: report,
    hydration: null
  });
  assert.match(html, /id="mainSize">Unavailable<\/span>/);
  assert.match(html, /Report unavailable/);
  assert.match(html, /No old value is being presented as current/);
});
