import { createLegacyEngine } from './report-runtime.mjs';
import { outlookNotes } from './outlook-notes.mjs';

export function buildOutlook(location, result, { now = new Date(), notes = outlookNotes } = {}) {
  const canonical = result.canonical;
  const base = { schema_version: 1, report_type: 'surf_outlook', spot: canonical.spot,
    issued_at: canonical.issued_at, valid_until: canonical.valid_until, status: canonical.status,
    calculation_version: canonical.calculation_version, canonical_url: canonical.canonical_url,
    warnings: canonical.warnings || [], days: [] };
  const h = result.hydration;
  if (!h?.report?.days || canonical.status === 'unavailable') return base;
  const engine = createLegacyEngine(location);
  engine.state.data = h.data;
  engine.state.report = h.report;
  if (location === 'seaford') engine.state.portNoarlungaTides = h.tides;
  else engine.state.yearlyTides = h.tides;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Adelaide', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const lastDate = new Date(`${today}T12:00:00Z`); lastDate.setUTCDate(lastDate.getUTCDate() + 6);
  const end = lastDate.toISOString().slice(0, 10);
  base.days = h.report.days.filter(d => d.date >= today && d.date <= end && d.best && d.reports?.length)
    .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 7).map(day => {
      // Reuse already calculated day size and best hour. Do not rank or recalculate hourly waves.
      const best = day.best;
      const summary = engine.buildDailySummary(day, best);
      const wind = engine.windObservationSnapshot(best);
      const tide = engine.currentTideObservationSnapshot(best.time);
      const active = best.activeDriver || {};
      const note = notes[location]?.[day.date];
      const manualNote = note && ['supplement', 'override'].includes(note.mode) && typeof note.text === 'string'
        ? { mode: note.mode, text: note.text } : null;
      return { date: day.date, wave: { display: day.sizeText, confidence: best.confidence || null },
        reference_time: best.time, best_hour: engine.formatTime(best.time),
        best_window: String(summary.bestWindow || '').replace(/^Today · /, ''),
        quality: engine.surfQualityLabel(best), quality_basis: 'Original engine quality at the model-selected best hour',
        swell: { height_m: active.heightM ?? null, period_s: active.periodS ?? null,
          direction_deg: active.directionDeg ?? null, direction_compass: active.directionDeg == null ? null : engine.compassFromDeg(active.directionDeg) },
        wind: { label: wind.label, speed_kmh: wind.speedKmh, direction_compass: wind.directionCompass },
        tide: { positionLabel: tide.positionLabel, heightM: tide.heightM, source: tide.source },
        summary: { headline: summary.headline, text: summary.text }, manual_note: manualNote,
        beginner_suitability: null, needs_beach_check: Boolean(best.needsBeachCheck) };
    });
  return base;
}
