import { getSurfReport } from '../lib/report-source.mjs';
import { readProjectText } from '../lib/project-files.mjs';
import { buildObservationSnapshot } from '../lib/report-runtime.mjs';

const SITE = 'https://frenchyreview.netlify.app';
const SCHOOL = 'https://www.frenchysurfschool.com.au/';
const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=60',
  'X-Content-Type-Options': 'nosniff'
};
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=60',
  'Access-Control-Allow-Origin': '*',
  'X-Content-Type-Options': 'nosniff'
};

const LOCATION_MAP = {
  seaford: {
    engine: 'seaford',
    name: 'Seaford',
    slug: 'seaford',
    scope: 'spot-specific'
  },
  middleton: {
    engine: 'middleton',
    name: 'Middleton',
    slug: 'middleton',
    scope: 'spot-specific'
  },
  'mid-coast': {
    engine: 'seaford',
    name: 'Adelaide Mid Coast',
    slug: 'mid-coast',
    scope: 'regional-mid-coast'
  },
  'south-port': {
    engine: 'seaford',
    name: 'South Port',
    slug: 'south-port',
    scope: 'regional-mid-coast'
  }
};

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/-->/g, '--\\u003e');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function setElement(html, id, value) {
  const pattern = new RegExp(
    `(<(?:span|b|p|div)[^>]*\\bid=["']${id}["'][^>]*>)[\\s\\S]*?(</(?:span|b|p|div)>)`,
    'i'
  );
  return html.replace(pattern, `$1${value}$2`);
}

function replaceMeta(html, name, content) {
  const escaped = escapeHtml(content);
  const pattern = new RegExp(`(<meta[^>]+name=["']${name}["'][^>]+content=["'])[^"']*(["'][^>]*>)`, 'i');
  return pattern.test(html)
    ? html.replace(pattern, `$1${escaped}$2`)
    : html.replace('</head>', `  <meta name="${name}" content="${escaped}" />\n</head>`);
}

function reportJsonLd(report) {
  const measured = [
    ['Wave height', report.wave?.value_ft, 'FT'],
    ['Swell height', report.swell?.height_m, 'MTR'],
    ['Swell direction', report.swell?.direction_deg, 'DEG'],
    ['Swell period', report.swell?.period_s, 'SEC'],
    ['Wind speed', report.wind?.speed_kmh, 'KMH'],
    ['Wind direction', report.wind?.direction_deg, 'DEG'],
    ['Tide height', report.tide?.heightM, 'MTR']
  ].filter(([, value]) => Number.isFinite(Number(value))).map(([name, value, unitCode]) => ({
    '@type': 'PropertyValue',
    name,
    value,
    unitCode
  }));
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${report.canonical_url}#webpage`,
        url: report.canonical_url,
        name: `${report.spot.name} Surf Report`,
        description: report.summary.text,
        dateModified: report.issued_at,
        mainEntity: { '@id': `${report.canonical_url}#dataset` },
        about: { '@id': `${report.canonical_url}#place` },
        isPartOf: { '@id': `${SITE}/#website` }
      },
      {
        '@type': 'Dataset',
        '@id': `${report.canonical_url}#dataset`,
        name: `${report.spot.name} current surf conditions`,
        description: report.summary.text,
        dateModified: report.issued_at,
        temporalCoverage: `${report.forecast_for}/${report.valid_until}`,
        spatialCoverage: { '@id': `${report.canonical_url}#place` },
        creator: { '@id': `${SITE}/#organization` },
        variableMeasured: measured,
        distribution: {
          '@type': 'DataDownload',
          encodingFormat: 'application/json',
          contentUrl: `${SITE}/api/surf-reports/${report.spot.id}.json`
        }
      },
      {
        '@type': 'Place',
        '@id': `${report.canonical_url}#place`,
        name: report.spot.name,
        address: {
          '@type': 'PostalAddress',
          addressRegion: 'South Australia',
          addressCountry: 'AU'
        }
      },
      {
        '@type': 'Organization',
        '@id': `${SITE}/#organization`,
        name: 'Frenchy Surf School',
        url: SCHOOL
      }
    ]
  };
}

function regionalise(base, config) {
  const report = structuredClone(base);
  report.spot = {
    ...report.spot,
    id: config.slug,
    name: config.name,
    calibration_scope: config.scope,
    regional_source_spot: 'Seaford'
  };
  report.canonical_url = `${SITE}/surf-report/${config.slug}`;
  report.summary = {
    ...report.summary,
    headline: `${config.name} regional surf outlook`,
    text: `${config.name} currently uses Frenchy's regional Adelaide Mid Coast report calibrated at Seaford. This is not a separate spot-specific ${config.name} calibration. ${report.summary.text}`
  };
  report.methodology_note = `Regional Mid Coast values from the Seaford-calibrated model; not a separate ${config.name} spot model.`;
  return report;
}

function unavailableReport(config, error) {
  const now = new Date();
  return {
    schema_version: 1,
    report_type: 'surf_report',
    provider: { name: 'Frenchy Surf School', url: SCHOOL },
    spot: {
      id: config.slug,
      name: config.name,
      region: config.engine === 'middleton' ? 'Fleurieu Peninsula / South Coast' : 'Adelaide Mid Coast',
      country: 'Australia',
      timezone: 'Australia/Adelaide',
      calibration_scope: config.scope
    },
    wave: null,
    swell: null,
    wind: null,
    tide: null,
    weather: null,
    summary: {
      headline: 'Live report temporarily unavailable',
      text: 'Current source data could not be verified. No old value is being presented as current.',
      best_window: null,
      wind_shift: null,
      tide_call: null
    },
    forecast_for: null,
    issued_at: now.toISOString(),
    valid_until: now.toISOString(),
    status: 'unavailable',
    calculation_version: null,
    methodology_url: `${SITE}/surf-report-data`,
    canonical_url: config.engine === 'middleton' && config.scope === 'spot-specific'
      ? `${SITE}/middleton.html`
      : config.engine === 'seaford' && config.scope === 'spot-specific'
        ? `${SITE}/`
        : `${SITE}/surf-report/${config.slug}`,
    booking_url: SCHOOL,
    warnings: [error?.message || String(error)]
  };
}

async function loadLocation(config, force = false) {
  try {
    const result = await getSurfReport(config.engine, { force });
    const canonical = config.scope === 'spot-specific'
      ? result.canonical
      : regionalise(result.canonical, config);
    return { ...result, canonical };
  } catch (error) {
    return { canonical: unavailableReport(config, error), hydration: null };
  }
}

function renderReportHtml(config, result) {
  const report = result.canonical;
  const fileName = config.engine === 'middleton' ? 'middleton.html' : 'index.html';
  let html = readProjectText(fileName);
  const regional = config.scope !== 'spot-specific';
  const display = report.wave?.display || 'Unavailable';
  const description = report.status === 'unavailable'
    ? `${config.name} surf report is temporarily unavailable; Frenchy Review is not presenting stale conditions as current.`
    : `${config.name} surf report: ${display} ft, ${report.wind?.label || 'wind unavailable'}, ${report.tide?.positionLabel || 'tide unavailable'}. Updated ${report.issued_at}.`;
  html = html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(config.name)} Surf Report | Frenchy Surf School</title>`)
    .replace(/<link rel="canonical" href="[^"]+"\s*\/?>/i, `<link rel="canonical" href="${report.canonical_url}" />`);
  html = replaceMeta(html, 'description', description);
  html = replaceMeta(html, 'frenchy:report-status', report.status);
  html = replaceMeta(html, 'frenchy:issued-at', report.issued_at);
  html = replaceMeta(html, 'frenchy:valid-until', report.valid_until);
  html = setElement(html, 'statusText', report.status === 'current' ? 'Current report' : report.status === 'expired' ? 'Report expired' : 'Report unavailable');
  html = setElement(html, 'mainSize', escapeHtml(display));
  html = setElement(html, 'viewingTimeLabel', report.forecast_for ? `Forecast for ${escapeHtml(report.forecast_for)}` : 'No current forecast time');
  html = setElement(html, 'dailyHeadline', escapeHtml(report.summary.headline));
  html = setElement(html, 'plainWhy', escapeHtml(report.summary.text));
  html = setElement(html, 'bestWindowStat', escapeHtml(report.summary.best_window || 'Unavailable'));
  html = setElement(html, 'windShiftStat', escapeHtml(report.summary.wind_shift || 'Unavailable'));
  html = setElement(html, 'tideCall', escapeHtml(report.summary.tide_call || 'Unavailable'));
  html = setElement(html, 'windMain', report.wind ? `${Math.round(report.wind.speed_kmh)} km/h` : 'Unavailable');
  html = setElement(html, 'windSub', report.wind ? `${escapeHtml(report.wind.direction_compass)} wind · ${Math.round(report.wind.direction_deg)}°` : 'No verified wind');
  html = setElement(
    html,
    'sourceRow',
    regional
      ? `<span><strong>Regional report:</strong> ${escapeHtml(config.name)} uses the Seaford-calibrated Mid Coast model. It is not a spot-specific estimate.</span>`
      : `<span>Calculated by Frenchy Review from current marine, wind and tide inputs.</span>`
  );
  html = setElement(
    html,
    'freshnessRow',
    `<span>Issued <time datetime="${escapeHtml(report.issued_at)}">${escapeHtml(report.issued_at)}</time></span> · <span>Valid until <time datetime="${escapeHtml(report.valid_until)}">${escapeHtml(report.valid_until)}</time></span> · <strong>Status: ${escapeHtml(report.status)}</strong>`
  );
  if (regional) {
    html = html
      .replace(/<h1>[\s\S]*?<\/h1>/i, `<h1>${escapeHtml(config.name)} Surf Report</h1>`)
      .replace(/Current Seaford size/g, `Regional ${escapeHtml(config.name)} outlook`)
      .replace(/Seaford Surf Report/g, `${escapeHtml(config.name)} Surf Report`);
  }
  const jsonLd = safeJson(reportJsonLd(report));
  const stateScript = safeJson(result.hydration);
  const injected = [
    `<script type="application/ld+json" id="currentSurfReportJsonLd">${jsonLd}</script>`,
    `<script>window.__FRENCHY_CANONICAL_REQUIRED__=true;window.__FRENCHY_SSR_STATE__=${stateScript};window.__FRENCHY_CANONICAL_REPORT__=${safeJson(report)};</script>`
  ].join('\n  ');
  return html.replace('</head>', `  ${injected}\n</head>`);
}

function indexJson(results) {
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    reports: results.map(result => ({
      spot: result.canonical.spot,
      wave: result.canonical.wave,
      status: result.canonical.status,
      issued_at: result.canonical.issued_at,
      valid_until: result.canonical.valid_until,
      canonical_url: result.canonical.canonical_url,
      json_url: `${SITE}/api/surf-reports/${result.canonical.spot.id}.json`
    }))
  };
}

function renderIndexHtml(results) {
  const data = indexJson(results);
  const cards = data.reports.map(item => `
    <article>
      <h2><a href="${item.canonical_url}">${escapeHtml(item.spot.name)}</a></h2>
      <p class="wave">${escapeHtml(item.wave?.display || 'Unavailable')} ft</p>
      <p>Status: <strong>${escapeHtml(item.status)}</strong></p>
      <p>${item.spot.calibration_scope === 'spot-specific' ? 'Spot-specific calibration.' : 'Regional Mid Coast report using the Seaford calibration; not a spot-specific estimate.'}</p>
      <a href="${item.json_url}">JSON data</a>
    </article>`).join('');
  return `<!doctype html>
<html lang="en-AU">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>South Australia Surf Reports | Frenchy Surf School</title>
  <meta name="description" content="Current Seaford, Adelaide Mid Coast and Middleton surf reports with wave size, swell, wind, tide, freshness and JSON data." />
  <link rel="canonical" href="${SITE}/surf-reports" />
  <style>
    body{margin:0;background:#061b24;color:#eefaff;font:16px/1.55 system-ui,sans-serif}.wrap{max-width:1050px;margin:auto;padding:28px}a{color:#77d8ff}header,article{background:#0b2b38;border:1px solid #1d5367;border-radius:20px;padding:24px;margin-bottom:18px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px}.wave{font-size:2.4rem;font-weight:900;margin:.2rem 0}.note{color:#b9d8e4}
  </style>
  <script type="application/ld+json">${safeJson({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Frenchy Surf Reports',
    url: `${SITE}/surf-reports`,
    hasPart: data.reports.map(item => ({ '@type': 'WebPage', url: item.canonical_url, name: `${item.spot.name} Surf Report` }))
  })}</script>
</head>
<body><main class="wrap"><header><h1>Frenchy Surf Reports</h1><p>Current, timestamped surf conditions for Seaford, the Adelaide Mid Coast and Middleton.</p><p class="note">South Port uses the regional Mid Coast report and is never presented as a separately calibrated spot forecast.</p></header><section class="grid">${cards}</section><p><a href="${SITE}/surf-report-data">How the data and freshness work</a> · <a href="${SCHOOL}">Frenchy Surf School</a></p></main></body>
</html>`;
}

async function loadIndex(force = false) {
  const configs = [
    LOCATION_MAP.seaford,
    LOCATION_MAP['mid-coast'],
    LOCATION_MAP['south-port'],
    LOCATION_MAP.middleton
  ];
  return Promise.all(configs.map(config => loadLocation(config, force)));
}

export async function handler(event) {
  const query = event.queryStringParameters || {};
  const format = query.format || (event.path?.endsWith('.json') ? 'json' : 'html');
  const slug = String(query.location || 'seaford').replace(/\.json$/i, '').toLowerCase();
  const force = query.refresh === '1';
  const isPrivateObservationRoute = /^\/observe(?:-|\/|$)/.test(event.path || '');
  const htmlHeaders = isPrivateObservationRoute
    ? {
        ...HTML_HEADERS,
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex, nofollow'
      }
    : HTML_HEADERS;
  if (slug === 'index') {
    const results = await loadIndex(force);
    return {
      statusCode: 200,
      headers: format === 'json' ? JSON_HEADERS : htmlHeaders,
      body: format === 'json' ? JSON.stringify(indexJson(results)) : renderIndexHtml(results)
    };
  }
  const config = LOCATION_MAP[slug];
  if (!config) {
    return {
      statusCode: 404,
      headers: format === 'json' ? JSON_HEADERS : htmlHeaders,
      body: format === 'json'
        ? JSON.stringify({ status: 'unavailable', error: 'Unknown surf-report location' })
        : '<!doctype html><title>Surf report not found</title><h1>Surf report not found</h1>'
    };
  }
  const result = await loadLocation(config, force);
  if (format === 'json') {
    const observation = query.at && result.hydration
      ? buildObservationSnapshot(config.engine, result, query.at)
      : null;
    const body = query.full === '1'
      ? { canonical: result.canonical, hydration: result.hydration, ...(query.at ? { observation } : {}) }
      : result.canonical;
    const headers = query.at
      ? { ...JSON_HEADERS, 'Cache-Control': 'private, no-store' }
      : JSON_HEADERS;
    return { statusCode: 200, headers, body: JSON.stringify(body) };
  }
  return { statusCode: 200, headers: htmlHeaders, body: renderReportHtml(config, result) };
}

export const __test = {
  LOCATION_MAP,
  indexJson,
  regionalise,
  renderIndexHtml,
  renderReportHtml,
  reportJsonLd,
  unavailableReport
};
