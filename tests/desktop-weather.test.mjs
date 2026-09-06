import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('desktop weather replaces sidebar and follows current weather panel',()=>{
 const ui=readFileSync('frenchy-ui-v6.js','utf8'),css=readFileSync('phase1.css','utf8');
 assert.ok(ui.includes('#weatherPanel .weather-now .weather-icon'));
 assert.ok(ui.includes('new MutationObserver(syncWeatherEmoji)'));
 assert.ok(ui.includes('weatherEmoji.hidden=!icon'));
 assert.ok(ui.includes('hero.prepend(weatherEmoji)'));
 assert.ok(css.includes('font-size: 58px'));
 assert.ok(!ui.includes("if(!isMiddleton){"));
 assert.ok(ui.includes("querySelector('.compact-weather-temp').textContent=temp"));
 assert.ok(css.includes('.desktop-weather-emoji.compact-weather:not([hidden])'));
 assert.ok(css.includes('.hero-card::before { display: inline-block;'));
 assert.ok(css.includes('@media(min-width: 801px)'));
 assert.ok(css.includes('.decision-layout > .aside-stack { display: none; }'));
});
