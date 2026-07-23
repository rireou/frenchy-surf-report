import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';
import { buildReportFromSource, fixtureProjection } from '../netlify/lib/report-runtime.mjs';

for (const location of ['seaford', 'middleton']) {
  test(`${location} calculation remains byte-for-byte compatible with the fixed reference`, () => {
    const input = JSON.parse(readFileSync(resolve(`tests/fixtures/${location}-input.json`), 'utf8'));
    const expected = JSON.parse(readFileSync(resolve(`tests/fixtures/${location}-expected.json`), 'utf8'));
    const actual = JSON.parse(JSON.stringify(fixtureProjection(
      buildReportFromSource(location, input.source, input.tides, { now: new Date(input.now) })
    )));
    assert.deepStrictEqual(actual, expected);
  });
}
