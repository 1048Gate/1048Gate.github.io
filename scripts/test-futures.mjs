import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {blendRating, currentSeasonRatings, inferRoundRobin, scoreBlend, scoringParameters} from './futures-model.mjs';

const owners = Array.from({length:12}, (_, index) => `Manager ${index + 1}`);
const standings = owners.map((owner, index) => ({
  owner,
  wins: index < 6 ? 1 : 0,
  losses: index < 6 ? 0 : 1,
  ties: 0,
  pointsFor: 160 - index * 8,
  pointsAgainst: 70 + index * 7
}));

const weekOne = currentSeasonRatings({week:1, standings});
assert.ok(weekOne, 'A complete final standings table should produce current-season ratings.');
assert.equal(weekOne.games, 1);
assert.equal(weekOne.ratings.size, 12);
assert.ok(weekOne.weight > 0.14 && weekOne.weight < 0.15, 'Week 1 should have a restrained influence.');
assert.ok(weekOne.ratings.get('Manager 1').rating > weekOne.ratings.get('Manager 12').rating);

const blended = blendRating(50, {rating:100}, weekOne.weight);
assert.ok(blended > 57 && blended < 58, 'A strong Week 1 should move, not replace, a 50-point baseline.');
assert.equal(blendRating(50, null, weekOne.weight), 50);

assert.equal(currentSeasonRatings({week:1, standings: standings.slice(0,11)}), null, 'Incomplete leagues must keep preseason odds.');
assert.equal(currentSeasonRatings({week:1, standings: standings.map(row => ({...row,wins:0,losses:0}))}), null, 'Live 0-0 standings must keep preseason odds.');

const weekThirteen = currentSeasonRatings({week:13, standings: standings.map(row => ({...row,wins:row.wins*13,losses:row.losses*13,pointsFor:row.pointsFor*13,pointsAgainst:row.pointsAgainst*13}))});
assert.equal(weekThirteen.weight, 0.70, 'Current results should cap at 70% of the rating.');

// In-season component: points scored only. Same PF, different record and PA => same rating.
const flipped = standings.map((row, index) => index === 0 ? {...row, wins:0, losses:1, pointsAgainst:200} : index === 11 ? {...row, pointsFor:160, wins:1, losses:0} : row);
const flippedRatings = currentSeasonRatings({week:1, standings: flipped});
assert.equal(flippedRatings.ratings.get('Manager 1').rating, flippedRatings.ratings.get('Manager 12').rating, 'Record and points against must not move the in-season rating.');

// Evidence weight w = n*TAU^2 / (n*TAU^2 + SIGMA^2) and its posterior SD.
const seasons = [2021, 2022, 2023, 2024, 2025].map((year, s) => [year, 0, 0, 0, owners.map((owner, index) => [index + 1, index + 1, `Team ${index}`, owner, '7-7', 14 * (110 + ((index * 5 + s * 3) % 12) * 2)])]);
const playoffs = [[2025, '', '', '', '', [], Array.from({length:10}, (_, index) => [15, 'championship', 'Quarterfinals', 0, 1, 'A', 'x', 90 + index * 6, 2, 'B', 'y', 150 - index * 5])]];
const fourWeeks = Array.from({length:4}, (_, week) => owners.map((_, index) => 100 + index * 3 + (week % 2 ? 9 : -9)));
const params = scoringParameters({seasons, playoffs, weeklyScores: fourWeeks, pointsPerGame: owners.map((_, index) => 100 + index * 3), gamesPlayed: 4});
const expectedWeight = (4 * params.tau ** 2) / (4 * params.tau ** 2 + params.sigma ** 2);
assert.ok(Math.abs(params.reliabilityWeight - expectedWeight) < 1e-12, 'Reliability weight must follow n*TAU^2/(n*TAU^2+SIGMA^2).');
assert.ok(Math.abs(params.posteriorSd - Math.sqrt(1 / (1 / params.tau ** 2 + 4 / params.sigma ** 2))) < 1e-12);
assert.ok(params.sigma > 0 && params.tau > 0 && params.preseasonCorrelation >= 0 && params.preseasonCorrelation <= 1);
assert.equal(scoringParameters({seasons, playoffs, gamesPlayed: 0}).reliabilityWeight, 0, 'No games means no in-season weight.');

// Blend: preseason unchanged with no current season; higher PF/G lifts the rating by w, not by a fixed schedule.
const preseason = new Map(owners.map((owner, index) => [owner, 40 + (index % 4) * 5]));
const noCurrent = scoreBlend(preseason, null, params);
assert.equal(noCurrent.ratings.get('Manager 3').rating, preseason.get('Manager 3'));
const flat = new Map(owners.map(owner => [owner, 45]));
const blendCurrent = currentSeasonRatings({week:4, standings: standings.map(row => ({...row, wins:row.wins * 4, losses:row.losses * 4, pointsFor:row.pointsFor * 4, pointsAgainst:row.pointsAgainst * 4}))});
const flatBlend = scoreBlend(flat, blendCurrent, {...params, leagueMean: 116});
assert.ok(flatBlend.ratings.get('Manager 1').projectedPoints > flatBlend.ratings.get('Manager 12').projectedPoints);
const top = flatBlend.ratings.get('Manager 1');
assert.ok(Math.abs(top.inSeasonPoints - (116 + params.reliabilityWeight * (160 - 116))) < 1e-9, 'In-season points must regress PF/G toward the league mean by w.');

// Schedule inference recovers a circle-method round robin and refuses contradictions.
const cycleOrder = owners.slice(1);
const circleWeek = week => {
  const t = (week - 1) % 11, target = (2 * t) % 11;
  const games = [[owners[0], cycleOrder[t]]];
  for(let c = 0; c < 11; c++){ const d = ((target - c) % 11 + 11) % 11; if(c < d && c !== t) games.push([cycleOrder[c], cycleOrder[d]]); }
  return games;
};
const known = new Map([1, 2, 3, 4, 5].map(week => [week, circleWeek(week)]));
const inferredSchedule = inferRoundRobin(owners, known);
assert.ok(inferredSchedule, 'A circle-method schedule must be inferable from five known weeks.');
const key = games => games.map(pair => [...pair].sort().join('|')).sort().join(',');
for(let week = 1; week <= 14; week++) assert.equal(key(inferredSchedule.schedule.get(week)), key(circleWeek(week)), `Week ${week} must match the rotation.`);
const broken = new Map(known);
broken.set(5, [...circleWeek(5).slice(0, 4), [circleWeek(5)[4][0], circleWeek(5)[5][0]], [circleWeek(5)[4][1], circleWeek(5)[5][1]]]);
assert.equal(inferRoundRobin(owners, broken), null, 'A schedule that contradicts the rotation must fall back.');

const browserSource = readFileSync(new URL('../js/title-odds.js', import.meta.url), 'utf8');
assert.match(browserSource, /team\.wins \+ 0\.5 \* team\.ties/, 'Playoff simulations must begin with actual wins.');
assert.match(browserSource, /GAMES_PER_SEASON - gamesPlayed/, 'Playoff simulations must only project remaining games.');

// Browser simulation: zero-sum totals and the points-for seeding tiebreak.
const sandbox = {module:{exports:{}}};
vm.createContext(sandbox);
vm.runInContext(browserSource, sandbox);
const oddsModel = sandbox.module.exports;
const simTeams = owners.map((name, index) => ({name, points: 120 - index, wins: 7, ties: 0, pointsFor: 1700 - index * 10}));
const finished = oddsModel.simulate(simTeams, {gamesPlayed: 14, sigma: 26.5, posteriorSd: 5, simulations: 2000, seed: 7});
assert.deepEqual([...finished.bye].map(count => count / 2000), [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'Tied records must seed by points for.');
assert.deepEqual([...finished.made].map(count => count / 2000), [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0]);
const midseason = oddsModel.simulate(simTeams.map(team => ({...team, wins: 2, pointsFor: 480})), {gamesPlayed: 4, sigma: 26.5, posteriorSd: 5, simulations: 2000, seed: 9, weeks: [1, 2, 3, 4, 5].map(week => circleWeek(week).map(pair => pair.map(name => owners.indexOf(name))))});
const total = values => [...values].reduce((sum, value) => sum + value, 0) / 2000;
assert.equal(total(midseason.made), 6);
assert.equal(total(midseason.bye), 2);
assert.equal(total(midseason.title), 1);

console.log('Futures checks passed: weekly results blend, PF-only in-season ratings, evidence weight, schedule inference, PF tiebreak seeding, and incomplete-board fallback.');
