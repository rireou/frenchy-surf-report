import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readProjectJson, readProjectText } from '../netlify/lib/project-files.mjs';
import seafordSource from '../netlify/functions/seaford-data.js';
import middletonSource from '../netlify/functions/middleton-data.js';
import { __test as surfReportTest } from '../netlify/functions/surf-report.mjs';

test('Netlify bundle dependencies resolve without createRequire or source-relative asset paths', () => {
  assert.equal(typeof seafordSource.handler, 'function');
  assert.equal(typeof middletonSource.handler, 'function');
  assert.match(readProjectText('index.html'), /Seaford Surf Report/i);
  assert.match(readProjectText('middleton.html'), /Middleton Surf Report/i);
  assert.equal(typeof readProjectJson('port_noarlunga_2026_tides.json'), 'object');
  assert.equal(typeof readProjectJson('victor_harbor_2026_tides.json'), 'object');
});

test('Netlify runtime path resolution does not depend on import.meta.url', () => {
  const source = readFileSync('netlify/lib/project-files.mjs', 'utf8');
  assert.doesNotMatch(source, /import\.meta|fileURLToPath/);
  assert.match(source, /LAMBDA_TASK_ROOT/);
  assert.match(source, /process\.cwd\(\)/);
});

test('public report paths cannot silently fall back from Middleton to Seaford', () => {
  assert.equal(
    surfReportTest.resolveLocation({
      path: '/api/surf-reports/middleton.json',
      rawUrl: 'https://frenchyreview.netlify.app/api/surf-reports/middleton.json',
      queryStringParameters: {}
    }),
    'middleton'
  );
  assert.equal(
    surfReportTest.resolveLocation({
      path: '/observe-middleton',
      queryStringParameters: {}
    }),
    'middleton'
  );
  assert.equal(
    surfReportTest.resolveLocation({
      path: '/api/surf-reports/seaford.json',
      queryStringParameters: {}
    }),
    'seaford'
  );
  assert.equal(
    surfReportTest.resolveLocation({
      path: '/api/surf-reports/middleton.json',
      queryStringParameters: { location: 'seaford' }
    }),
    'seaford'
  );
});
