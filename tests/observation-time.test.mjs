import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildObservationSnapshot, buildReportFromSource } from '../netlify/lib/report-runtime.mjs';

function fixtureResult(location) {
  const input = JSON.parse(readFileSync(resolve(`tests/fixtures/${location}-input.json`), 'utf8'));
  return buildReportFromSource(location, input.source, input.tides, { now: new Date(input.now) });
}

test('Seaford observation time selects the matching wave, wind and tide row', () => {
  const result = fixtureResult('seaford');
  const morning = buildObservationSnapshot('seaford', result, '2026-06-11T20:30:00.000Z');
  const midday = buildObservationSnapshot('seaford', result, '2026-06-12T02:30:00.000Z');
  assert.equal(morning.forecastTime, '2026-06-12T06:00');
  assert.equal(midday.forecastTime, '2026-06-12T12:00');
  assert.equal(morning.predictedFt, 2);
  assert.equal(midday.predictedFt, 2.5);
  assert.match(morning.tide.positionLabel, /Dropping/);
  assert.match(midday.tide.positionLabel, /Pushing/);
  assert.notEqual(morning.windContext.label, midday.windContext.label);
});

test('Middleton observation time selects the matching wave, wind and tide row', () => {
  const result = fixtureResult('middleton');
  const morning = buildObservationSnapshot('middleton', result, '2026-06-11T20:30:00.000Z');
  const midday = buildObservationSnapshot('middleton', result, '2026-06-12T02:30:00.000Z');
  assert.equal(morning.location, 'Middleton');
  assert.equal(morning.forecastTime, '2026-06-12T06:00');
  assert.equal(midday.forecastTime, '2026-06-12T12:00');
  assert.equal(morning.predictedFt, 4.1324337600000005);
  assert.equal(midday.predictedFt, 7.809256704);
  assert.match(morning.tide.positionLabel, /Dropping/);
  assert.match(midday.tide.positionLabel, /Pushing/);
  assert.notEqual(morning.windContext.label, midday.windContext.label);
});

test('observation interface clearly confirms and guards the selected time', () => {
  const source = readFileSync(resolve('observation.js'), 'utf8');
  assert.match(source, /Selected observation time/);
  assert.match(source, /Matched \$\{spot\.name\} data/);
  assert.match(source, /snapshotRequestId/);
  assert.match(source, /api\/surf-reports\/\$\{encodeURIComponent\(spot\.slug\)\}\.json\?full=1&at=/);
  assert.match(source, /Loading wave, wind and tide/);
  assert.match(source, /scrollIntoView/);
});
