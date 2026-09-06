import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';
import { buildReportFromSource, fixtureProjection } from '../netlify/lib/report-runtime.mjs';

for (const location of ['seaford', 'middleton']) {
  test(`${location} numeric calculation remains compatible; only approved Phase 1 metadata/copy changes`, () => {
    const input = JSON.parse(readFileSync(resolve(`tests/fixtures/${location}-input.json`), 'utf8'));
    const expected = JSON.parse(readFileSync(resolve(`tests/fixtures/${location}-expected.json`), 'utf8'));
    const actual = JSON.parse(JSON.stringify(fixtureProjection(
      buildReportFromSource(location, input.source, input.tides, { now: new Date(input.now) })
    )));
    // Keep the original fixture intact. Assert new presentation fields, then
    // compare every remaining field, including all sizes, drivers, wind and tide.
    assert.equal(actual.calculation_version, location + '-phase1-2026.09.05.1');
    assert.equal(actual.wave.confidence, 'not yet validated');
    assert.match(actual.summary.best_window, /daylight/);
    assert.doesNotMatch(actual.summary.best_window, /ft ft/);
    actual.calculation_version = expected.calculation_version;
    actual.wave.confidence = expected.wave.confidence;
    actual.summary.best_window = expected.summary.best_window;
    actual.reports.forEach((row,i) => {
      assert.equal(row.confidence, 'Not yet validated');
      row.confidence = expected.reports[i].confidence;
    });
    assert.deepStrictEqual(actual, expected);
  });
}
