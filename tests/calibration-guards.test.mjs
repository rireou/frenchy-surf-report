import assert from 'node:assert/strict';
import test from 'node:test';
import { createLegacyEngine } from '../netlify/lib/report-runtime.mjs';

test('Seaford aligned WSW local fetch holds a small line without boosting messy chop', () => {
  const engine = createLegacyEngine('seaford');

  const aligned = engine.seafordWestFetchFloor({
    local: { wave_height: 0.48, wave_period: 6.5, wave_direction: 245, wind_wave_height: 0.35 },
    wind: { wind_speed_10m: 18, wind_direction_10m: 245 }
  }, 0.5);
  assert.equal(aligned.applied, true);
  assert.ok(aligned.ft >= 1.1);

  const messy = engine.seafordWestFetchFloor({
    local: { wave_height: 0.5, wave_period: 4.5, wave_direction: 245, wind_wave_height: 0.55 },
    wind: { wind_speed_10m: 18, wind_direction_10m: 245 }
  }, 0.5);
  assert.equal(messy.applied, false);
  assert.equal(messy.ft, 0.5);

  const badDirection = engine.seafordWestFetchFloor({
    local: { wave_height: 0.55, wave_period: 7, wave_direction: 180, wind_wave_height: 0.25 },
    wind: { wind_speed_10m: 18, wind_direction_10m: 245 }
  }, 0.5);
  assert.equal(badDirection.applied, false);
  assert.equal(badDirection.ft, 0.5);
});

test('Middleton SW reality cap trims exposed 211-230 degree overcalls but leaves WSW classics alone', () => {
  const engine = createLegacyEngine('middleton');

  const risky = engine.middletonSwRealityCap({
    activeDriver: { directionDeg: 224, periodS: 12.5 },
    localRaw: { wave_height: 0.72, wave_period: 9 }
  }, 1.0, 5.2);
  assert.equal(risky.capped, true);
  assert.ok(risky.ft <= 3.4);

  const classicWsw = engine.middletonSwRealityCap({
    activeDriver: { directionDeg: 236, periodS: 14.8 },
    localRaw: { wave_height: 0.72, wave_period: 9 }
  }, 1.0, 6.8);
  assert.equal(classicWsw.capped, false);
  assert.equal(classicWsw.ft, 6.8);
});
