const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;

function scale(value, low, high){
  if(high <= low) return 0.5;
  return Math.min(Math.max((value - low) / (high - low), 0), 1);
}

export function currentSeasonRatings(payload, expectedTeams = 12){
  const rows = Array.isArray(payload?.standings) ? payload.standings : [];
  if(rows.length !== expectedTeams) return null;
  const parsed = rows.map(row => {
    const wins = number(row.wins), losses = number(row.losses), ties = number(row.ties);
    const games = wins + losses + ties;
    return {
      name: String(row.owner || '').trim(), games, wins, losses, ties,
      pointsFor: number(row.pointsFor), pointsAgainst: number(row.pointsAgainst)
    };
  });
  if(parsed.some(row => !row.name || row.games <= 0) || new Set(parsed.map(row => row.games)).size !== 1) return null;

  const pfpg = parsed.map(row => row.pointsFor / row.games);
  const papg = parsed.map(row => row.pointsAgainst / row.games);
  const minPF = Math.min(...pfpg), maxPF = Math.max(...pfpg);
  const games = parsed[0].games;
  // Legacy blend schedule: Week 1 carries about 15%, growing to 70% by Week 13.
  // Kept for reference and reporting only. Ratings now blend with the
  // evidence-based reliability weight from scoringParameters() (see
  // scoreBlend) so 2026 scoring is not shrunk twice.
  const weight = Math.min(0.70, 0.10 + (0.60 * games / 13));

  return {
    games,
    week: Number(payload.week) || games,
    weight,
    ratings: new Map(parsed.map((row, index) => {
      const record = (row.wins + 0.5 * row.ties) / row.games;
      // The in-season component is points scored only. Record and points
      // against stay on the row for display; they no longer move the rating
      // (both mostly reflect who a team happened to play).
      const offense = scale(pfpg[index], minPF, maxPF);
      const rating = 100 * offense;
      return [row.name, {...row, record, pfpg: pfpg[index], papg: papg[index], offense, rating}];
    }))
  };
}

export function blendRating(preseasonRating, current, weight){
  if(!current || !Number.isFinite(current.rating)) return preseasonRating;
  return ((1 - weight) * preseasonRating) + (weight * current.rating);
}

// ---------------------------------------------------------------------------
// Score-based in-season model (Szn 10 odds-model update).
//
// Every quantity below is in fantasy points per week unless noted. The model
// treats each manager's weekly score as Normal(mu_i, SIGMA) and estimates mu_i
// from 2026 points scored, shrunk toward the league mean by how much a few
// weeks of scoring can actually tell us. Record and points against are
// deliberately excluded: both are mostly opponent noise in a head-to-head
// fantasy league, and record is already carried into the simulation as the
// starting win total.
// ---------------------------------------------------------------------------

export const REGULAR_SEASON_WEEKS = 14;
export const TALENT_HISTORY_FROM = 2021; // seasons used for SIGMA's bracket half and TAU

const mean = values => values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
const populationSd = values => {
  const average = mean(values);
  return Math.sqrt(mean(values.map(value => (value - average) ** 2)));
};
const recordGames = record => String(record ?? '').split('-').reduce((sum, part) => sum + (Number(part) || 0), 0);

function seasonPointsPerGame(seasons){
  return (Array.isArray(seasons) ? seasons : [])
    .filter(season => Array.isArray(season?.[4]))
    .map(season => ({
      year: Number(season[0]),
      rows: season[4]
        .map(row => ({owner: String(row?.[3] || '').trim(), pfpg: Number(row?.[5]) / (recordGames(row?.[4]) || NaN)}))
        .filter(row => row.owner && Number.isFinite(row.pfpg))
    }))
    .filter(season => season.rows.length >= 4)
    .sort((a, b) => a.year - b.year);
}

// Scores from completed playoff/placement games (byes and unplayed slots excluded).
function historicalGameScores(playoffs, fromYear){
  const scores = [];
  for(const season of Array.isArray(playoffs) ? playoffs : []){
    if(Number(season?.[0]) < fromYear || !Array.isArray(season?.[6])) continue;
    for(const game of season[6]){
      const [, bracket, , isBye, , , , homeScore, , , , awayScore] = game || [];
      if(isBye || !['championship', 'placement'].includes(bracket)) continue;
      if(Number.isFinite(homeScore) && Number.isFinite(awayScore)) scores.push(homeScore, awayScore);
    }
  }
  return scores;
}

/**
 * Evidence-based scoring parameters, matching the method used for the
 * independent Week 3/4 odds review (sim.mjs):
 *   SIGMA  week-to-week SD of one team's score = average of (a) the pooled
 *          within-team SD of completed 2026 weeks and (b) the SD of every
 *          2021+ playoff/placement score (rounded to 0.1). With fewer than two
 *          completed weeks, (b) alone.
 *   TAU    SD of true team scoring rates = sqrt(mean over 2021+ seasons of the
 *          across-team variance of PF/G, minus the SIGMA^2/14 that pure weekly
 *          noise adds to a 14-game average).
 *   w      reliability of n games of PF/G = n*TAU^2 / (n*TAU^2 + SIGMA^2)
 *          (the standard normal-normal shrinkage weight). The in-season
 *          estimate is leagueMean + w * (PF/G - leagueMean).
 *   posteriorSd  remaining uncertainty in a team's true rate:
 *          sqrt(1 / (1/TAU^2 + n/SIGMA^2)).
 *   preseasonCorrelation (rho)  how well a pre-season estimate predicts true
 *          scoring rate, measured from league history: the year-to-year
 *          correlation r of season-centered PF/G (every consecutive-season
 *          pair in seasons.json) divided by sqrt(reliability of a 14-game
 *          season). Preseason ratings are mapped to rho*TAU points per
 *          preseason SD so they cannot claim more spread than history supports.
 *          Clamped to [0.1, 1] so the rating scale never collapses.
 */
export function scoringParameters({seasons, playoffs, weeklyScores = [], pointsPerGame = [], gamesPlayed = 0} = {}){
  const history = seasonPointsPerGame(seasons);
  const completeWeeks = (Array.isArray(weeklyScores) ? weeklyScores : [])
    .filter(week => Array.isArray(week) && week.length >= 4 && week.every(Number.isFinite));
  const teamCount = completeWeeks[0]?.length || 0;
  let pooledWithinSd = null;
  if(completeWeeks.length >= 2 && completeWeeks.every(week => week.length === teamCount)){
    let squares = 0;
    for(let team = 0; team < teamCount; team++){
      const values = completeWeeks.map(week => week[team]);
      const average = mean(values);
      squares += values.reduce((sum, value) => sum + (value - average) ** 2, 0);
    }
    pooledWithinSd = Math.sqrt(squares / (teamCount * (completeWeeks.length - 1)));
  }
  const bracketScores = historicalGameScores(playoffs, TALENT_HISTORY_FROM);
  const historicalGameSd = bracketScores.length >= 10 ? populationSd(bracketScores) : null;
  const sigmaParts = [pooledWithinSd, historicalGameSd].filter(Number.isFinite);
  const sigma = sigmaParts.length ? Math.round(mean(sigmaParts) * 10) / 10 : 26.5;

  const talentSeasons = history.filter(season => season.year >= TALENT_HISTORY_FROM);
  const observedBetweenVar = talentSeasons.length
    ? mean(talentSeasons.map(season => populationSd(season.rows.map(row => row.pfpg)) ** 2))
    : 6.4 ** 2 + sigma ** 2 / REGULAR_SEASON_WEEKS;
  const tau = Math.sqrt(Math.max(observedBetweenVar - sigma ** 2 / REGULAR_SEASON_WEEKS, 1));

  const n = Math.max(0, Number(gamesPlayed) || 0);
  const reliabilityWeight = (n * tau ** 2) / (n * tau ** 2 + sigma ** 2);
  const posteriorSd = Math.sqrt(1 / (1 / tau ** 2 + n / sigma ** 2));

  const finitePpg = (Array.isArray(pointsPerGame) ? pointsPerGame : []).filter(Number.isFinite);
  const latest = history[history.length - 1];
  const leagueMean = n > 0 && finitePpg.length ? mean(finitePpg) : latest ? mean(latest.rows.map(row => row.pfpg)) : 118;

  const pairs = [];
  for(let index = 1; index < history.length; index++){
    const before = history[index - 1], after = history[index];
    if(after.year !== before.year + 1) continue;
    const beforeMean = mean(before.rows.map(row => row.pfpg));
    const afterMean = mean(after.rows.map(row => row.pfpg));
    const next = new Map(after.rows.map(row => [row.owner, row.pfpg - afterMean]));
    before.rows.forEach(row => { if(next.has(row.owner)) pairs.push([row.pfpg - beforeMean, next.get(row.owner)]); });
  }
  let yearToYearCorrelation = null;
  if(pairs.length >= 10){
    const xs = pairs.map(pair => pair[0]), ys = pairs.map(pair => pair[1]);
    const mx = mean(xs), my = mean(ys);
    const covariance = mean(pairs.map(([x, y]) => (x - mx) * (y - my)));
    yearToYearCorrelation = covariance / (populationSd(xs) * populationSd(ys));
  }
  const seasonReliability = tau ** 2 / (tau ** 2 + sigma ** 2 / REGULAR_SEASON_WEEKS);
  const preseasonCorrelation = Number.isFinite(yearToYearCorrelation)
    ? Math.min(Math.max(yearToYearCorrelation / Math.sqrt(seasonReliability), 0.1), 1)
    : 0.5;

  return {
    leagueMean, sigma, tau, gamesPlayed: n, reliabilityWeight, posteriorSd,
    pooledWithinSd, historicalGameSd, historicalGameCount: bracketScores.length,
    talentSeasons: talentSeasons.map(season => season.year),
    yearToYearCorrelation, yearToYearPairs: pairs.length, seasonReliability, preseasonCorrelation
  };
}

/**
 * Turn preseason ratings plus regressed 2026 scoring into blended ratings and
 * projected weekly means.
 *
 * Rating scale: unchanged preseason units, where one preseason SD equals
 * rho*TAU points of weekly scoring. For each team
 *   inSeason_i   = leagueMean + w * (PF/G_i - leagueMean)          (points)
 *   currentRating_i = preMean + (inSeason_i - leagueMean) * preSd/(rho*TAU)
 *   rating_i     = currentRating_i + (1 - w) * (preseason_i - preMean)
 *                = (1 - w) * preseason_i + w * resultsRating_i
 *   projectedPoints_i = leagueMean + (rating_i - preMean) * rho*TAU/preSd
 * where resultsRating is unregressed PF/G on the rating scale. So the
 * evidence weight w is the only in-season weight: it regresses scoring toward
 * the league mean and hands the rest of the rating back to the preseason view.
 * Using w as the blend weight (instead of the 0.10 + 0.60*g/13 schedule)
 * avoids shrinking 2026 scoring twice.
 */
export function scoreBlend(preseason, current, params){
  const names = [...preseason.keys()];
  const values = names.map(name => preseason.get(name));
  const preMean = mean(values);
  const preSd = populationSd(values) || 1;
  const pointsPerRatingPoint = (params.preseasonCorrelation * params.tau) / preSd;
  const w = current ? params.reliabilityWeight : 0;
  const result = new Map();
  for(const name of names){
    const pre = preseason.get(name);
    const row = current?.ratings.get(name) || null;
    const inSeasonPoints = row ? params.leagueMean + w * (row.pfpg - params.leagueMean) : null;
    const currentRating = row ? preMean + (inSeasonPoints - params.leagueMean) / pointsPerRatingPoint : null;
    const rating = row ? currentRating + (1 - w) * (pre - preMean) : pre;
    const projectedPoints = (row ? inSeasonPoints : params.leagueMean) + (1 - w) * (pre - preMean) * pointsPerRatingPoint;
    result.set(name, {rating, currentRating, inSeasonPoints, projectedPoints});
  }
  return {preMean, preSd, pointsPerRatingPoint, weight: w, ratings: result};
}

// Weekly pairings as sorted "a|b" keys for comparison.
const pairKey = pair => [...pair].map(String).sort().join('|');

/**
 * Infer the full regular-season schedule from the weeks already known.
 *
 * ESPN's 12-team schedules are a circle-method round robin: one fixed team F
 * and eleven teams on a cycle index c in Z11. In week wk (t = (wk-1) mod 11)
 * F plays the team with index t, and every other pair satisfies
 * c_a + c_b = 2t (mod 11). Weeks 12-14 therefore repeat Weeks 1-3. The fit
 * is accepted only when it reproduces every known pairing and all fits that
 * do so agree on every week; otherwise this returns null and the browser uses
 * random round-robin weeks for the unknown slots (the previous behavior).
 *
 * knownWeeks: Map(week -> [[teamA, teamB], ...]) with six pairs per week.
 */
export function inferRoundRobin(teams, knownWeeks, totalWeeks = REGULAR_SEASON_WEEKS){
  const ids = [...teams];
  if(ids.length !== 12) return null;
  const weeks = [...knownWeeks.keys()].map(Number).filter(week => knownWeeks.get(week)?.length === 6).sort((a, b) => a - b);
  if(weeks.length < 2) return null;
  const cycle = ids.length - 1;
  const fits = [];
  for(const fixed of ids){
    const index = new Map();
    let valid = true;
    const opponent = (week, id) => {
      const pair = knownWeeks.get(week).find(game => game.includes(id));
      return pair ? (pair[0] === id ? pair[1] : pair[0]) : null;
    };
    for(const week of weeks){
      const other = opponent(week, fixed);
      const t = (week - 1) % cycle;
      if(other == null || (index.has(other) && index.get(other) !== t)){ valid = false; break; }
      index.set(other, t);
    }
    if(!valid) continue;
    let changed = true;
    while(changed){
      changed = false;
      for(const week of weeks){
        const target = (2 * ((week - 1) % cycle)) % cycle;
        for(const [a, b] of knownWeeks.get(week)){
          if(a === fixed || b === fixed) continue;
          if(index.has(a) && !index.has(b)){ index.set(b, ((target - index.get(a)) % cycle + cycle) % cycle); changed = true; }
          else if(index.has(b) && !index.has(a)){ index.set(a, ((target - index.get(b)) % cycle + cycle) % cycle); changed = true; }
        }
      }
    }
    if(index.size !== cycle || new Set(index.values()).size !== cycle) continue;
    const byIndex = new Map([...index].map(([id, c]) => [c, id]));
    const schedule = new Map();
    for(let week = 1; week <= totalWeeks; week++){
      const t = (week - 1) % cycle, target = (2 * t) % cycle;
      const games = [[fixed, byIndex.get(t)]];
      for(let c = 0; c < cycle; c++){
        const d = ((target - c) % cycle + cycle) % cycle;
        if(c < d && c !== t) games.push([byIndex.get(c), byIndex.get(d)]);
      }
      schedule.set(week, games);
    }
    const reproduces = weeks.every(week => {
      const expected = new Set(knownWeeks.get(week).map(pairKey));
      return schedule.get(week).length === 6 && schedule.get(week).every(game => expected.has(pairKey(game)));
    });
    if(reproduces) fits.push({fixed, schedule});
  }
  if(!fits.length) return null;
  const signature = fit => [...fit.schedule.values()].map(games => games.map(pairKey).sort().join(',')).join(';');
  const first = signature(fits[0]);
  if(fits.some(fit => signature(fit) !== first)) return null;
  return {fixedTeam: fits[0].fixed, fits: fits.length, schedule: fits[0].schedule};
}

// ---------------------------------------------------------------------------
// League-office futures pricing from simulated title probability.
//
// Rule (documented on the board as "Implied % includes the office margin"):
//   1. Start from the title probability p of the seeded season + playoff
//      simulation (the same numbers the Playoffs tab shows).
//   2. Add a proportional office margin: q = p * OFFICE_OVERROUND (1.05), so
//      every club's implied % is about 5% above its fair share and the board
//      sums to roughly 105% before rounding, like a book.
//   3. Convert q to an American price and round to the nearest ladder step:
//      favorites (q >= 50%) to 10; +100..+500 by 25; +500..+1000 by 50;
//      +1000..+2500 by 100; +2500..+5000 by 250.
//   4. Cap long shots at +5000 (1.96% implied). A club the simulation gives
//      less than ~1.9% is shown at the cap, so the cap adds a little extra
//      margin at the bottom of the board.
// ---------------------------------------------------------------------------
export const OFFICE_OVERROUND = 1.05;
export const LONG_SHOT_CAP = 5000;

export function priceFromProbability(probability, {overround = OFFICE_OVERROUND, cap = LONG_SHOT_CAP} = {}){
  const p = Number.isFinite(probability) ? Math.max(probability, 0) : 0;
  const floor = 100 / (cap + 100);
  const q = Math.min(Math.max(p * overround, floor), 0.99);
  if(q >= 0.5){
    const raw = (100 * q) / (1 - q);
    return -Math.max(100, Math.round(raw / 10) * 10);
  }
  const raw = (100 * (1 - q)) / q;
  const step = raw < 500 ? 25 : raw < 1000 ? 50 : raw < 2500 ? 100 : 250;
  return Math.min(Math.max(Math.round(raw / step) * step, 100), cap);
}

export function formatAmericanOdds(price){
  return price > 0 ? `+${price}` : String(price);
}

// ---------------------------------------------------------------------------
// Plain-language method note for both odds boards, filled from build output.
// audience 'home' quotes the house edge on prices; 'playoffs' explains the
// per-card points and points to Home for prices.
// ---------------------------------------------------------------------------
const percent = value => `${Math.round(value * 100)}%`;

export function methodShares(gamesPlayed, scoringWeight){
  const scoring = gamesPlayed > 0 ? Math.round(Math.min(Math.max(scoringWeight, 0), 1) * 100) : 0;
  return {preseason: 100 - scoring, scoring};
}

export function oddsMethodNote({gamesPlayed = 0, scoringWeight = 0, rosterWeight = 0, simulations, houseEdge, randomWeeks = 0} = {}, audience = 'home'){
  const {preseason, scoring} = methodShares(gamesPlayed, scoringWeight);
  const career = 'career form (recent and career win %, scoring vs. league, playoff finishes)';
  const preseasonLine = rosterWeight > 0
    ? `Preseason: ${percent(1 - rosterWeight)} ${career} + ${percent(rosterWeight)} post-draft roster (2026 draft ranks).`
    : `Preseason: ${career}.`;
  const split = gamesPlayed > 0
    ? `After Week ${gamesPlayed}, preseason carries ${preseason}% of each rating and 2026 scoring ${scoring}%.`
    : 'No 2026 games are final yet, so ratings are 100% preseason.';
  const schedule = randomWeeks > 0
    ? `on the league schedule (random pairings for ${randomWeeks} unconfirmed week${randomWeeks === 1 ? '' : 's'})`
    : 'on the real schedule';
  const runs = Number(simulations).toLocaleString('en-US');
  const edge = `${Math.round(houseEdge * 100)}% house edge`;
  return [
    'Each rating blends a preseason rating with 2026 scoring.',
    preseasonLine,
    '2026 scoring: points per game, pulled toward the league average while the sample is small; its share grows each week.',
    split,
    `The rest of the season is simulated ${runs} times ${schedule}; standings ties go to points for; six-team bracket, top two seeds get byes.`,
    audience === 'playoffs'
      ? `Each card shows points per week: preseason, 2026, and the blend the simulation uses. Home's futures prices add a ${edge}.`
      : `Prices include a ${edge}.`
  ].join(' ');
}
