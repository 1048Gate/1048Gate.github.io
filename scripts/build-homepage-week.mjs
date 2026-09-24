import {readFileSync, writeFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {fileURLToPath} from 'node:url';

const root = new URL('../', import.meta.url);

function loadJson(path){
  return JSON.parse(readFileSync(new URL(path, root), 'utf8'));
}

export function statusFor(config = {}, board = {}){
  if(/pre[ -]?season|off[ -]?season|draft|keeper/i.test(String(config.phase || board.phase || ''))) return 'offseason';
  const games = Array.isArray(board.matchups) ? board.matchups : [];
  const states = games.map(game => String(game.state || '').toLowerCase());
  if(games.length && states.every(state => state === 'final')) return 'final';
  if(states.some(state => state === 'live')) return 'live';
  return 'scheduled';
}

export function featuredStory(index, week){
  const editions = Array.isArray(index?.editions) ? index.editions : [];
  const entry = editions.find(item => item.season === week.season && item.week === week.week) || editions[0] || null;
  if(!entry?.path) return null;
  const edition = loadJson(entry.path);
  return {
    season: edition.season,
    week: edition.week,
    headline: edition.headline || '',
    standfirst: edition.standfirst || '',
    path: entry.path,
    source_status: edition.source_status || entry.source_status || '',
    validation_status: edition.validation_status || entry.validation_status || '',
    status: edition.status || '',
    generated_at: edition.generated_at || entry.published_at || null,
    table_leader: edition.tableNotes?.[0] || null,
    pressure: edition.pressure || null
  };
}

export function loadPulseApi(source){
  const sandbox = {window:{}, console};
  runInNewContext(source, sandbox, {filename:'js/league-pulse.js'});
  if(!sandbox.window.gateLeaguePulse?.buildCards) throw new Error('league-pulse.js did not publish buildCards.');
  return sandbox.window.gateLeaguePulse;
}

export function buildHomepageWeek({site, week, index, archive, pulseApi, builtAt}){
  const favorite = Array.isArray(site.futures) ? site.futures[0] : null;
  const story = featuredStory(index, week);
  const cards = pulseApi.buildCards({config:site, board:week, archive:archive || {}});
  return {
    schemaVersion: 1,
    season: week.season,
    seasonNumber: week.seasonNumber,
    week: week.week,
    phase: week.phase || site.phase,
    status: statusFor(site, week),
    last_updated: week.fetchedAt || builtAt,
    note: week.note || '',
    matchups: week.matchups,
    standings: week.standings,
    featured_story: story,
    championship_odds: {
      favorite: favorite ? {name:favorite.name, odds:favorite.odds, case:favorite.case || ''} : null,
      board: Array.isArray(site.futures) ? site.futures : []
    },
    league_pulse: cards,
    freshness: {
      week_fetched_at: week.fetchedAt || null,
      edition_published_at: story?.generated_at || null,
      payload_built_at: builtAt,
      sources: [
        'data/current-season.json',
        'data/site.json',
        'data/newspaper_editions/index.json',
        'data/matchups.json'
      ]
    }
  };
}

export function writeHomepageWeek({now = new Date().toISOString()} = {}){
  const site = loadJson('data/site.json');
  const week = loadJson('data/current-season.json');
  const index = loadJson('data/newspaper_editions/index.json');
  const archive = loadJson('data/matchups.json');
  const pulseApi = loadPulseApi(readFileSync(new URL('js/league-pulse.js', root), 'utf8'));
  const payload = buildHomepageWeek({site, week, index, archive, pulseApi, builtAt: now});
  writeFileSync(new URL('data/homepage-week.json', root), `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

if(process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]){
  const payload = writeHomepageWeek();
  console.log(`Wrote data/homepage-week.json for ${payload.phase} (${payload.status}, ${payload.league_pulse.length} pulse cards).`);
}
