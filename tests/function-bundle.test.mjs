import test from 'node:test';
import assert from 'node:assert/strict';
import { readProjectJson, readProjectText } from '../netlify/lib/project-files.mjs';
import seafordSource from '../netlify/functions/seaford-data.js';
import middletonSource from '../netlify/functions/middleton-data.js';

test('Netlify bundle dependencies resolve without createRequire or source-relative asset paths', () => {
  assert.equal(typeof seafordSource.handler, 'function');
  assert.equal(typeof middletonSource.handler, 'function');
  assert.match(readProjectText('index.html'), /Seaford Surf Report/i);
  assert.match(readProjectText('middleton.html'), /Middleton Surf Report/i);
  assert.equal(typeof readProjectJson('port_noarlunga_2026_tides.json'), 'object');
  assert.equal(typeof readProjectJson('victor_harbor_2026_tides.json'), 'object');
});
