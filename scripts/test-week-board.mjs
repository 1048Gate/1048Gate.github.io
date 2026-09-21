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
const final = {
  state:'final',
  away:{team:'Team Hash', owner:'Trevor Hash', score:192.56},
  home:{team:"Howya Been's", owner:'Bryan Hunt', score:158.3}
};
const upcoming = {
  state:'scheduled',
  away:{team:'The Buwhops', owner:'Brian Heino', score:null},
  home:{team:'Your Reigning Champ', owner:'Thomas Speer', score:null}
};

assert.equal(board.leaderSide(live), 'home');
assert.equal(board.pointsLine(board.marginFor(live)), '7.5');
assert.equal(board.marginCopy(live), 'Ahead by 7.5');
assert.equal(board.marginCopy(final), 'Won by 34.3');
assert.equal(board.marginCopy({state:'live', away:{score:10}, home:{score:10}}), 'Tied');
assert.equal(board.statusLabel('live'), 'Live');
assert.equal(board.statusLabel('final'), 'Final');
assert.equal(board.statusLabel('scheduled'), 'Upcoming');

const liveCard = board.matchupCardHtml(live, esc);
assert.match(liveCard, /class="week-game week-card is-live"/);
assert.match(liveCard, /week-card-badge">Live</);
assert.match(liveCard, /Ahead by 7.5/);
assert.match(liveCard, /is-home is-leading/);
assert.match(liveCard, /is-away is-trailing/);
assert.match(liveCard, /McConkey Tonk Badonkadonk/);
assert.match(liveCard, /Vincent Cannarozzi/);
assert.match(liveCard, /week-game-vs">live</);
assert.match(liveCard, /<b>99<\/b>/);
assert.match(liveCard, /<b>91.5<\/b>/);

const finalCard = board.matchupCardHtml(final, esc);
assert.match(finalCard, /is-final/);
assert.match(finalCard, /week-card-badge">Final</);
assert.match(finalCard, /Won by 34.3/);

const upcomingCard = board.matchupCardHtml(upcoming, esc);
assert.match(upcomingCard, /is-scheduled/);
assert.match(upcomingCard, /week-card-badge">Upcoming</);
assert.match(upcomingCard, /week-game-vs">at</);
assert.match(upcomingCard, /<b>—<\/b>/);

const standings = [
  {team:'Team Hash', owner:'Trevor Hash', wins:1, losses:0, ties:0, pointsFor:192.56},
  {team:"Howya Been's", owner:'Bryan Hunt', wins:1, losses:0, ties:0, pointsFor:158.3},
  {team:'A', owner:'A', wins:1, losses:0, pointsFor:1},
  {team:'B', owner:'B', wins:1, losses:0, pointsFor:1},
  {team:'C', owner:'C', wins:1, losses:0, pointsFor:1},
  {team:'Ice Has Me Running Back', owner:'German Haro', wins:1, losses:0, pointsFor:104.2},
  {team:'Bubble', owner:'Out', wins:0, losses:1, pointsFor:90}
];
const snapshot = board.standingsSnapshotHtml(standings, 'Week 2 in progress. Live scoring from ESPN.', esc);
assert.match(snapshot, /<th>#<\/th><th>Team<\/th><th>Mgr<\/th><th>Rec<\/th><th>PF<\/th>/);
assert.match(snapshot, /week-standings-rank">1</);
assert.match(snapshot, /class="is-playoff-line"/);
assert.match(snapshot, /week-standings-rank">6</);
assert.match(snapshot, /Top 6 in the playoff picture/);
assert.match(snapshot, /Swipe standings/);
assert.equal((snapshot.match(/<tr/g) || []).length, 8);

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(html, /js\/week-board\.js/);
assert.match(html, /data-week-matchups/);
assert.match(html, /data-week-standings/);

console.log('This Week board: six cards, live/final/upcoming states, margins, and standings snapshot checks passed.');
