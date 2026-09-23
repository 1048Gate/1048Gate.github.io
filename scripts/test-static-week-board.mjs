import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderStaticWeekBoard} from './build-static-week-board.mjs';

const board = JSON.parse(readFileSync(new URL('../data/current-season.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const rendered = renderStaticWeekBoard(board);

assert.match(rendered, new RegExp(`aria-label="${board.phase} matchups and standings"`));
assert.equal((rendered.match(/class="week-game week-card is-/g) || []).length, 6);
assert.equal((rendered.match(/class="week-standings-rank"/g) || []).length, 12);
assert.ok(html.includes(rendered), 'index.html static week board must match data/current-season.json.');
const rollover = renderStaticWeekBoard({...board, week:3, phase:'Week 3'});
assert.match(rollover, /data-week="3"/);
assert.match(rollover, /aria-label="Week 3 matchups and standings"/);
assert.throws(() => renderStaticWeekBoard({...board, matchups:board.matchups.slice(0, 5)}), /requires 6 matchups and 12 standings rows/);

console.log('Static homepage week board matches the current verified season payload.');
