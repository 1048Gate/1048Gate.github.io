import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const context = {window:{}, console, Intl};
runInNewContext(readFileSync(new URL('../js/reference-desk.js', import.meta.url), 'utf8'), context, {filename:'js/reference-desk.js'});
const desk = context.window.gateReferenceDesk;
assert.ok(desk, 'gateReferenceDesk must publish');

const site = JSON.parse(readFileSync(new URL('../data/site.json', import.meta.url), 'utf8'));
const board = JSON.parse(readFileSync(new URL('../data/homepage-week.json', import.meta.url), 'utf8'));
const seasons = JSON.parse(readFileSync(new URL('../data/seasons.json', import.meta.url), 'utf8'));
const matchups = JSON.parse(readFileSync(new URL('../data/matchups.json', import.meta.url), 'utf8'));
const streaks = JSON.parse(readFileSync(new URL('../data/streaks.json', import.meta.url), 'utf8'));
const table = desk.sortStandings(board.standings);

assert.equal(desk.impliedProbability('+300'), 0.25);
assert.equal(desk.impliedProbability('-150'), 0.6);
assert.equal(desk.impliedProbability('nope'), null);
assert.match(desk.weekNote(board), /Week 3/);
assert.match(desk.standingsNote(table), /Bryan Hunt|points for/);
assert.equal(desk.standingsRows(table).length, 12);
assert.equal(desk.standingsRows(table)[0].owner, table[0].owner);
assert.equal(desk.standingsRows(table)[5].cut, true);

const race = desk.playoffRace(table);
assert.equal(race.rows.length, 12);
assert.equal(race.rows[5].seed, 6);
assert.equal(race.rows[5].inField, true);
assert.equal(race.rows[6].inField, false);
assert.match(race.note, /No\. 6/);

const blocks = desk.leaders(table, matchups, board, site.seasonYear);
assert.ok(blocks.length >= 3);
assert.ok(blocks.every(block => block.rows.length && block.title));

const notes = desk.historyNotes({seasons, archive:matchups, streaks, config:site, table});
assert.ok(notes.length >= 4);
assert.ok(notes.some(note => /Defending champion/.test(note)));
assert.ok(notes.some(note => /235\.64/.test(note)));
assert.ok(!notes.some(note => /undefined/.test(note)));

const odds = desk.oddsNote(site, table, board);
assert.match(odds, /Thomas Speer/);
assert.match(odds, /\+300/);
assert.ok(!/current championship favorite/i.test(odds));

assert.deepEqual(desk.transactionRows([]), []);
assert.equal(desk.transactionRows([{
  transaction_type:'WAIVER', team_name:'Team Hash', scoring_period:3,
  transaction_date_ms:Date.parse('2026-09-20T16:00:00-04:00'),
  items:[{item_type:'ADD', player_name:'Example Player', to_team_name:'Team Hash'}]
}])[0].type, 'Waiver');

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
for(const id of ['deskStandings','deskLeaders','deskPlayoff','deskTransactions','deskHistory','championshipOdds','weekBoard']){
  assert.ok(html.includes(`id="${id}"`), `homepage missing #${id}`);
}
assert.ok(html.includes('js/reference-desk.js'));
assert.ok(html.includes('data-home-lede'));
assert.ok(!/The current championship favorite/.test(html));

console.log('Reference desk checks passed: odds math, standings/race/leaders/history notes, dry copy, and homepage hooks.');
