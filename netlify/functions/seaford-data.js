const CONFIG = {
  tz: 'Australia/Adelaide',
  offshore: { lat: -36.05, lon: 136.70 },
  local: { lat: -35.19, lon: 138.48 },
  wind: { lat: -35.19, lon: 138.48 },
  weather: { lat: -35.19, lon: 138.48 },
  forecastDays: 7
};

const GULF_CHECK_POINTS = [
  { name: 'Seaford local cell', lat: -35.19, lon: 138.48 },
  { name: 'Moana / Port Noarlunga cell', lat: -35.15, lon: 138.47 },
  { name: 'Christies / O’Sullivan cell', lat: -35.12, lon: 138.47 },
  { name: 'Outer Gulf entrance cell', lat: -35.35, lon: 138.20 }
];

const CACHE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=900'
};
const TIMEOUT_MS = 8000;

function marineUrl(point, localSea = false) {
  const params = new URLSearchParams({
    latitude: point.lat,
    longitude: point.lon,
    current: 'wave_height,wave_direction,wave_period,wind_wave_height,wind_wave_direction,wind_wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,secondary_swell_wave_height,secondary_swell_wave_direction,secondary_swell_wave_period',
    hourly: 'wave_height,wave_direction,wave_period,wind_wave_height,wind_wave_direction,wind_wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,secondary_swell_wave_height,secondary_swell_wave_direction,secondary_swell_wave_period',
    timezone: CONFIG.tz,
    forecast_days: String(CONFIG.forecastDays)
  });
  if (localSea) params.set('cell_selection', 'sea');
  return `https://marine-api.open-meteo.com/v1/marine?${params}`;
}

function windUrl() {
  const params = new URLSearchParams({
    latitude: CONFIG.wind.lat,
    longitude: CONFIG.wind.lon,
    current: 'wind_speed_10m,wind_direction_10m',
    hourly: 'wind_speed_10m,wind_direction_10m',
    daily: 'wind_speed_10m_max,wind_direction_10m_dominant',
    timezone: CONFIG.tz,
    forecast_days: String(CONFIG.forecastDays)
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

function weatherUrl() {
  const params = new URLSearchParams({
    latitude: CONFIG.weather.lat,
    longitude: CONFIG.weather.lon,
    current: 'temperature_2m,weather_code,precipitation,wind_speed_10m',
    hourly: 'temperature_2m,weather_code,precipitation_probability,wind_speed_10m',
    daily: 'temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,wind_speed_10m_max',
    timezone: CONFIG.tz,
    forecast_days: String(CONFIG.forecastDays)
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

async function fetchJson(label, url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`${label} fetch failed: ${response.status}`);
    return await response.json();
  } catch (err) {
    const message = err?.name === 'AbortError' ? `${label} fetch timed out` : (err?.message || String(err));
    throw new Error(message);
  } finally {
    clearTimeout(timer);
  }
}

async function optionalFetch(label, url) {
  try {
    return { data: await fetchJson(label, url), failed: false };
  } catch (err) {
    return { data: null, failed: true, error: err?.message || String(err) };
  }
}

exports.handler = async () => {
  const warnings = [];
  try {
    const [offshore, local, wind] = await Promise.all([
      fetchJson('Seaford offshore marine', marineUrl(CONFIG.offshore, false)),
      fetchJson('Seaford local marine', marineUrl(CONFIG.local, true)),
      fetchJson('Seaford wind', windUrl())
    ]);

    const weatherResult = await optionalFetch('Seaford weather', weatherUrl());
    if (weatherResult.failed) warnings.push(`Seaford weather: ${weatherResult.error}`);

    const gulfResults = await Promise.allSettled(GULF_CHECK_POINTS.map(async point => {
      const result = await optionalFetch(point.name, marineUrl(point, true));
      if (result.failed) warnings.push(`${point.name}: ${result.error}`);
      return { point, data: result.data, failed: result.failed, error: result.error || null };
    }));
    const gulfChecks = gulfResults.map((result, index) => result.status === 'fulfilled'
      ? result.value
      : { point: GULF_CHECK_POINTS[index], data: null, failed: true, error: result.reason?.message || String(result.reason) });

    return {
      statusCode: 200,
      headers: CACHE_HEADERS,
      body: JSON.stringify({ ok: true, generatedAt: new Date().toISOString(), offshore, local, wind, weather: weatherResult.data, gulfChecks, warnings })
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: CACHE_HEADERS,
      body: JSON.stringify({ ok: false, generatedAt: new Date().toISOString(), warnings, error: err?.message || String(err) })
    };
  }
};
