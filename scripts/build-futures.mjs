// Power-rating model behind the championship futures board.
//
// Usage: npm run futures   (rewrites data/site.json `futures` in place)
//
// Career inputs (last 3 completed seasons, recency-weighted .5/.3/.2):
//   regular-season win%            weight .40
//   scoring rate vs league avg     weight .25
//   playoff result points          weight .20   (title 1.0 · runner-up .6 · bracket .22)
// plus a career win% prior        weight .15
//
// After a completed current-season draft, blend 45% career / 55% roster.
// Roster value uses ESPN PPR ranks from data/draft-ranks.json: best 1QB/2RB/2WR/1TE/1FLEX
// plus a discounted bench, DST, and kicker.
//
// Odds conversion: implied probability p_i ∝ rating^K, K tuned so the
// favorite lands near 24%, then rendered as American odds rounded to $50.
import {existsSync, readFileSync, writeFileSync} from 'node:fs';

const root = new URL('..', import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));

const clean = v => String(v ?? '').trim();
const parseRecord = record => {
  const parts = String(record ?? '').split('-');
  return [(Number(parts[0]) || 0), (Number(parts[1]) || 0), (Number(parts[2]) || 0)];
};

const seasonsData = read('data/seasons.json').seasons || [];
const playoffsData = read('data/playoffs.json').seasons || [];
const config = read('data/site.json');
const memberNames = new Set((read('data/members.json').members || []).map(m => clean(m.name)));

function seasonSummary(year){
  const season = seasonsData.find(s => Number(s[0]) === Number(year));
  if(!season || !Array.isArray(season[4])) return null;
  const rows = season[4].map(row => {
    const [wins, losses, ties] = parseRecord(row[4]);
    const games = wins + losses + ties;
    return {
      owner: clean(row[3]),
      wins, losses, ties, games,
      winPct: games ? wins / games : 0,
      pfpg: games ? Number(row[5]) / games : 0,
      finish: Number(row[0])
    };
  }).filter(r => r.owner);
  const avgPF = rows.reduce((sum, r) => sum + r.pfpg, 0) / (rows.length || 1);
  return {year: Number(year), rows, avgPF};
}

const allSummaries = seasonsData
  .map(s => seasonSummary(s[0]))
  .filter(Boolean)
  .sort((a, b) => b.year - a.year);

const recent = allSummaries.slice(0, 3);
const recencyWeights = [0.5, 0.3, 0.2];

function playoffPoints(year){
  const entry = playoffsData.find(s => Number(s[0]) === Number(year));
  if(!entry) return {};
  const points = {};
  const champion = clean(entry[1]);
  if(champion) points[champion] = Math.max(points[champion] || 0, 1.0);
  const games = Array.isArray(entry[6]) ? entry[6] : [];
  const finalGame = [...games].reverse().find(g => g && g[1] === 'championship' && g[2] === 'Championship'
    && typeof g[7] === 'number' && typeof g[11] === 'number');
  if(finalGame){
    const homeWins = finalGame[7] >= finalGame[11];
    const runnerUp = homeWins ? finalGame[10] : finalGame[5];
    const ru = clean(runnerUp);
    if(ru) points[ru] = Math.max(points[ru] || 0, 0.6);
  }
  const bracket = Array.isArray(entry[5]) ? entry[5] : [];
  bracket.forEach(t => {
    const owner = clean(t[2]);
    if(owner) points[owner] = Math.max(points[owner] || 0, 0.22);
  });
  return points;
}

const managers = new Map();
allSummaries.forEach(summary => {
  summary.rows.forEach(row => {
    const m = managers.get(row.owner) || {
      name: row.owner,
      weightedWin: 0, weightedWinW: 0,
      weightedScore: 0, weightedScoreW: 0,
      playoffScore: 0,
      wins: 0, games: 0
    };
    m.wins += row.wins; m.games += row.games;
    return managers.set(row.owner, m);
  });
});

recent.forEach((summary, i) => {
  const w = recencyWeights[i] ?? 0.05;
  const points = playoffPoints(summary.year);
  summary.rows.forEach(row => {
    const m = managers.get(row.owner);
    if(!m) return;
    m.weightedWin += w * row.winPct; m.weightedWinW += w;
    const rel = Math.min(Math.max(row.pfpg / summary.avgPF, 0.75), 1.25);
    m.weightedScore += w * ((rel - 0.75) / 0.5); m.weightedScoreW += w;
  });
  Object.entries(points).forEach(([owner, pts]) => {
    const m = managers.get(owner);
    if(m) m.playoffScore += w * pts;
  });
});

const careerRatings = [...managers.values()]
  .filter(m => memberNames.has(m.name))
  .map(m => {
  const careerWinPct = m.games ? m.wins / m.games : 0.5;
  const recentWin = m.weightedWinW ? m.weightedWin / m.weightedWinW : careerWinPct;
  const scoreScore = m.weightedScoreW ? m.weightedScore / m.weightedScoreW : 0.5;
  const playoffNorm = Math.min(m.playoffScore / 1.0, 1);
  const careerRating = 100 * (0.40 * recentWin + 0.25 * scoreScore + 0.20 * playoffNorm + 0.15 * careerWinPct);
  return {...m, careerWinPct, recentWin, scoreScore, playoffRaw: m.playoffScore, careerRating};
});

function playerValue(rank, position){
  const raw = Math.pow(Math.max(0, 240 - Number(rank || 250)), 1.05);
  if(position === 'D/ST') return raw * 0.22;
  if(position === 'K') return raw * 0.12;
  if(position === 'QB') return raw * 0.92;
  return raw;
}

function rosterScore(players){
  const byPos = new Map();
  players.forEach(player => {
    const list = byPos.get(player.position) || [];
    list.push(player);
    byPos.set(player.position, list);
  });
  byPos.forEach(list => list.sort((a, b) => (a.rank || 999) - (b.rank || 999)));
  const used = new Set();
  const take = (position, count) => {
    const chosen = [];
    for(const player of byPos.get(position) || []){
      if(used.has(player)) continue;
      chosen.push(player);
      used.add(player);
      if(chosen.length === count) break;
    }
    return chosen;
  };
  const starters = [
    ...take('QB', 1),
    ...take('RB', 2),
    ...take('WR', 2),
    ...take('TE', 1)
  ];
  const flex = players
    .filter(player => ['RB', 'WR', 'TE'].includes(player.position) && !used.has(player))
    .sort((a, b) => (a.rank || 999) - (b.rank || 999))[0];
  if(flex){
    starters.push(flex);
    used.add(flex);
  }
  starters.push(...take('D/ST', 1), ...take('K', 1));
  const starterTotal = starters.reduce((sum, player) => sum + playerValue(player.rank, player.position), 0);
  const benchTotal = players
    .filter(player => !used.has(player))
    .map(player => playerValue(player.rank, player.position))
    .sort((a, b) => b - a)
    .slice(0, 7)
    .reduce((sum, value) => sum + value, 0);
  return starterTotal + 0.20 * benchTotal;
}

function loadRosterRatings(seasonYear){
  const ranksUrl = new URL('data/draft-ranks.json', root);
  if(!existsSync(ranksUrl)) return null;
  const payload = JSON.parse(readFileSync(ranksUrl, 'utf8'));
  if(Number(payload.season) !== Number(seasonYear)) return null;
  const byOwner = new Map();
  (payload.players || []).forEach(player => {
    const owner = clean(player.owner);
    if(!owner) return;
    const list = byOwner.get(owner) || [];
    list.push({
      position: String(player.position || 'FLEX'),
      rank: Number(player.rank) || 250
    });
    byOwner.set(owner, list);
  });
  if(byOwner.size < 4) return null;
  const raw = [...byOwner.entries()].map(([name, players]) => ({name, value: rosterScore(players)}));
  const mean = raw.reduce((sum, row) => sum + row.value, 0) / raw.length;
  const variance = raw.reduce((sum, row) => sum + ((row.value - mean) ** 2), 0) / raw.length;
  const sd = Math.sqrt(variance) || 1;
  return new Map(raw.map(row => [row.name, 45 + 12 * ((row.value - mean) / sd)]));
}

const rosterRatings = loadRosterRatings(config.seasonYear);
const ROSTER_WEIGHT = 0.55;
const ratings = careerRatings.map(m => {
  const rosterRating = rosterRatings?.get(m.name);
  const rating = rosterRating == null
    ? m.careerRating
    : ((1 - ROSTER_WEIGHT) * m.careerRating) + (ROSTER_WEIGHT * rosterRating);
  return {...m, rosterRating, rating};
}).sort((a, b) => b.rating - a.rating);

let lo = 1, hi = 14, K = 6;
const probFor = k => {
  const exps = ratings.map(r => Math.pow(r.rating / 100, k));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(e => e / sum);
};
for(let iter = 0; iter < 40; iter++){
  K = (lo + hi) / 2;
  const top = probFor(K)[0];
  if(top > 0.24) hi = K; else lo = K;
}
const probs = probFor(K);

const americanOdds = p => {
  const raw = p >= 0.5 ? -(100 * p) / (1 - p) : (100 * (1 - p)) / p;
  const rounded = Math.round(raw / 50) * 50;
  return Math.round(Math.min(Math.max(rounded, -400), 2500));
};

const basis = rosterRatings ? 'post-draft' : 'career';
console.log(rosterRatings
  ? 'Rating model — 45% career form / 55% 2026 roster ranks\n'
  : 'Rating model — last 3 seasons weighted .5/.3/.2\n');
console.log('Manager               Rating  Career  Roster  Odds');
ratings.forEach((r, i) => {
  const roster = r.rosterRating == null ? '   —' : r.rosterRating.toFixed(1).padStart(6);
  console.log(
    `${r.name.padEnd(21)} ${r.rating.toFixed(1).padStart(6)}  ${r.careerRating.toFixed(1).padStart(6)}  ${roster}  +${americanOdds(probs[i])}`
  );
});
console.log(`\nExponent K=${K.toFixed(2)} (favorite implied ${(probs[0] * 100).toFixed(1)}%) · basis ${basis}`);

const previous = new Map((config.futures || []).map(f => [clean(f.name), f]));
config.futures = ratings.map((r, i) => ({
  name: r.name,
  odds: `+${americanOdds(probs[i])}`,
  case: previous.get(r.name)?.case || ''
}));

const unmatched = [...previous.keys()].filter(name => !ratings.some(r => r.name === name));
if(unmatched.length) console.warn('\nKept at end (not matched by model):', unmatched.join(', '));

writeFileSync(new URL('data/site.json', root), JSON.stringify(config, null, 2) + '\n');
console.log(`\nWrote ${config.futures.length} futures entries to data/site.json`);

writeFileSync(new URL('data/power-rankings.json', root), JSON.stringify({
  schemaVersion: 1,
  generatedForSeason: config.seasonNumber,
  basis,
  ratings: ratings.map(r => ({name: r.name, rating: Math.round(r.rating * 10) / 10}))
}, null, 2) + '\n');
console.log(`Wrote ${ratings.length} power ratings to data/power-rankings.json`);
