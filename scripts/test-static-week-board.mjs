import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderStaticWeekBoard, renderStaticOddsCard, STATIC_ODDS_CARD_PATTERN} from './build-static-week-board.mjs';

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
const savedProjections = structuredClone(board);
savedProjections.projectionsStale = true;
savedProjections.matchups.forEach(game => {game.state='scheduled';});
assert.match(renderStaticWeekBoard(savedProjections), /Saved ESPN projections · stale/);
assert.throws(() => renderStaticWeekBoard({...board, matchups:board.matchups.slice(0, 5)}), /requires 6 matchups and 12 standings rows/);

const homepage = JSON.parse(readFileSync(new URL('../data/homepage-week.json', import.meta.url), 'utf8'));
const oddsCard = renderStaticOddsCard(homepage);
assert.ok(oddsCard, 'data/homepage-week.json must carry a League Pulse odds card.');
assert.equal(html.match(STATIC_ODDS_CARD_PATTERN)?.[0], oddsCard, 'index.html static odds card must match data/homepage-week.json.');
assert.equal(renderStaticOddsCard({league_pulse:[]}), null);
assert.match(renderStaticOddsCard({league_pulse:[{id:'odds',title:'A <b> +400',detail:'Enters Week 9.'}]}), /A &lt;b&gt; \+400/);

console.log('Static homepage week board and odds card match the current verified payloads.');
