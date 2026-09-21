import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildReportFromSource } from '../netlify/lib/report-runtime.mjs';
import { buildOutlook } from '../netlify/lib/outlook.mjs';
import { handler } from '../netlify/functions/surf-outlook.mjs';
for (const id of ['seaford', 'middleton']) {
  test(`${id}: compact outlook preserves calculated daily sizes and leaves original result untouched`, () => {
    const input = JSON.parse(readFileSync(`tests/fixtures/${id}-input.json`));
    const now = new Date(input.now);
    const result = buildReportFromSource(id, input.source, input.tides, { now });
    const before = JSON.stringify(result);
    const outlook = buildOutlook(id, result, { now });
    assert.ok(outlook.days.length > 0 && outlook.days.length <= 7);
    for (const day of outlook.days) {
      const original = result.hydration.report.days.find(d => d.date === day.date);
      assert.equal(day.wave.display, original.sizeText);
      assert.equal(day.reference_time, original.best.time);
      assert.equal(day.swell.height_m, original.best.activeDriver.heightM);
      assert.equal(day.beginner_suitability, null);
      assert.equal(typeof day.quality, 'string');
    }
    assert.equal(JSON.stringify(result), before);
    const date = outlook.days[0].date;
    const edited = buildOutlook(id, result, { now, notes: { [id]: { [date]: { mode: 'override', text: 'Coach note' } } } });
    assert.equal(edited.days[0].manual_note.text, 'Coach note');
    assert.deepEqual(edited.days[0].wave, outlook.days[0].wave);
    assert.deepEqual(edited.days[0].summary, outlook.days[0].summary);
    const partial = buildOutlook(id, { ...result, hydration: { ...result.hydration, report: { ...result.hydration.report, days: result.hydration.report.days.slice(0, 1) } } }, { now });
    assert.ok(partial.days.length <= 1);
  });
}
test('Unknown location and non-GET requests are rejected without source fetches', async () => {
  assert.equal((await handler({ httpMethod: 'POST' })).statusCode, 405);
  assert.equal((await handler({ queryStringParameters: { location: 'unknown' } })).statusCode, 404);
});
