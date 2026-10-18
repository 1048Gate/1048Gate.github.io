import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderStaticWeekBoard, renderStaticOddsCard, STATIC_ODDS_CARD_PATTERN, renderStaticPulse, applyHeroFreshness, heroLede, PULSE_RAIL_PATTERN} from './build-static-week-board.mjs';
import {loadPulseApi} from './build-homepage-week.mjs';

const board = JSON.parse(readFileSync(new URL('../data/current-season.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const rendered = renderStaticWeekBoard(board);

assert.match(rendered, new RegExp(`aria-label="${board.phase} matchups and standings"`));
assert.match(rendered,/id="refreshScores"/,'The normal score publishing renderer must preserve the refresh control.');
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

// Every League Pulse card and the hero chips must be rendered from the same payload as the board,
// so raw HTML (crawlers, link previews, no-JS) never shows an older week.
const pulseApi = loadPulseApi(readFileSync(new URL('../js/league-pulse.js', import.meta.url), 'utf8'));
const pulseHtml = renderStaticPulse(homepage, pulseApi);
assert.equal((pulseHtml.match(/<article /g) || []).length, homepage.league_pulse.length, 'one static article per payload pulse card');
const rail = html.match(PULSE_RAIL_PATTERN);
assert.ok(rail, 'index.html must contain the League Pulse rail.');
assert.ok(rail[0].includes(pulseHtml), 'index.html League Pulse rail must match data/homepage-week.json. Run: npm run homepage-static');
assert.equal(renderStaticPulse({league_pulse:[]}, pulseApi), null);

const phase = homepage.phase || `Week ${homepage.week}`;
const chips = [...html.matchAll(/data-site-phase>([^<]*)</g)].map(match => match[1]);
assert.ok(chips.length >= 2 && chips.every(chip => chip === phase), `every data-site-phase chip must read "${phase}". Run: npm run homepage-static`);
assert.ok(html.includes(`data-site-season>${homepage.season} SEASON · ${phase.toUpperCase()}<`), 'season chip must match the payload week.');
assert.ok(html.includes(`data-home-lede>${heroLede(homepage.matchups)}<`), 'hero lede must match the payload game states.');

const fixture = '<span data-site-phase>Week 2</span><span data-site-season>2026 SEASON · WEEK 2</span><span data-site-season-label>Season 10</span><span data-site-season-number>10</span><p data-home-lede>6 of 6 games live.</p>';
const refreshed = applyHeroFreshness(fixture, {season:2026, week:7, phase:'Week 7', matchups:[{state:'final'},{state:'final'},{state:'live'}]});
assert.match(refreshed, /data-site-phase>Week 7</);
assert.match(refreshed, /data-site-season>2026 SEASON · WEEK 7</);
assert.match(refreshed, /data-site-season-label>Season 10</, 'season label hook must be left alone');
assert.match(refreshed, /data-site-season-number>10</, 'season number hook must be left alone');
assert.match(refreshed, /data-home-lede>1 live · 2 final\.</);
assert.equal(applyHeroFreshness(refreshed, {season:2026, week:7, phase:'Week 7', matchups:[{state:'final'},{state:'final'},{state:'live'}]}), refreshed, 'hero refresh must be idempotent');
assert.equal(heroLede([]), '');
assert.equal(heroLede([{state:'scheduled'},{state:'scheduled'}]), '2 upcoming.');
assert.equal(heroLede([{state:'final'}]), '1 final.');

console.log('Static homepage board, League Pulse, hero chips, and odds card match the current verified payloads.');
