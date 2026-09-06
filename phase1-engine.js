/* Shared browser/server safety and presentation helpers. No swell coefficients. */
function phase1Number(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}
function phase1Step(trace, rule, value) {
  const previous = trace.steps.at(-1)?.afterFt ?? null;
  trace.steps.push({ rule, beforeFt: previous, afterFt: value, deltaFt: previous == null ? null : value - previous });
  return value;
}
function installPhase1(getState, hooks, spot) {
  const validWind = row => phase1Number(row?.wind_speed_10m) && phase1Number(row?.wind_direction_10m);
  const unit = text => /^(?:flat|unavailable|unknown|--)$/i.test(String(text).trim()) ? String(text) : `${String(text).replace(/\s*ft\s*$/i, '').trim()} ft`;
  const clock = time => {
    const h = Number(String(time).slice(11, 13)), m = Number(String(time).slice(14, 16));
    return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h >= 12 ? 'PM' : 'AM'}`;
  };
  const bounds = date => {
    const daily = getState().data?.weather?.daily;
    const i = daily?.time?.indexOf(date) ?? -1;
    const minutes = value => Number(value.slice(11, 13)) * 60 + Number(value.slice(14, 16));
    if (i >= 0 && daily.sunrise?.[i] && daily.sunset?.[i]) {
      const start = minutes(daily.sunrise[i]), end = minutes(daily.sunset[i]);
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) return { start, end, source: 'Open-Meteo sunrise/sunset' };
    }
    // Conservative planning fallback, not a claim about astronomical daylight.
    return { start: 8 * 60, end: 16 * 60, source: 'Conservative 8 AM–4 PM fallback; daylight data unavailable' };
  };
  const daylight = r => { const b = bounds(r.time.slice(0, 10)); const m = Number(r.time.slice(11,13))*60+Number(r.time.slice(14,16)); return m >= b.start && m < b.end; };
  const build = row => {
    if (!validWind(row.wind)) {
      return { time: row.time, finalFt: null, originalFinalFt: null, sizeText: 'Unavailable', windSpeed: null, windDir: null, windQuality: 0,
        confidence: 'Not yet validated', windStatus: 'unknown', sizeStatus: 'unavailable-missing-wind',
        activeDriver: { kind: 'Not selected: required wind missing', heightM: row.offshore?.swell_wave_height ?? null, directionDeg: row.offshore?.swell_wave_direction ?? null, periodS: row.offshore?.swell_wave_period ?? null },
        offshoreRaw: row.offshore || row.offshores?.[0]?.data || {}, localRaw: row.local || {}, windRaw: row.wind || {},
        calculationTrace: { steps: [], status: 'Not calculated: wind unknown; no calm substitute', finalFt: null },
        provenance: provenance(row) };
    }
    const r = hooks.build(row);
    r.confidence = 'Not yet validated';
    r.windStatus = getState().data?.staleDataUsed ? 'cached' : 'forecast';
    r.provenance = provenance(row);
    r.calculationTrace.finalFt = r.finalFt;
    r.calculationTrace.selectedSwell = { ...r.activeDriver };
    r.calculationTrace.beachTransfer = hooks.transfer?.(r.activeDriver) || null;
    r.calculationTrace.directionAndPeriod = { directionScore: r.activeDriver.directionScore, periodFactor: r.activeDriver.periodFactor,
      note: 'Existing coupled direction/period transfer; these are not independent additive adjustments. See starting estimate and unchanged source formula.' };
    r.calculationTrace.rawInputs = { offshore: r.offshoreRaw, local: r.localRaw, wind: r.windRaw, gulfChecks: row.gulfChecks || [], offshorePoints: row.offshores || [] };
    return r;
  };
  function provenance(row) {
    const data = getState().data || {};
    return { calculationVersion: `${spot}-phase1-2026.09.05.1`, coefficientsVersion: `${spot}-2026.08.24.1`, spot,
      forecastValidLocal: row.time, timezone: 'Australia/Adelaide', fetchedAt: data.lastSuccessfulFetchTime || null,
      modelIssuedAt: data.meta?.modelIssuedAt || null, source: 'Open-Meteo', model: 'best_match (provider default; run ID not supplied)',
      staleDataUsed: Boolean(data.staleDataUsed), windSource: data.wind?.fallback ? 'weather API fallback, matching forecast hour' : 'wind forecast API',
      baselineCommit: '82bf9f5734808186052ec3f921e308a06be30b9b' };
  }
  function summary(day, report) {
    if (!phase1Number(report.finalFt) || !validWind(report.windRaw)) return { headline: 'Wind unknown', text: 'Wind data is unavailable. Size and surf quality are not assessed until wind returns.', bestWindow: 'No verified surf window — wind unavailable', windShift: 'Unknown', swellTrend: 'Unknown' };
    const old = hooks.summary(day, report);
    const cutoff = day.date === hooks.today() ? hooks.nowMinutes() : -1;
    const choices = day.reports.filter(r => phase1Number(r.finalFt) && validWind(r.windRaw) && daylight(r) && Math.min(hooks.minutes(r.time)+60,bounds(day.date).end) > cutoff);
    const best = choices.slice().sort((a,b) => hooks.score(b)-hooks.score(a))[0];
    let bestWindow = 'No remaining verified daylight window — check the next day.';
    if (best) {
      const end = Math.min(hooks.minutes(best.time) + 60, bounds(day.date).end);
      const endTime = `${day.date}T${String(Math.floor(end/60)).padStart(2,'0')}:${String(end%60).padStart(2,'0')}`;
      const start = Math.max(hooks.minutes(best.time),cutoff);
      const startTime = `${day.date}T${String(Math.floor(start/60)).padStart(2,'0')}:${String(start%60).padStart(2,'0')}`;
      bestWindow = `${day.date === hooks.today() ? 'Today' : day.date} · ${clock(startTime)}–${clock(endTime)} · ${unit(hooks.size(best))} — best available daylight window`;
    }
    return { ...old, bestWindow, text: old.text.replace(/\s*ft\s+ft\b/gi, ' ft') };
  }
  return { build, summary, bounds, clock, unit, daylight, validWind };
}
