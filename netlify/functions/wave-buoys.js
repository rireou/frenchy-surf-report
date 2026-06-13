const CACHE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=900'
};

const TIMEOUT_MS = 12000;
const WFS_ENDPOINTS = [
  'https://geoserver-123.aodn.org.au/geoserver/ows',
  'http://geoserver-123.aodn.org.au/geoserver/ows'
];
const WFS_TYPENAME = 'aodn:aodn_wave_nrt_v2_timeseries_data';
const SA_BBOX = '136.0,-37.2,139.5,-34.0,EPSG:4326';
const USEFUL_BUOY_NAMES = [
  'cape du couedic',
  'gulf st vincent',
  'gulf saint vincent',
  'cape jervis',
  'fleurieu',
  'flinders',
  'sardi',
  'robe'
];

function jsonResponse(statusCode, body) {
  return { statusCode, headers: CACHE_HEADERS, body: JSON.stringify(body) };
}

function wfsUrl(endpoint) {
  const params = new URLSearchParams({
    service: 'WFS',
    version: '1.0.0',
    request: 'GetFeature',
    typeName: WFS_TYPENAME,
    outputFormat: 'application/json',
    maxFeatures: '1000',
    bbox: SA_BBOX
  });
  return `${endpoint}?${params}`;
}

async function fetchWithTimeout(url, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`${label} failed: ${response.status}`);
    return await response.json();
  } catch (err) {
    const message = err?.name === 'AbortError' ? `${label} timed out` : (err?.message || String(err));
    throw new Error(message);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWfsJson() {
  const errors = [];
  for (const endpoint of WFS_ENDPOINTS) {
    const url = wfsUrl(endpoint);
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        return { json: await fetchWithTimeout(url, `AODN wave buoy WFS attempt ${attempt}`), url };
      } catch (err) {
        errors.push(`${endpoint} attempt ${attempt}: ${err?.message || String(err)}`);
      }
    }
  }
  throw new Error(errors.join(' | '));
}

function firstValue(props, names) {
  for (const name of names) {
    if (props[name] !== undefined && props[name] !== null && props[name] !== '') return props[name];
    const key = Object.keys(props).find(k => k.toLowerCase() === name.toLowerCase());
    if (key && props[key] !== undefined && props[key] !== null && props[key] !== '') return props[key];
  }
  return null;
}

function numberValue(props, names) {
  const value = firstValue(props, names);
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function coordinates(feature) {
  const geom = feature.geometry;
  if (!geom) return { lat: null, lon: null };
  const raw = geom.type === 'Point' ? geom.coordinates : geom.coordinates?.flat?.(10);
  if (!Array.isArray(raw) || raw.length < 2) return { lat: null, lon: null };
  const lon = Number(raw[0]);
  const lat = Number(raw[1]);
  return { lat: Number.isFinite(lat) ? lat : null, lon: Number.isFinite(lon) ? lon : null };
}

function normaliseFeature(feature) {
  const props = feature.properties || {};
  const { lat, lon } = coordinates(feature);
  const name = String(firstValue(props, ['site_name', 'station_name', 'platform_name', 'platform_code', 'site_code', 'station', 'name']) || 'Wave buoy');
  const time = firstValue(props, ['time', 'TIME', 'datetime', 'timestamp', 'obs_time', 'time_coverage_end']);
  const waveHeightM = numberValue(props, ['significant_wave_height', 'significant_wave_height_m', 'hm0', 'hs', 'Hsig', 'VAVH', 'wave_height', 'sea_surface_wave_significant_height']);
  const periodS = numberValue(props, ['peak_wave_period', 'peak_period', 'tp', 'period', 'wave_period', 'Tpeak', 'sea_surface_wave_period_at_variance_spectral_density_maximum']);
  const directionDeg = numberValue(props, ['peak_wave_direction', 'wave_direction', 'direction', 'mean_wave_direction', 'DirTp', 'Mdir', 'sea_surface_wave_from_direction']);
  const source = String(firstValue(props, ['data_centre', 'data_centre_name', 'source', 'institution', 'agency']) || 'AODN WFS');
  return { name, lat, lon, time, waveHeightM, periodS, directionDeg, source };
}

function isUsefulBuoy(buoy) {
  const name = String(buoy.name || '').toLowerCase();
  const source = String(buoy.source || '').toLowerCase();
  const inSouthAustralia = buoy.lat !== null && buoy.lon !== null && buoy.lat <= -34 && buoy.lat >= -38 && buoy.lon >= 136 && buoy.lon <= 140;
  const usefulName = USEFUL_BUOY_NAMES.some(term => name.includes(term) || source.includes(term));
  return usefulName || inSouthAustralia;
}

function latestByName(buoys) {
  const byName = new Map();
  for (const buoy of buoys) {
    const key = `${buoy.name}-${buoy.lat}-${buoy.lon}`;
    const previous = byName.get(key);
    if (!previous || new Date(buoy.time || 0) > new Date(previous.time || 0)) byName.set(key, buoy);
  }
  return [...byName.values()].sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
}

exports.handler = async () => {
  const warnings = [
    'Buoy readings are live confidence/pulse context only; they do not override the Seaford or Middleton surf size model.',
    'Future: use Cape du Couedic / Gulf entrance buoy pulse as a 1.5–3 hour lead floor for Seaford live report.'
  ];
  try {
    const { json, url } = await fetchWfsJson();
    const features = Array.isArray(json.features) ? json.features : [];
    const buoys = latestByName(features.map(normaliseFeature).filter(isUsefulBuoy)).slice(0, 12);
    if (!buoys.length) warnings.push('AODN WFS responded, but no South Australia / Cape du Couedic / Gulf St Vincent buoy features matched the filter.');
    return jsonResponse(200, { ok: true, generatedAt: new Date().toISOString(), buoys, warnings, source: url });
  } catch (err) {
    warnings.push(err?.message || String(err));
    return jsonResponse(200, { ok: false, generatedAt: new Date().toISOString(), buoys: [], warnings });
  }
};
