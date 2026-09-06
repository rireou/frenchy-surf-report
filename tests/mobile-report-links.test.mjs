import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('both spot shells have mobile-only camera and coaching quick links',()=>{
 const ui=readFileSync('frenchy-ui-v6.js','utf8'),css=readFileSync('phase1.css','utf8');
 assert.ok(ui.includes('hero.querySelector(\'div\')?.prepend(mobileLinks)'));
 assert.ok(ui.includes('>Live cam</a>'));
 assert.ok(ui.includes('https://frenchysurfschool.square.site/'));
 assert.ok(ui.includes('goolwa-beach-algal-bloom-web-camera'));
 assert.ok(ui.includes('south-port-beach-algal-bloom-web-camera'));
 assert.ok(css.includes('.mobile-report-links { display: none; }'));
 assert.ok(css.includes('@media(max-width: 800px)'));
 assert.ok(css.includes('.mobile-report-links { display: flex;'));
});
