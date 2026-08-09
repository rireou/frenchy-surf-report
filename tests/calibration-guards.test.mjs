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

test('Seaford marginal underfilled 2ft rows do not round up like stronger pulses', () => {
  const engine = createLegacyEngine('seaford');

  const underfilledNoon = engine.seafordMarginalUnderfillTrim({
    offshoreModelFt: 1.88,
    insideFloorFt: 0.26,
    localRaw: { wave_height: 0.46, wave_direction: 262 },
    gulfPointRealityConfidence: 'low'
  }, 1.88);
  assert.equal(underfilledNoon.trimmed, true);
  assert.equal(engine.publicSizeText(underfilledNoon.ft), '1.5');

  const strongerEvening = engine.seafordMarginalUnderfillTrim({
    offshoreModelFt: 2.34,
    insideFloorFt: 0.29,
    localRaw: { wave_height: 0.48, wave_direction: 256 },
    gulfPointRealityConfidence: 'low'
  }, 2.0);
  assert.equal(strongerEvening.trimmed, false);
  assert.equal(engine.publicSizeText(strongerEvening.ft), '2');
});

test('Seaford evening west limiter does not cliff-drop confirmed 246 degree energy', () => {
  const engine = createLegacyEngine('seaford');

  const nearWest = engine.seafordGulfRealityLimit(2.95, 2.95, 0.56, 246, '2026-08-09T18:00');
  assert.ok(nearWest.ft >= 2.8);
  assert.equal(engine.publicSizeText(nearWest.ft), '3');

  const trueWest = engine.seafordGulfRealityLimit(2.95, 2.95, 0.56, 250, '2026-08-09T18:00');
  assert.ok(trueWest.ft < 2.5);
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
    localRaw: { wave_height: 1.05, wave_period: 12, wave_direction: 236 }
  }, 1.0, 6.8);
  assert.equal(classicWsw.capped, false);
  assert.equal(classicWsw.ft, 6.8);

  const underfilledWsw = engine.middletonSwRealityCap({
    activeDriver: { heightM: 2.52, directionDeg: 236, periodS: 12.1 },
    localRaw: { wave_height: 0.72, wave_period: 12.3, wave_direction: 212 }
  }, 1.0, 4.6);
  assert.equal(underfilledWsw.capped, true);
  assert.ok(underfilledWsw.ft <= 2.2);

  const swellnetFriday = engine.middletonSwRealityCap({
    activeDriver: { heightM: 2.4, directionDeg: 229, periodS: 15.1 },
    localRaw: { wave_height: 0.9, wave_period: 13, wave_direction: 225 }
  }, 1.3, 4.7);
  assert.equal(swellnetFriday.capped, true);
  assert.ok(swellnetFriday.ft <= 3.2);

  const swellnetSaturdayMorning = engine.middletonSwRealityCap({
    activeDriver: { heightM: 2.66, directionDeg: 239, periodS: 12.1 },
    localRaw: { wave_height: 0.8, wave_period: 11.75, wave_direction: 223 }
  }, 1.3, 4.84);
  assert.equal(swellnetSaturdayMorning.capped, true);
  assert.ok(swellnetSaturdayMorning.ft <= 3.2);

  const swellnetMonday = engine.middletonSwRealityCap({
    activeDriver: { heightM: 3.6, directionDeg: 237, periodS: 16 },
    localRaw: { wave_height: 1.2, wave_period: 14, wave_direction: 235 }
  }, 1.6, 4.4);
  assert.equal(swellnetMonday.capped, false);
  assert.equal(swellnetMonday.ft, 4.4);
});
