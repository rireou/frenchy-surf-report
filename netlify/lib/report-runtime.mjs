import vm from 'node:vm';
import { readProjectText } from './project-files.mjs';

const TIMEZONE = 'Australia/Adelaide';

const ENGINE_EXPORTS = {
  seaford: [
    'CONFIG',
    'state',
    'combineHourly',
    'buildHourReport',
    'applySeafordNowcastHold',
    'groupByDay',
    'sizeRange',
    'publicSizeText',
    'liveSizeText',
    'buildDailySummary',
    'compassFromDeg',
    'nextTideCall',
    'currentTideObservationSnapshot',
    'windObservationSnapshot',
    'currentWeatherObservationSnapshot',
    'normaliseTideDataset',
    'formatTime',
    'SEAFORD_CALCULATION_VERSION'
  ],
  middleton: [
    'CONFIG',
    'state',
    'combineHourly',
    'buildHourReport',
    'groupByDay',
    'sizeRange',
    'liveSizeText',
    'buildDailySummary',
    'compassFromDeg',
    'nextTideCall',
    'currentTideObservationSnapshot',
    'windObservationSnapshot',
    'currentWeatherObservationSnapshot',
    'normaliseTideDataset',
    'formatTime',
    'MIDDLETON_CALCULATION_VERSION'
  ]
};

function createElement(id) {
  return {
    id,
    value: id === 'calibrationSelect' ? 'normal' : id === 'timeSelect' ? 'live' : '',
    textContent: '',
    innerHTML: '',
    disabled: false,
    files: [],
    style: {},
    classList: {
      add() {},
      remove() {},
      contains() { return false; }
    },
    addEventListener() {},
    click() {}
  };
}

function createDomStubs() {
  const elements = new Map();
  const getElementById = id => {
    if (!elements.has(id)) elements.set(id, createElement(id));
    return elements.get(id);
  };
  return {
    elements,
    document: {
      getElementById,
      addEventListener() {},
      querySelector() { return null; },
      querySelectorAll() { return []; },
      body: { textContent: '', classList: { add() {}, remove() {} } }
    }
  };
}

function extractLegacyScript(location) {
  const fileName = location === 'middleton' ? 'middleton.html' : 'index.html';
  const html = readProjectText(fileName);
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  if (!scripts.length) throw new Error(`No inline script found in ${fileName}`);
  let source = scripts.at(-1)[1];
  const bootstrapMarker = "$('refreshBtn').addEventListener";
  const markerIndex = source.lastIndexOf(bootstrapMarker);
  if (markerIndex < 0) throw new Error(`Could not isolate the ${location} bootstrap`);
  source = source.slice(0, markerIndex);
  const exports = ENGINE_EXPORTS[location];
  source += `\n;globalThis.__FRENCHY_ENGINE__ = { ${exports.join(', ')} };\n`;
  return { fileName, source };
}

export function createLegacyEngine(location) {
  if (!ENGINE_EXPORTS[location]) throw new Error(`Unsupported surf-report location: ${location}`);
  const { document } = createDomStubs();
  const storage = new Map();
  const window = { location: { search: '' }, addEventListener() {} };
  const context = vm.createContext({
    console,
    window,
    document,
    navigator: { clipboard: { writeText() {} } },
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); }
    },
    URL,
    URLSearchParams,
    Intl,
    Date,
    Math,
    JSON,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Promise,
    Map,
    Set,
    RegExp,
    Error,
    TypeError,
    AbortController,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    fetch: async () => { throw new Error('Network access is disabled inside the calculation runtime'); },
    alert() {}
  });
  const { fileName, source } = extractLegacyScript(location);
  new vm.Script(source, { filename: fileName }).runInContext(context, { timeout: 5000 });
  return context.__FRENCHY_ENGINE__;
}

function normaliseSource(location, source) {
  if (!source?.ok) throw new Error(source?.error || `${location} source data is unavailable`);
  if (location === 'seaford') {
    return {
      dataSource: source.dataSource || 'server',
      offshore: source.offshore,
      local: source.local,
      wind: source.wind,
      weather: source.weather || {},
      gulfChecks: source.gulfChecks || [],
      dataWarnings: source.warnings || [],
      staleDataUsed: Boolean(source.staleDataUsed),
      optionalFetchFailures: (source.gulfChecks || []).filter(item => item.failed),
      lastSuccessfulFetchTime: source.generatedAt,
      lastNetworkFetchTime: source.generatedAt,
      cacheAgeMs: 0,
      latestDataSource: 'server',
      meta: { dataSource: source.dataSource || 'server', serverGeneratedAt: source.generatedAt }
    };
  }
  return {
    dataSource: source.dataSource || 'server',
    offshorePoints: source.offshore,
    offshore: source.offshore?.[0]?.data,
    local: source.local,
    wind: source.wind,
    weather: source.weather || {},
    dataWarnings: source.warnings || [],
    staleDataUsed: Boolean(source.staleDataUsed),
    optionalFetchFailures: (source.offshore || []).filter(item => item.failed),
    lastSuccessfulFetchTime: source.generatedAt,
    lastNetworkFetchTime: source.generatedAt,
    cacheAgeMs: 0,
    latestDataSource: 'server'
  };
}

function adelaideLocalParts(date) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-AU', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value])
  );
}

function selectCurrentReport(reports, now) {
  const parts = adelaideLocalParts(now);
  const local = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  const target = new Date(local).getTime();
  const sameDay = reports.filter(report => report.time.startsWith(local.slice(0, 10)));
  const pool = sameDay.length ? sameDay : reports;
  return pool.map(report => ({
    report,
    distance: Math.abs(new Date(report.time).getTime() - target)
  })).sort((a, b) => a.distance - b.distance)[0]?.report || null;
}

function localOffsetFor(dateString) {
  const date = new Date(`${dateString.slice(0, 10)}T12:00:00Z`);
  const part = new Intl.DateTimeFormat('en-AU', {
    timeZone: TIMEZONE,
    timeZoneName: 'longOffset'
  }).formatToParts(date).find(item => item.type === 'timeZoneName')?.value || 'GMT+09:30';
  return part.replace('GMT', '');
}

function localForecastIso(localTime) {
  return `${localTime}:00${localOffsetFor(localTime)}`;
}

function waveRange(display, valueFt) {
  const numbers = String(display).match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
  if (!numbers.length) return { min_ft: 0, max_ft: 0 };
  if (numbers.length === 1) return { min_ft: numbers[0], max_ft: numbers[0] };
  return { min_ft: numbers[0], max_ft: numbers[1] };
}

function buildCanonical(location, engine, source, reportState, now) {
  const report = selectCurrentReport(reportState.reports, now);
  if (!report) throw new Error(`No ${location} forecast row is available`);
  const day = reportState.days.find(item => item.date === report.time.slice(0, 10)) || reportState.days[0];
  const issued = new Date(source.generatedAt || now.toISOString());
  const validUntil = new Date(issued.getTime() + 20 * 60 * 1000);
  const status = now <= validUntil ? 'current' : 'expired';
  const display = engine.liveSizeText(report);
  const range = waveRange(display, Number(report.finalFt || 0));
  const wind = engine.windObservationSnapshot(report);
  const tide = engine.currentTideObservationSnapshot(report.time);
  const weather = engine.currentWeatherObservationSnapshot(report.time);
  const summary = engine.buildDailySummary(day, report);
  const active = report.activeDriver || {};
  const isMiddleton = location === 'middleton';
  const name = isMiddleton ? 'Middleton' : 'Seaford';
  const slug = isMiddleton ? 'middleton' : 'seaford';
  return {
    schema_version: 1,
    report_type: 'surf_report',
    provider: {
      name: 'Frenchy Surf School',
      url: 'https://www.frenchysurfschool.com.au/'
    },
    spot: {
      id: slug,
      name,
      region: isMiddleton ? 'Fleurieu Peninsula / South Coast' : 'Adelaide Mid Coast',
      country: 'Australia',
      timezone: TIMEZONE,
      calibration_scope: 'spot-specific'
    },
    wave: {
      value_ft: Number(report.finalFt),
      model_value_ft: Number(report.originalFinalFt ?? report.finalFt),
      display,
      ...range,
      confidence: String(report.confidence || 'unknown').toLowerCase()
    },
    swell: {
      height_m: Number(active.heightM ?? report.offshoreRaw?.swell_wave_height),
      direction_deg: Number(active.directionDeg ?? report.offshoreRaw?.swell_wave_direction),
      period_s: Number(active.periodS ?? report.offshoreRaw?.swell_wave_period),
      direction_compass: engine.compassFromDeg(active.directionDeg),
      driver: active.kind || null,
      source: active.sourceName || null
    },
    wind: {
      speed_kmh: wind.speedKmh,
      direction_deg: wind.directionDeg,
      direction_compass: wind.directionCompass,
      strength: wind.strength,
      label: wind.label
    },
    tide,
    weather,
    summary: {
      headline: summary.headline,
      text: summary.text,
      best_window: summary.bestWindow,
      wind_shift: summary.windShift,
      tide_call: engine.nextTideCall(report)
    },
    forecast_for: localForecastIso(report.time),
    issued_at: issued.toISOString(),
    valid_until: validUntil.toISOString(),
    status,
    calculation_version: isMiddleton
      ? engine.MIDDLETON_CALCULATION_VERSION
      : engine.SEAFORD_CALCULATION_VERSION,
    methodology_url: 'https://frenchyreview.netlify.app/surf-report-data',
    canonical_url: isMiddleton
      ? 'https://frenchyreview.netlify.app/middleton.html'
      : 'https://frenchyreview.netlify.app/',
    booking_url: 'https://frenchysurfschool.com.au/',
    warnings: source.warnings || []
  };
}

export function buildReportFromSource(location, source, tideData, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const engine = createLegacyEngine(location);
  const data = normaliseSource(location, source);
  const normalisedTides = engine.normaliseTideDataset(tideData || {});
  if (location === 'seaford') engine.state.portNoarlungaTides = normalisedTides;
  else engine.state.yearlyTides = normalisedTides;
  engine.state.data = data;
  const rows = location === 'seaford'
    ? engine.combineHourly(data.offshore, data.local, data.wind, data.gulfChecks || [])
    : engine.combineHourly(data.offshorePoints, data.local, data.wind);
  let reports = rows.map(engine.buildHourReport);
  if (location === 'seaford') reports = engine.applySeafordNowcastHold(reports);
  const days = engine.groupByDay(reports);
  const report = {
    reports,
    days,
    dataWarnings: data.dataWarnings,
    staleDataUsed: data.staleDataUsed,
    optionalFetchFailures: data.optionalFetchFailures,
    lastSuccessfulFetchTime: data.lastSuccessfulFetchTime,
    dataSource: data.dataSource
  };
  engine.state.report = report;
  const canonical = buildCanonical(location, engine, source, report, now);
  return {
    canonical,
    hydration: {
      location,
      generatedAt: source.generatedAt,
      data,
      report,
      tides: normalisedTides
    }
  };
}

export function fixtureProjection(result) {
  return {
    calculation_version: result.canonical.calculation_version,
    wave: result.canonical.wave,
    swell: result.canonical.swell,
    wind: result.canonical.wind,
    tide: {
      heightM: result.canonical.tide.heightM,
      stage: result.canonical.tide.stage,
      movement: result.canonical.tide.movement,
      positionLabel: result.canonical.tide.positionLabel,
      rangeM: result.canonical.tide.rangeM,
      rangeLabel: result.canonical.tide.rangeLabel
    },
    summary: result.canonical.summary,
    reports: result.hydration.report.reports.map(report => ({
      time: report.time,
      finalFt: report.finalFt,
      originalFinalFt: report.originalFinalFt,
      sizeText: report.sizeText,
      confidence: report.confidence,
      driver: {
        kind: report.activeDriver?.kind,
        heightM: report.activeDriver?.heightM,
        directionDeg: report.activeDriver?.directionDeg,
        periodS: report.activeDriver?.periodS
      },
      windSpeed: report.windSpeed,
      windDir: report.windDir,
      tideDrag: report.tideDrag || null,
      tidePush: report.tidePush || null
    })),
    days: result.hydration.report.days.map(day => ({
      date: day.date,
      avgFt: day.avgFt,
      sizeText: day.sizeText,
      peakTime: day.peak?.time,
      bestTime: day.best?.time
    }))
  };
}
