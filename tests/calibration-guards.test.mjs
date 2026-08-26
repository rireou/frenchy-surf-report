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

test('Seaford shows a cautious 1ft for a usable 220 degree primary instead of Flat', () => {
  const engine = createLegacyEngine('seaford');
  const combined = engine.buildHourReport({
    time: '2026-08-30T12:00',
    offshore: {
      swell_wave_height: 1.9,
      swell_wave_direction: 220,
      swell_wave_period: 9.3,
      secondary_swell_wave_height: 0.8,
      secondary_swell_wave_direction: 228,
      secondary_swell_wave_period: 16.4,
      wind_wave_height: 0,
      wind_wave_direction: 0,
      wind_wave_period: 0
    },
    local: { wave_height: 0.2, wave_direction: 220, wave_period: 8, wind_wave_height: 0.1 },
    wind: { wind_speed_10m: 9, wind_direction_10m: 270 },
    gulfChecks: [],
    _allRows: [],
    _index: 0
  });

  assert.equal(combined.combinedEnergy.aligned, false);
  assert.ok(combined.combinedEnergy.secondaryFt >= 1.75);
  assert.equal(combined.offshoreModelFt, combined.singleDriverFt);
  assert.equal(combined.sizeText, '1');
  assert.equal(combined.southEdgeFloorApplied, false);

  const lowTideSuppressed = engine.seafordSouthEdgeUsableFloor({
    activeDriver: { heightM: 1.9, directionDeg: 220, periodS: 9.3 },
    windSpeed: 9
  }, 0.25);
  assert.equal(lowTideSuppressed.applied, true);
  assert.equal(engine.publicSizeText(lowTideSuppressed.ft), '1');
});

test('Seaford 60-check calibration applies capped partial-bias corrections', () => {
  const engine = createLegacyEngine('seaford');

  const westEdge = engine.seafordObservationCalibration({
    activeDriver: { directionDeg: 250, periodS: 10 },
    localRaw: { wave_height: 0.55 }
  }, 1.5);
  assert.equal(westEdge.adjustmentFt, 0.25);
  assert.equal(westEdge.ft, 1.75);

  const classicLong = engine.seafordObservationCalibration({
    activeDriver: { directionDeg: 230, periodS: 12 },
    localRaw: { wave_height: 0.7 }
  }, 3);
  assert.equal(classicLong.adjustmentFt, -0.3);
  assert.equal(classicLong.ft, 2.7);

  const unconfirmedWest = engine.seafordObservationCalibration({
    activeDriver: { directionDeg: 250, periodS: 10 },
    localRaw: { wave_height: 0.25 }
  }, 1.5);
  assert.equal(unconfirmedWest.applied, false);
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

test('Middleton 60-check calibration corrects broad biases without large jumps', () => {
  const engine = createLegacyEngine('middleton');

  const riskyLong = engine.middletonObservationCalibration({
    activeDriver: { directionDeg: 224, periodS: 12.5 }
  }, 4);
  assert.equal(riskyLong.adjustmentFt, -0.4);
  assert.equal(riskyLong.ft, 3.6);

  const shortPeriod = engine.middletonObservationCalibration({
    activeDriver: { directionDeg: 238, periodS: 8.5 }
  }, 2);
  assert.equal(shortPeriod.adjustmentFt, 0.2);
  assert.equal(shortPeriod.ft, 2.2);

  const classicLong = engine.middletonObservationCalibration({
    activeDriver: { directionDeg: 238, periodS: 15 }
  }, 5);
  assert.equal(classicLong.applied, false);
  assert.equal(classicLong.ft, 5);
});
