import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const root = new URL('../', import.meta.url);
const readJson = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const historical = readJson('data/newspaper_editions/historical_archive.json');
const weeklyIndex = readJson('data/newspaper_editions/index.json');
const seasons = readJson('data/seasons.json');
const playoffs = readJson('data/playoffs.json');
const matchups = readJson('data/matchups.json');
const managerProfiles = readJson('data/manager-profiles.json');
const appSource = readFileSync(new URL('js/app.js', root), 'utf8');

assert.equal(historical.season_start, 2017);
assert.equal(historical.season_end, 2025);
assert.equal(historical.edition_year, 2025);
assert.equal(historical.stories.length, 9, 'Historical newspaper must contain one story for every completed season.');
assert.deepEqual(
  historical.stories.map(story => story.season),
  [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017]
);
assert.ok(historical.stories.every(story => story.story_type === 'season_recap'));
assert.deepEqual(weeklyIndex.historical, {
  path:'data/newspaper_editions/historical_archive.json',
  season_start:2017,
  season_end:2025,
  mode:'historical'
});
assert.ok(Array.isArray(weeklyIndex.editions), 'The weekly newspaper index must contain an editions array.');
const indexedWeeks = new Set();
for(const entry of weeklyIndex.editions){
  const key = `${entry.season}:${entry.week}`;
  assert.ok(!indexedWeeks.has(key), `The weekly newspaper index contains duplicate ${key} entries.`);
  indexedWeeks.add(key);
  assert.equal(entry.source_status, 'verified_final', `Indexed edition ${key} must come from a final board.`);
  assert.equal(entry.validation_status, 'valid', `Indexed edition ${key} must pass publication validation.`);
  const edition = readJson(entry.path);
  assert.equal(edition.season, entry.season, `Indexed edition ${key} has a mismatched season.`);
  assert.equal(edition.week, entry.week, `Indexed edition ${key} has a mismatched week.`);
  assert.equal(edition.source_status, 'verified_final', `Edition ${key} must come from a final board.`);
  assert.equal(edition.validation_status, 'valid', `Edition ${key} must pass publication validation.`);
  assert.ok(Array.isArray(edition.stories) && edition.stories.length > 0, `Edition ${key} must contain stories.`);
}
assert.match(appSource, /if \(name === 'weekly'\) name = 'newspaper'/, '#weekly must resolve to the newspaper view.');

const serializedEditions = JSON.stringify({historical, weeklyIndex});
for(const placeholder of ['River City Rockets', 'Hail Mary Heroes', 'Fourth & Long', 'Midnight Owls', 'Story Title']){
  assert.ok(!serializedEditions.includes(placeholder), `Placeholder newspaper data remains: ${placeholder}`);
}

const season2023 = seasons.seasons.find(season => season[0] === 2023);
const playoffs2023 = playoffs.seasons.find(season => season[0] === 2023);
assert.ok(season2023 && playoffs2023, 'The verified 2023 archive is missing.');
assert.equal(season2023[2], 'Jared Hall');
assert.equal(season2023[3], 'Crown The King 👑');
const championship = playoffs2023[6].find(game => game[1] === 'championship' && game[2] === 'Championship');
assert.deepEqual(championship.slice(5, 12), ['Crown The King 👑', 'Jared Hall', 126.12, 2, 'ZAZA FLOWERS', 'JD Daley', 121.2]);
assert.deepEqual(matchups.records.highestCombined, [363.06, 'Jared Hall', 184.46, 'Vincent Cannarozzi', 178.6, 2023, 13, 0]);
const hallDaley = matchups.pairs.find(pair => pair[0] === 'Jared Hall' && pair[1] === 'JD Daley');
assert.deepEqual(hallDaley[2], [9, 7, 0, 1967.4, 1986.98]);
const hallProfile = managerProfiles.profiles.find(profile => profile.name === 'Jared Hall');
assert.deepEqual(hallProfile.resume.titleYears.filter(year => year <= 2023), [2017, 2023]);
assert.equal(hallProfile.resume.playoffYears.filter(year => year <= 2023).length, 7);

class FakeClassList {
  constructor(){ this.values = new Set(); }
  add(...values){ values.forEach(value => this.values.add(value)); }
  remove(...values){ values.forEach(value => this.values.delete(value)); }
  toggle(value, force){
    if(force === true){ this.values.add(value); return true; }
    if(force === false){ this.values.delete(value); return false; }
    if(this.values.has(value)){ this.values.delete(value); return false; }
    this.values.add(value); return true;
  }
  contains(value){ return this.values.has(value); }
}

class FakeElement {
  constructor(id = ''){
    this.id = id;
    this.innerHTML = '';
    this.hidden = false;
    this.dataset = {};
    this.attributes = {};
    this.classList = new FakeClassList();
    this.isConnected = true;
  }
  addEventListener(){}
  setAttribute(name, value){ this.attributes[name] = String(value); }
  focus(){}
  closest(){ return null; }
}

const elements = Object.fromEntries([
  'editionTabs', 'editionContent', 'editionSourcesToggle', 'editionSourcesClose',
  'editionSourcesBackdrop', 'editionSourcesDrawer', 'editionSourcesList',
  'weeklyEditionPicker', 'weeklyEditionSelect'
].map(id => [id, new FakeElement(id)]));
const tabs = [new FakeElement(), new FakeElement()];
tabs[0].dataset.edition = 'historical';
tabs[1].dataset.edition = 'weekly';
const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

const emptyWeeklyIndex = {...weeklyIndex, editions: []};
const context = {
  window: {
    gateShared: {escapeHtml},
    location: {hash:'#home'},
    switchView(){},
    addEventListener(){}
  },
  document: {
    activeElement: null,
    body: new FakeElement('body'),
    getElementById(id){ return elements[id] || null; },
    querySelectorAll(selector){ return selector === '#editionTabs .edition-tab' ? tabs : []; },
    addEventListener(){}
  },
  history: {pushState(){}},
  fetch: async path => ({
    ok: true,
    async json(){ return structuredClone(path.includes('index.json') ? emptyWeeklyIndex : historical); }
  }),
  console: {log: console.log, warn: console.warn, error(){}},
  structuredClone
};
runInNewContext(readFileSync(new URL('js/newspaper.js', root), 'utf8'), context, {filename:'js/newspaper.js'});

await context.window.gateNewspaper.loadEdition('historical');
assert.match(elements.editionContent.innerHTML, /2017–2025 League History/);
assert.match(elements.editionContent.innerHTML, /The Swifties Close 2025/);
assert.match(elements.editionContent.innerHTML, /Hall Claims the Inaugural/);
assert.match(elements.editionContent.innerHTML, /verified all-season archive/);
assert.ok(!elements.editionContent.innerHTML.includes(historical.generated_at), 'Generation timestamp leaked into the public edition.');
assert.equal(elements.editionSourcesToggle.hidden, false);
assert.match(elements.editionSourcesList.innerHTML, /data\/seasons\.json \+ data\/playoffs\.json/);

await context.window.gateNewspaper.loadEdition('weekly');
assert.match(elements.editionContent.innerHTML, /No weekly edition has been published yet/);
assert.match(elements.editionContent.innerHTML, /Live or incomplete slates are not printed/i);
assert.equal(elements.weeklyEditionSelect.disabled, true);

context.fetch = async () => ({ok:false, status:404});
await context.window.gateNewspaper.loadEdition('historical');
assert.match(elements.editionContent.innerHTML, /Edition Unavailable/);
assert.match(elements.editionContent.innerHTML, /HTTP 404/);
assert.equal(elements.editionSourcesToggle.hidden, true);

const hostile = structuredClone(historical);
hostile.week = 1;
hostile.validation_status = 'valid';
hostile.source_status = 'verified_final';
hostile.stories[0].title = '<img src=x onerror=alert(1)>';
const hostileMarkup = context.window.gateNewspaper.renderEditionMarkup(hostile, 'weekly');
assert.ok(!hostileMarkup.includes('<img src=x'));
assert.match(hostileMarkup, /&lt;img src=x/);

assert.deepEqual(context.window.gateNewspaper.weeklyEntries({editions:[
  {season:2026,week:1,path:'week-1.json',validation_status:'valid',source_status:'verified_final'},
  {season:2026,week:2,path:'preview.json',validation_status:'preview',source_status:'incomplete_override'},
  {season:2025,week:14,path:'week-14.json',validation_status:'valid',source_status:'verified_final'}
]}).map(entry => entry.path), ['week-1.json','week-14.json']);

console.log('Newspaper checks passed: historical archive, verified weekly index, empty state, picker, sources, and HTML escaping.');
