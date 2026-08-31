import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const root = new URL('../', import.meta.url);
const readJson = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const historical = readJson('data/newspaper_editions/historical_2023.json');
const weekly = readJson('data/newspaper_editions/weekly_fallback_2023.json');
const seasons = readJson('data/seasons.json');
const playoffs = readJson('data/playoffs.json');
const matchups = readJson('data/matchups.json');
const managerProfiles = readJson('data/manager-profiles.json');
const appSource = readFileSync(new URL('js/app.js', root), 'utf8');

assert.equal(historical.season, 2023);
assert.equal(historical.edition_year, 2023);
assert.equal(historical.stories.length, 9, 'Historical newspaper must contain nine verified stories.');
assert.deepEqual(new Set(historical.stories.map(story => story.story_type)), new Set([
  'playoff_picture', 'playoff_elimination', 'record_watch', 'power_rankings',
  'championship_contender', 'rivalry', 'transactions', 'manager_spotlight', 'next_week'
]));
assert.equal(weekly.stories.length, 1);
assert.match(weekly.stories[0].body, /does not contain current 2026 scores/i);
assert.match(appSource, /if \(name === 'weekly'\) name = 'newspaper'/, '#weekly must resolve to the newspaper view.');

const serializedEditions = JSON.stringify({historical, weekly});
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
  'editionSourcesBackdrop', 'editionSourcesDrawer', 'editionSourcesList'
].map(id => [id, new FakeElement(id)]));
const tabs = [new FakeElement(), new FakeElement()];
tabs[0].dataset.edition = 'historical';
tabs[1].dataset.edition = 'weekly_fallback';
const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

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
    async json(){ return structuredClone(path.includes('weekly') ? weekly : historical); }
  }),
  console: {log: console.log, warn: console.warn, error(){}},
  structuredClone
};
runInNewContext(readFileSync(new URL('js/newspaper.js', root), 'utf8'), context, {filename:'js/newspaper.js'});

await context.window.gateNewspaper.loadEdition('historical');
assert.match(elements.editionContent.innerHTML, /Crown The King Survives a Classic/);
assert.match(elements.editionContent.innerHTML, /historical archive data/);
assert.ok(!elements.editionContent.innerHTML.includes(historical.generated_at), 'Generation timestamp leaked into the public edition.');
assert.equal(elements.editionSourcesToggle.hidden, false);
assert.match(elements.editionSourcesList.innerHTML, /data\/playoffs\.json/);

await context.window.gateNewspaper.loadEdition('weekly_fallback');
assert.match(elements.editionContent.innerHTML, /Weekly Press Is in Demonstration Mode/);
assert.match(elements.editionContent.innerHTML, /not current-season ESPN coverage/i);

context.fetch = async () => ({ok:false, status:404});
await context.window.gateNewspaper.loadEdition('historical');
assert.match(elements.editionContent.innerHTML, /Edition Unavailable/);
assert.match(elements.editionContent.innerHTML, /HTTP 404/);
assert.equal(elements.editionSourcesToggle.hidden, true);

const hostile = structuredClone(weekly);
hostile.stories[0].title = '<img src=x onerror=alert(1)>';
const hostileMarkup = context.window.gateNewspaper.renderEditionMarkup(hostile, 'weekly_fallback');
assert.ok(!hostileMarkup.includes('<img src=x'));
assert.match(hostileMarkup, /&lt;img src=x/);

console.log('Newspaper checks passed: verified data, two edition routes, sources, fallback labeling, and HTML escaping.');
