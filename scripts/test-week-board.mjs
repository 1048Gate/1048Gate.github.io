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
assert.equal(board.marginCopy({state:'live', away:{score:10}, home:{score:10}}), 'Tied');
assert.equal(board.statusLabel('live'), 'Live');
assert.equal(board.statusLabel('final'), 'Final');
assert.equal(board.statusLabel('scheduled'), 'Upcoming');

const liveCard = board.matchupCardHtml(live, esc);
assert.match(liveCard, /class="week-game week-card is-live"/);
assert.match(liveCard, /Ahead by 7.5/);
assert.match(liveCard, /is-home is-leading/);
assert.match(liveCard, /McConkey Tonk Badonkadonk/);

const upcomingCard = board.matchupCardHtml({state:'scheduled', away:{team:'A', owner:'A', score:null}, home:{team:'B', owner:'B', score:null}}, esc);
assert.match(upcomingCard, /is-scheduled/);
assert.match(upcomingCard, /week-card-badge">Upcoming</);
assert.match(upcomingCard, /<b>—<\/b>/);

const standings = [
  {team:'Team Hash', owner:'Trevor Hash', wins:1, losses:0, ties:0, pointsFor:192.56},
  {team:'A', owner:'A', wins:1, losses:0, pointsFor:1},
  {team:'B', owner:'B', wins:1, losses:0, pointsFor:1},
  {team:'C', owner:'C', wins:1, losses:0, pointsFor:1},
  {team:'D', owner:'D', wins:1, losses:0, pointsFor:1},
  {team:'Ice Has Me Running Back', owner:'German Haro', wins:1, losses:0, pointsFor:104.2},
  {team:'Bubble', owner:'Out', wins:0, losses:1, pointsFor:90}
];
const snapshot = board.standingsSnapshotHtml(standings, 'Week 2 in progress.', esc);
assert.match(snapshot, /class="is-playoff-line"/);
assert.match(snapshot, /Top 6 in the playoff picture/);
assert.equal((snapshot.match(/<tr/g) || []).length, 8);

const siteUi = readFileSync(new URL('../js/site-ui.js', import.meta.url), 'utf8');
assert.match(siteUi, /gateWeekBoard/);
assert.match(siteUi, /js\/week-board\.js/);

console.log('This Week board: six cards, live/final/upcoming states, margins, and standings snapshot checks passed.');
