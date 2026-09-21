import {existsSync, readFileSync} from 'node:fs';

const root = new URL('../', import.meta.url);
const currentSeason = JSON.parse(readFileSync(new URL('data/current-season.json', root), 'utf8'));
const siteUiSource = readFileSync(new URL('js/site-ui.js', root), 'utf8');

if(!siteUiSource.includes('renderWeekBoard') || !siteUiSource.includes('data/current-season.json') || !siteUiSource.includes('data/homepage-week.json')){
  throw new Error('site-ui.js must prefer homepage-week.json and keep current-season.json as fallback.');
}
if(!existsSync(new URL('data/homepage-week.json', root))){
  throw new Error('data/homepage-week.json is missing.');
}
const homepageWeek = JSON.parse(readFileSync(new URL('data/homepage-week.json', root), 'utf8'));
if(homepageWeek.schemaVersion !== 1 || homepageWeek.season !== currentSeason.season || homepageWeek.week !== currentSeason.week || homepageWeek.phase !== currentSeason.phase){
  throw new Error('homepage-week.json must match the published current-season week.');
}
if(!Array.isArray(homepageWeek.matchups) || homepageWeek.matchups.length !== 6 || !Array.isArray(homepageWeek.standings) || homepageWeek.standings.length !== 12){
  throw new Error('homepage-week.json must include the current six matchups and twelve standings.');
}
if(!Array.isArray(homepageWeek.league_pulse) || homepageWeek.league_pulse.length < 5 || !homepageWeek.championship_odds?.favorite || !homepageWeek.featured_story?.headline || !homepageWeek.last_updated){
  throw new Error('homepage-week.json must include pulse cards, odds, the featured story, and freshness metadata.');
}
if(!existsSync(new URL('scripts/build-homepage-week.mjs', root))){
  throw new Error('The homepage-week builder is missing.');
}
