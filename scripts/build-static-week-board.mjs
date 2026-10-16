import {readFileSync, writeFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {fileURLToPath} from 'node:url';

const root = new URL('../', import.meta.url);

function escapeHtml(value){
  return String(value ?? '').replace(/[<>&"]/g, character => ({
    '<':'&lt;',
    '>':'&gt;',
    '&':'&amp;',
    '"':'&quot;'
  }[character]));
}

function loadWeekBoard(){
  const context = {window:{}, document:{}};
  runInNewContext(readFileSync(new URL('js/week-board.js', root), 'utf8'), context, {filename:'js/week-board.js'});
  if(!context.window.gateWeekBoard?.matchupCardHtml || !context.window.gateWeekBoard?.standingsSnapshotHtml){
    throw new Error('week-board.js did not publish the static board renderers.');
  }
  return context.window.gateWeekBoard;
}

function snapshotLabel(value){
  const date = new Date(value);
  if(Number.isNaN(date.getTime())) return 'Saved ESPN snapshot';
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone:'America/New_York',
    month:'short',
    day:'numeric',
    year:'numeric',
    hour:'numeric',
    minute:'2-digit'
  }).format(date);
  return `ESPN snapshot · ${label} ET`;
}

export function renderStaticWeekBoard(board, renderer = loadWeekBoard()){
  const matchups = Array.isArray(board?.matchups) ? board.matchups : [];
  const standings = Array.isArray(board?.standings) ? board.standings : [];
  if(matchups.length !== 6 || standings.length !== 12){
    throw new Error(`Static week board requires 6 matchups and 12 standings rows; found ${matchups.length} and ${standings.length}.`);
  }
  const phase = board.phase || `Week ${board.week}`;
  const fetchedAt = board.fetchedAt || '';
  const matchupHtml = matchups.map(game => renderer.matchupCardHtml(game, escapeHtml, [], board)).join('\n');
  const standingsHtml = renderer.standingsSnapshotHtml(standings, '', escapeHtml);
  return `<section class="home-section week-board" data-panel="data" id="weekBoard" data-week-source="saved" data-week-season="${escapeHtml(board.season)}" data-week="${escapeHtml(board.week)}" data-week-fetched-at="${escapeHtml(fetchedAt)}" aria-label="${escapeHtml(phase)} matchups and standings">
      <header class="home-section-head"><div><span>01 · Current week</span><h2>${escapeHtml(phase)}</h2></div><small data-week-stamp class="is-saved" role="status">${escapeHtml(snapshotLabel(fetchedAt))}</small></header>
      <div class="week-board-grid">
        <div class="week-matchups" data-week-matchups>
${matchupHtml}
        </div>
        <div class="week-standings" data-week-standings>
${standingsHtml}
        </div>
      </div>
    </section>`;
}

// The no-JS League Pulse odds card mirrors the odds card in data/homepage-week.json,
// using the same markup as js/league-pulse.js, so raw HTML never shows an old favorite.
export function renderStaticOddsCard(homepage){
  const card = (Array.isArray(homepage?.league_pulse) ? homepage.league_pulse : []).find(item => item?.id === 'odds');
  if(!card?.title) return null;
  const target = card.scrollTo || 'championshipOdds';
  return `<article class="league-pulse-card" data-pulse-card="odds" role="listitem"><span>${escapeHtml(card.label || 'Odds board')}</span><strong>${escapeHtml(card.title)}</strong><p>${escapeHtml(card.detail || '')}</p><button type="button" data-scroll-to="${escapeHtml(target)}">Open <span aria-hidden="true">→</span></button></article>`;
}

export const STATIC_ODDS_CARD_PATTERN = /<article class="league-pulse-card[^"]*" data-pulse-card="odds"[^>]*>[\s\S]*?<\/article>/;

export function writeStaticWeekBoard(){
  const board = JSON.parse(readFileSync(new URL('data/current-season.json', root), 'utf8'));
  const homepage = JSON.parse(readFileSync(new URL('data/homepage-week.json', root), 'utf8'));
  const indexPath = new URL('index.html', root);
  const html = readFileSync(indexPath, 'utf8');
  const sectionPattern = /<section class="home-section week-board"[^>]*>[\s\S]*?<\/section>/;
  if(!sectionPattern.test(html)) throw new Error('Could not find the static #weekBoard section in index.html.');
  let updated = html.replace(sectionPattern, renderStaticWeekBoard(board));
  const oddsCard = renderStaticOddsCard(homepage);
  if(oddsCard){
    if(!STATIC_ODDS_CARD_PATTERN.test(updated)) throw new Error('Could not find the static League Pulse odds card in index.html.');
    updated = updated.replace(STATIC_ODDS_CARD_PATTERN, () => oddsCard);
  }
  writeFileSync(indexPath, updated);
  return board;
}

if(process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]){
  const board = writeStaticWeekBoard();
  console.log(`Wrote the static homepage fallback for ${board.phase || `Week ${board.week}`}.`);
}
