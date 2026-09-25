import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildHomepageWeek, loadPulseApi, statusFor} from './build-homepage-week.mjs';

const pulseApi = loadPulseApi(readFileSync(new URL('../js/league-pulse.js', import.meta.url), 'utf8'));
const site = JSON.parse(readFileSync(new URL('../data/site.json', import.meta.url), 'utf8'));
const week = JSON.parse(readFileSync(new URL('../data/current-season.json', import.meta.url), 'utf8'));
const index = JSON.parse(readFileSync(new URL('../data/newspaper_editions/index.json', import.meta.url), 'utf8'));
const archive = JSON.parse(readFileSync(new URL('../data/matchups.json', import.meta.url), 'utf8'));
const committed = JSON.parse(readFileSync(new URL('../data/homepage-week.json', import.meta.url), 'utf8'));

const live = buildHomepageWeek({site, week, index, archive, pulseApi, builtAt:'2026-09-21T18:00:00.000Z'});
assert.equal(live.schemaVersion, 1);
assert.equal(live.season, week.season);
assert.equal(live.week, week.week);
assert.equal(live.phase, week.phase);
assert.equal(live.status, statusFor(site, week));
assert.equal(live.matchups.length, 6);
assert.equal(live.standings.length, 12);
assert.ok(live.featured_story?.headline);
assert.ok(live.featured_story.week <= week.week);
if(statusFor(site, week) !== 'scheduled') assert.equal(live.featured_story.week, week.week);
assert.ok(live.championship_odds?.favorite?.odds);
assert.ok(live.league_pulse.length >= 5);
assert.deepEqual(live.freshness.sources[0], 'data/current-season.json');

assert.equal(committed.season, live.season);
assert.equal(committed.week, live.week);
assert.equal(committed.phase, live.phase);
assert.equal(committed.matchups.length, live.matchups.length);
assert.equal(committed.league_pulse.length, live.league_pulse.length);
assert.equal(committed.featured_story.headline, live.featured_story.headline);

const offseason = buildHomepageWeek({
  site:{...site, phase:'Offseason'},
  week:{...week, phase:'Offseason'},
  index,
  archive,
  pulseApi,
  builtAt:'2026-09-21T18:00:00.000Z'
});
assert.equal(offseason.status, 'offseason');
assert.ok(offseason.league_pulse.every(card => !['playoff','matchup'].includes(card.id)));

const finals = week.matchups.map(game => ({...game, state:'final'}));
assert.equal(statusFor(site, {...week, matchups:finals}), 'final');

const scheduled = week.matchups.map(game => ({...game, state:'scheduled'}));
assert.equal(statusFor(site, {...week, matchups:scheduled}), 'scheduled');

const inProgress = week.matchups.map((game, index) => ({...game, state: index === 0 ? 'live' : 'scheduled'}));
assert.equal(statusFor(site, {...week, matchups:inProgress}), 'live');

const mixedFinal = week.matchups.map((game, index) => ({...game, state: index === 0 ? 'final' : 'scheduled'}));
assert.equal(statusFor(site, {...week, matchups:mixedFinal}), 'scheduled');

assert.ok(['scheduled','live','final'].includes(statusFor(site, week)));

console.log('Homepage week payload checks passed: current snapshot, prior-edition fallback, committed file, offseason pulse, live, and final status.');
