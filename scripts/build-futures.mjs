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
//
// In season (scripts/futures-model.mjs scoreBlend): 2026 points per game,
// regressed toward the league mean with the evidence weight
// w = n*TAU^2 / (n*TAU^2 + SIGMA^2); the preseason rating keeps the other
// (1 - w). Record and points against no longer move the rating. The same
// pass writes the scoring parameters and the known/inferred schedule that
// js/title-odds.js uses to simulate weekly scores.
// Roster value uses ESPN PPR ranks from data/draft-ranks.json: best 1QB/2RB/2WR/1TE/1FLEX
// plus a discounted bench, DST, and kicker.
//
// Odds conversion: title probabilities come from the Playoffs tab's seeded
// season + playoff simulation (js/title-odds.js), run once here and stored in
// power-rankings.json `projection`. Price = American odds of title% x 1.05
// office margin, rounded to a ladder, capped at +5000
// (futures-model.mjs priceFromProbability).
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import vm from 'node:vm';
import {LONG_SHOT_CAP, OFFICE_OVERROUND, REGULAR_SEASON_WEEKS, currentSeasonRatings, formatAmericanOdds, inferRoundRobin, methodShares, oddsMethodNote, priceFromProbability, scoreBlend, scoringParameters} from './futures-model.mjs';

const root = new URL('..', import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));

const clean = v => String(v ?? '').trim();
const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;
const parseRecord = record => {
  const parts = String(record ?? '').split('-');
  return [(Number(parts[0]) || 0), (Number(parts[1]) || 0), (Number(parts[2]) || 0)];
};

function loadTitleOddsModel(){
  const sandbox = {module: {exports: {}}};
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL('js/title-odds.js', root), 'utf8'), sandbox, {filename: 'js/title-odds.js'});
  return sandbox.module.exports;
}

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
const currentPath = new URL('data/current-season.json', root);
const currentPayload = existsSync(currentPath) ? JSON.parse(readFileSync(currentPath, 'utf8')) : null;
const currentSeason = Number(currentPayload?.season) === Number(config.seasonYear)
  ? currentSeasonRatings(currentPayload)
  : null;
const ROSTER_WEIGHT = 0.55;
const preseason = careerRatings.map(m => {
  const rosterRating = rosterRatings?.get(m.name);
  const preseasonRating = rosterRating == null
    ? m.careerRating
    : ((1 - ROSTER_WEIGHT) * m.careerRating) + (ROSTER_WEIGHT * rosterRating);
  return {...m, rosterRating, preseasonRating};
});

// Completed 2026 weeks (final scores only) from data/matchups.json.
const matchupsUrl = new URL('data/matchups.json', root);
const seasonScores = existsSync(matchupsUrl)
  ? (JSON.parse(readFileSync(matchupsUrl, 'utf8')).currentSeasonScores || [])
      .filter(row => Number(row.season) === Number(config.seasonYear) && !row.isPlayoff)
  : [];
const gamesPlayed = currentSeason?.games || 0;
const completedWeeks = new Map();
for(let week = 1; week <= gamesPlayed; week++){
  const rows = seasonScores.filter(row => Number(row.week) === week);
  if(rows.length === 12) completedWeeks.set(week, rows);
}
const standingsOrder = currentSeason ? [...currentSeason.ratings.keys()] : [];
const weeklyScores = [...completedWeeks.values()].map(rows => standingsOrder.map(name => {
  const row = rows.find(r => clean(r.owner) === name);
  return row ? Number(row.score) : NaN;
})).filter(week => week.every(Number.isFinite));

const scoring = scoringParameters({
  seasons: seasonsData,
  playoffs: playoffsData,
  weeklyScores,
  pointsPerGame: currentSeason ? [...currentSeason.ratings.values()].map(row => row.pfpg) : [],
  gamesPlayed
});
const blend = scoreBlend(new Map(preseason.map(m => [m.name, m.preseasonRating])), currentSeason, scoring);
const ratings = preseason.map(m => {
  const current = currentSeason?.ratings.get(m.name);
  const blended = blend.ratings.get(m.name);
  return {...m, current, ...blended};
}).sort((a, b) => b.rating - a.rating);

// Schedule for the simulation: completed weeks, any posted ESPN week from
// data/current-season.json, and circle-method inference for the rest.
const knownWeeks = new Map();
for(const [week, rows] of completedWeeks){
  const seen = new Set();
  const games = [];
  rows.forEach(row => {
    const pair = [clean(row.owner), clean(row.opponentOwner)];
    const key = [...pair].sort().join('|');
    if(!seen.has(key)){ seen.add(key); games.push(pair); }
  });
  if(games.length === 6) knownWeeks.set(week, games);
}
const postedWeeks = new Set();
if(currentSeason){
  const byWeek = new Map();
  (currentPayload.matchups || [])
    .filter(m => !m.isPlayoff && Number(m.week) > gamesPlayed && Number(m.week) <= REGULAR_SEASON_WEEKS)
    .forEach(m => {
      const games = byWeek.get(Number(m.week)) || [];
      games.push([clean(m.away?.owner), clean(m.home?.owner)]);
      byWeek.set(Number(m.week), games);
    });
  byWeek.forEach((games, week) => {
    if(games.length === 6 && games.every(pair => pair.every(name => currentSeason.ratings.has(name)))){
      knownWeeks.set(week, games);
      postedWeeks.add(week);
    }
  });
}
const inferred = currentSeason ? inferRoundRobin(standingsOrder, knownWeeks) : null;
const remainingWeeks = [];
for(let week = gamesPlayed + 1; week <= REGULAR_SEASON_WEEKS; week++){
  if(knownWeeks.has(week)) remainingWeeks.push({week, source: 'espn', games: knownWeeks.get(week)});
  else if(inferred) remainingWeeks.push({week, source: 'inferred', games: inferred.schedule.get(week)});
  else remainingWeeks.push({week, source: 'random', games: null});
}

const preseasonBasis = rosterRatings ? 'post-draft' : 'career';
const basis = currentSeason ? 'weekly-results-blend' : preseasonBasis;

const powerRankings = {
  schemaVersion: 1,
  generatedForSeason: config.seasonNumber,
  basis,
  currentSeason: currentSeason ? {
    season: config.seasonYear,
    throughWeek: currentSeason.week,
    gamesPlayed: currentSeason.games,
    // Blend weight actually applied: the evidence-based reliability weight w.
    weight: Math.round(blend.weight * 1000) / 1000,
    // Former 0.10 + 0.60*g/13 schedule, reported for comparison only.
    scheduleWeight: Math.round(currentSeason.weight * 1000) / 1000,
    factors: {pointsFor: 1}
  } : null,
  scoring: {
    model: 'normal-weekly-scores',
    regularSeasonWeeks: REGULAR_SEASON_WEEKS,
    leagueMean: round(scoring.leagueMean, 2),
    sigma: scoring.sigma,
    tau: round(scoring.tau, 3),
    reliabilityWeight: round(scoring.reliabilityWeight, 4),
    posteriorSd: round(scoring.posteriorSd, 3),
    preseasonCorrelation: round(scoring.preseasonCorrelation, 3),
    pointsPerRatingPoint: round(blend.pointsPerRatingPoint, 4),
    inputs: {
      completedWeeksUsed: weeklyScores.length,
      pooledWithinSd: scoring.pooledWithinSd == null ? null : round(scoring.pooledWithinSd, 2),
      historicalGameSd: scoring.historicalGameSd == null ? null : round(scoring.historicalGameSd, 2),
      historicalGameCount: scoring.historicalGameCount,
      talentSeasons: scoring.talentSeasons,
      yearToYearCorrelation: scoring.yearToYearCorrelation == null ? null : round(scoring.yearToYearCorrelation, 3),
      yearToYearPairs: scoring.yearToYearPairs
    }
  },
  schedule: currentSeason ? {
    method: inferred ? 'circle-method round robin fitted to known weeks' : 'random round robin for unknown weeks',
    knownWeeks: [...knownWeeks.keys()].sort((a, b) => a - b),
    ...(inferred ? {fixedTeam: inferred.fixedTeam} : {}),
    remaining: remainingWeeks
  } : null,
  ratings: ratings.map(r => ({
    name: r.name,
    rating: Math.round(r.rating * 10) / 10,
    preseasonRating: Math.round(r.preseasonRating * 10) / 10,
    projectedPoints: round(r.projectedPoints, 2),
    // Preseason view in points per week; projectedPoints = (1-w)*preseasonPoints + w*pointsForPerGame.
    preseasonPoints: round(scoring.leagueMean + (r.preseasonRating - blend.preMean) * blend.pointsPerRatingPoint, 2),
    ...(r.current ? {
      currentRating: Math.round(r.currentRating * 10) / 10,
      inSeasonPoints: round(r.inSeasonPoints, 2),
      wins: r.current.wins,
      losses: r.current.losses,
      ties: r.current.ties,
      record: `${r.current.wins}-${r.current.losses}${r.current.ties ? `-${r.current.ties}` : ''}`,
      pointsFor: round(r.current.pointsFor, 2),
      pointsForPerGame: Math.round(r.current.pfpg * 100) / 100,
      pointsAgainstPerGame: Math.round(r.current.papg * 100) / 100
    } : {})
  }))
};


// Run the Playoffs tab's own simulation (js/title-odds.js: same inputs, seed
// and run count) once here, so the Playoffs tab and the homepage futures board
// read the same title probabilities.
const titleOddsModel = loadTitleOddsModel();
const prepared = titleOddsModel.prepare(powerRankings);
const simulation = titleOddsModel.simulate(prepared.teams, prepared.options);
const projectionByName = new Map(prepared.teams.map((team, index) => [team.name, {
  playoff: simulation.made[index] / simulation.simulations,
  bye: simulation.bye[index] / simulation.simulations,
  title: simulation.title[index] / simulation.simulations
}]));
powerRankings.projection = {
  method: 'seeded season + playoff simulation (js/title-odds.js)',
  simulations: simulation.simulations,
  seed: prepared.options.seed,
  teams: prepared.teams.map(team => ({name: team.name, ...projectionByName.get(team.name)}))
};

const methodInputs = {
  gamesPlayed,
  scoringWeight: blend.weight,
  rosterWeight: rosterRatings ? ROSTER_WEIGHT : 0,
  simulations: simulation.simulations,
  houseEdge: OFFICE_OVERROUND - 1,
  randomWeeks: remainingWeeks.filter(week => !week.games).length
};
const shares = methodShares(gamesPlayed, blend.weight);
const methodFields = {
  gamesPlayed,
  preseasonShare: shares.preseason,
  scoringShare: shares.scoring,
  careerShare: Math.round((1 - methodInputs.rosterWeight) * 100),
  rosterShare: Math.round(methodInputs.rosterWeight * 100),
  simulations: simulation.simulations,
  houseEdgePct: Math.round(methodInputs.houseEdge * 100)
};
powerRankings.method = {...methodFields, text: oddsMethodNote(methodInputs, 'playoffs')};
config.futuresMethod = {...methodFields, text: oddsMethodNote(methodInputs, 'home')};

const titleOf = name => projectionByName.get(name)?.title ?? 0;
const priceOf = name => formatAmericanOdds(priceFromProbability(titleOf(name)));
// Same order as the Playoffs tab: title %, then playoff %, then rating.
const board = [...ratings].sort((a, b) => titleOf(b.name) - titleOf(a.name)
  || (projectionByName.get(b.name)?.playoff ?? 0) - (projectionByName.get(a.name)?.playoff ?? 0)
  || b.rating - a.rating);

console.log(currentSeason
  ? `Rating model — 2026 PF/G regressed with w=${blend.weight.toFixed(3)} (SIGMA ${scoring.sigma}, TAU ${scoring.tau.toFixed(2)}, ${currentSeason.games} game(s)); preseason keeps ${((1 - blend.weight) * 100).toFixed(1)}% · league mean ${scoring.leagueMean.toFixed(2)} · rho ${scoring.preseasonCorrelation.toFixed(3)}\n`
  : rosterRatings ? 'Rating model — 45% career form / 55% 2026 roster ranks\n' : 'Rating model — last 3 seasons weighted .5/.3/.2\n');
console.log('Manager               Rating  Base   Current  Pts/wk  Title%  Odds');
board.forEach(r => {
  const current = r.currentRating == null ? '      —' : r.currentRating.toFixed(1).padStart(7);
  console.log(
    `${r.name.padEnd(21)} ${r.rating.toFixed(1).padStart(6)}  ${r.preseasonRating.toFixed(1).padStart(5)}  ${current}  ${r.projectedPoints.toFixed(1).padStart(6)}  ${(titleOf(r.name) * 100).toFixed(1).padStart(6)}  ${priceOf(r.name)}`
  );
});
console.log(`\nPrices: ${simulation.simulations.toLocaleString('en-US')} seeded simulations (seed ${prepared.options.seed}) · title % x ${OFFICE_OVERROUND} office margin · ladder rounding · cap +${LONG_SHOT_CAP} · basis ${basis}`);

const previous = new Map((config.futures || []).map(f => [clean(f.name), f]));
config.futures = board.map(r => ({
  name: r.name,
  odds: priceOf(r.name),
  case: r.current
    ? `${r.current.wins}-${r.current.losses}${r.current.ties ? `-${r.current.ties}` : ''} · ${r.current.pfpg.toFixed(2)} PF/G through ${currentSeason.games}. Draft note: ${previous.get(r.name)?.draftCase || previous.get(r.name)?.case || ''}`
    : previous.get(r.name)?.draftCase || previous.get(r.name)?.case || '',
  ...(r.current ? {draftCase: previous.get(r.name)?.draftCase || previous.get(r.name)?.case || ''} : {})
}));

const unmatched = [...previous.keys()].filter(name => !ratings.some(r => r.name === name));
if(unmatched.length) console.warn('\nKept at end (not matched by model):', unmatched.join(', '));

writeFileSync(new URL('data/site.json', root), JSON.stringify(config, null, 2) + '\n');
console.log(`\nWrote ${config.futures.length} futures entries to data/site.json`);

writeFileSync(new URL('data/power-rankings.json', root), JSON.stringify(powerRankings, null, 2) + '\n');
console.log(`Wrote ${ratings.length} power ratings to data/power-rankings.json`);
