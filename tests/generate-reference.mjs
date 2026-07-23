import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildReportFromSource, fixtureProjection } from '../netlify/lib/report-runtime.mjs';

for (const location of ['seaford', 'middleton']) {
  const input = JSON.parse(readFileSync(resolve(`tests/fixtures/${location}-input.json`), 'utf8'));
  const result = buildReportFromSource(location, input.source, input.tides, { now: new Date(input.now) });
  process.stdout.write(`--- ${location} ---\n${JSON.stringify(fixtureProjection(result), null, 2)}\n`);
}
