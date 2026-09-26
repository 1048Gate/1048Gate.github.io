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
assert.equal(board.statusLabel('scheduled'), 'Upcoming');
assert.equal(board.marginCopy({state:'scheduled', away:{score:0}, home:{score:0}}), '');
assert.equal(board.marginCopy({state:'live', away:{score:10}, home:{score:10}}), 'Tied');

const liveHtml = board.matchupCardHtml(live, esc);
assert.match(liveHtml, /week-card is-live/);
assert.match(liveHtml, /Ahead by 7.5/);

const finalHtml = board.matchupCardHtml({
  state:'final',
  away:{team:'A', owner:'A', score:192.56},
  home:{team:'B', owner:'B', score:158.3}
}, esc);
assert.match(finalHtml, /week-card is-final/);
assert.match(finalHtml, />Final</);
assert.match(finalHtml, /Won by 34.3/);

const upcomingHtml = board.matchupCardHtml({
  state:'scheduled',
  away:{team:'A', owner:'A', score:0},
  home:{team:'B', owner:'B', score:0}
}, esc);
assert.match(upcomingHtml, /week-card is-scheduled/);
assert.match(upcomingHtml, />Upcoming</);
assert.doesNotMatch(upcomingHtml, /Ahead by|Won by|Tied/);
assert.match(board.standingsSnapshotHtml([
  {team:'A', owner:'A', wins:1, losses:0, pointsFor:10},
  {team:'B', owner:'B', wins:1, losses:0, pointsFor:9},
  {team:'C', owner:'C', wins:1, losses:0, pointsFor:8},
  {team:'D', owner:'D', wins:1, losses:0, pointsFor:7},
  {team:'E', owner:'E', wins:1, losses:0, pointsFor:6},
  {team:'F', owner:'F', wins:1, losses:0, pointsFor:5},
  {team:'G', owner:'G', wins:0, losses:1, pointsFor:4}
], 'Live scoring from ESPN.', esc), /is-playoff-line/);
const standingsHtml = board.standingsSnapshotHtml([{team:'Team A', owner:'Manager A', wins:1, losses:0, pointsFor:10}], '', esc);
assert.match(standingsHtml, /class="week-standings-team"/);
assert.match(standingsHtml, /<small>Manager A<\/small>/);
assert.match(standingsHtml, /class="week-standings-manager"/);
assert.match(readFileSync(new URL('../js/site-ui.js', import.meta.url), 'utf8'), /gateWeekBoard/);
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(indexHtml, /js\/week-board\.js/);
assert.equal((indexHtml.match(/class="week-game week-card is-(?:live|final|scheduled)"/g) || []).length, 6, 'static fallback must include six Phase 3 matchup cards');
assert.match(indexHtml, /week-standings-rank/);
assert.match(indexHtml, /class="is-playoff-line"/);
assert.match(indexHtml, /Standings · team, record, points/);
assert.doesNotMatch(readFileSync(new URL('../js/home-layout.js', import.meta.url), 'utf8'), /createElement\('script'\)/);
console.log('This Week board: six cards, live/final/upcoming states, margins, and standings snapshot checks passed.');
