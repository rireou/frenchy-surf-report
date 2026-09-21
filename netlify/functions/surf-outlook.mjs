import { getSurfReport } from '../lib/report-source.mjs';
import { buildOutlook } from '../lib/outlook.mjs';
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=60, s-maxage=300', 'X-Content-Type-Options': 'nosniff' };
export async function handler(event) {
  if (event.httpMethod && event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'GET required' }) };
  const location = event.queryStringParameters?.location || 'seaford';
  if (!['seaford', 'middleton'].includes(location)) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Unknown location' }) };
  try {
    const result = await getSurfReport(location);
    return { statusCode: 200, headers, body: JSON.stringify(buildOutlook(location, result)) };
  } catch {
    return { statusCode: 503, headers: { ...headers, 'Cache-Control': 'no-store' }, body: JSON.stringify({ status: 'unavailable', error: 'Forecast temporarily unavailable' }) };
  }
}
