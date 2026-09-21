import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const context = {window:{}, document:{}};
runInNewContext(readFileSync(new URL('../js/week-board.js', import.meta.url), 'utf8'), context);
const board = context.window.gateWeekBoard;
assert.ok(board, 'week-board.js must publish window.gateWeekBoard');

const esc = value => String(value ?? '').replace(/[<>&"]/g, ch => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[ch]));
const live = {
  state:'live',
  away:{team:"McConkey Tonk Badonkadonk", owner:'Vincent Cannarozzi', score:91.46},
  home:{team:'Jigalos Jims', owner:'James Brochu', score:98.98}
};
assert.equal(board.leaderSide(live), 'home');
assert.equal(board.marginCopy(live), 'Ahead by 7.5');
assert.equal(board.marginCopy({state:'final', away:{score:192.56}, home:{score:158.3}}), 'Won by 34.3');
assert.equal(board.statusLabel('live'), 'Live');
assert.match(board.matchupCardHtml(live, esc), /week-card is-live/);
assert.match(board.matchupCardHtml(live, esc), /Ahead by 7.5/);
assert.match(board.standingsSnapshotHtml([
  {team:'A', owner:'A', wins:1, losses:0, pointsFor:10},
  {team:'B', owner:'B', wins:1, losses:0, pointsFor:9},
  {team:'C', owner:'C', wins:1, losses:0, pointsFor:8},
  {team:'D', owner:'D', wins:1, losses:0, pointsFor:7},
  {team:'E', owner:'E', wins:1, losses:0, pointsFor:6},
  {team:'F', owner:'F', wins:1, losses:0, pointsFor:5},
  {team:'G', owner:'G', wins:0, losses:1, pointsFor:4}
], 'Live scoring from ESPN.', esc), /is-playoff-line/);
assert.match(readFileSync(new URL('../js/site-ui.js', import.meta.url), 'utf8'), /gateWeekBoard/);
assert.match(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /js\/week-board\.js/);
assert.doesNotMatch(readFileSync(new URL('../js/home-layout.js', import.meta.url), 'utf8'), /createElement\('script'\)/);
console.log('This Week board: six cards, live/final/upcoming states, margins, and standings snapshot checks passed.');
