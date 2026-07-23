import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReportFromSource } from './report-runtime.mjs';

const require = createRequire(import.meta.url);
const { handler: seafordSourceHandler } = require('../functions/seaford-data.js');
const { handler: middletonSourceHandler } = require('../functions/middleton-data.js');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE_CACHE_MS = 4 * 60 * 1000;
const STALE_LIMIT_MS = 60 * 60 * 1000;
const cache = new Map();

function tideData(location) {
  const fileName = location === 'middleton'
    ? 'victor_harbor_2026_tides.json'
    : 'port_noarlunga_2026_tides.json';
  return JSON.parse(readFileSync(resolve(ROOT, fileName), 'utf8'));
}

async function freshSource(location) {
  const response = await (location === 'middleton' ? middletonSourceHandler() : seafordSourceHandler());
  const body = JSON.parse(response.body || '{}');
  if (response.statusCode !== 200 || !body.ok) {
    throw new Error(body.error || `${location} source returned ${response.statusCode}`);
  }
  return body;
}

async function loadSource(location, force = false) {
  const now = Date.now();
  const existing = cache.get(location);
  if (!force && existing?.value && now - existing.savedAt <= SOURCE_CACHE_MS) return existing.value;
  if (!force && existing?.promise) return existing.promise;
  const promise = freshSource(location)
    .then(value => {
      cache.set(location, { value, savedAt: Date.now(), promise: null });
      return value;
    })
    .catch(error => {
      if (existing?.value && now - existing.savedAt <= STALE_LIMIT_MS) {
        const stale = {
          ...existing.value,
          staleDataUsed: true,
          warnings: [
            ...(existing.value.warnings || []),
            `Live refresh failed; using the last server result: ${error.message}`
          ]
        };
        cache.set(location, { value: existing.value, savedAt: existing.savedAt, promise: null });
        return stale;
      }
      cache.delete(location);
      throw error;
    });
  cache.set(location, { ...(existing || {}), promise });
  return promise;
}

export async function getSurfReport(location, options = {}) {
  if (!['seaford', 'middleton'].includes(location)) {
    throw new Error(`Unsupported calibrated location: ${location}`);
  }
  const source = await loadSource(location, Boolean(options.force));
  return buildReportFromSource(location, source, tideData(location), {
    now: options.now || new Date()
  });
}

export function clearReportSourceCache() {
  cache.clear();
}
