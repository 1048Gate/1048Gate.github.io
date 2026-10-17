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
const noteBoard = JSON.parse(JSON.stringify(board));
noteBoard.matchups[0].state = 'live';
noteBoard.matchups[0].away.score = 10;
noteBoard.matchups[0].home.score = 5;
assert.match(desk.weekNote(noteBoard), new RegExp(`Week ${board.week}`));
assert.match(desk.standingsNote(table), /Bryan Hunt|points for/);
assert.equal(desk.standingsRows(table).length, 12);
assert.equal(desk.standingsRows(table)[0].owner, table[0].owner);
assert.equal(desk.standingsRows(table)[5].cut, true);

assert.equal(desk.REGULAR_SEASON_GAMES, 14);
assert.equal(desk.gamesRemaining({wins:2, losses:0, ties:0}), 12);
assert.equal(desk.gamesRemaining({wins:9, losses:5, ties:0}), 0);
assert.equal(desk.standingsRows(table)[0].gr, 14 - desk.completedWeeks(table));
const race = desk.playoffRace(table);
assert.ok(race.rows.every(row => row.gr === 14 - (row.record.split('-').map(Number).reduce((a, b) => a + b, 0))));
assert.ok(!/\bbye/i.test(race.note));
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
// The favorite comes from the checked-in board (priced from the season simulation).
assert.ok(odds.includes(site.futures[0].name), 'Odds note must name the board favorite.');
assert.ok(odds.includes(site.futures[0].odds), 'Odds note must quote the favorite price.');
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

// The independent homepage transaction table must wait for season settings too.
const events={},rpcRequests=[],txBody={innerHTML:''},txStatus={textContent:''};
const domContext={window:{addEventListener:(name,fn)=>{events[name]=fn;}},
  document:{getElementById:()=>null,addEventListener:(name,fn)=>{if(name==='gate:site-ready')events[name]=fn;},
    querySelector:selector=>selector==='[data-desk-body="transactions"]'?txBody:selector==='[data-desk-status="transactions"]'?txStatus:null},
  setTimeout(){},fetch:async()=>({ok:false}),console:{warn(){}}};
domContext.window.gateSupabase={rpc:(name,args)=>new Promise(resolve=>rpcRequests.push({args,resolve}))};
runInNewContext(readFileSync(new URL('../js/shared.js',import.meta.url),'utf8'),domContext);
runInNewContext(readFileSync(new URL('../js/reference-desk.js',import.meta.url),'utf8'),domContext);
assert.equal(rpcRequests.length,0,'No silent all-season homepage request before configuration');
domContext.window.gateSiteConfig={seasonYear:2024};events['gate:site-ready']();
domContext.window.gateSiteConfig={seasonYear:2025};events['gate:site-ready']();
assert.deepEqual(rpcRequests.map(row=>row.args.p_season_year),[2024,2025]);
rpcRequests[1].resolve({data:{items:[]}});await new Promise(setImmediate);
assert.match(txBody.innerHTML,/2025/);
rpcRequests[0].resolve({data:{items:[{season_year:2024,team_name:'Obsolete'}]}});await new Promise(setImmediate);
assert.doesNotMatch(txBody.innerHTML,/Obsolete/);

console.log('Reference desk checks passed: odds math, standings/race/leaders/history notes, dry copy, and homepage hooks.');
