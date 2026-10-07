import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {LONG_SHOT_CAP, blendRating, methodShares, oddsMethodNote, currentSeasonRatings, formatAmericanOdds, inferRoundRobin, priceFromProbability, scoreBlend, scoringParameters} from './futures-model.mjs';

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

// Futures pricing rule: title% x 1.05, American odds, ladder rounding, +5000 cap.
assert.equal(priceFromProbability(0.187), 400);
assert.equal(priceFromProbability(0.148), 550);
assert.equal(priceFromProbability(0.055), 1600);
assert.equal(priceFromProbability(0.022), 4250);
assert.equal(priceFromProbability(0.001), LONG_SHOT_CAP);
assert.equal(priceFromProbability(0), LONG_SHOT_CAP);
assert.equal(priceFromProbability(0.6), -170);
assert.equal(formatAmericanOdds(-170), '-170');
assert.equal(formatAmericanOdds(400), '+400');
for(let p = 0.005; p < 0.9; p += 0.005){
  const shorter = priceFromProbability(p + 0.005), longer = priceFromProbability(p);
  const implied = price => price > 0 ? 100 / (price + 100) : -price / (100 - price);
  assert.ok(implied(shorter) >= implied(longer), `Prices must shorten as title probability rises (p=${p.toFixed(3)}).`);
}

// Checked-in board: priced from the stored simulation, in Playoffs-tab order.
const siteData = JSON.parse(readFileSync(new URL('../data/site.json', import.meta.url), 'utf8'));
const rankingsData = JSON.parse(readFileSync(new URL('../data/power-rankings.json', import.meta.url), 'utf8'));
const projection = rankingsData.projection;
assert.ok(projection && projection.teams.length === 12, 'power-rankings.json must carry the simulated projection.');
const projected = new Map(projection.teams.map(row => [row.name, row]));
const sumOf = key => projection.teams.reduce((sum, row) => sum + row[key], 0);
assert.ok(Math.abs(sumOf('title') - 1) < 1e-9 && Math.abs(sumOf('bye') - 2) < 1e-9 && Math.abs(sumOf('playoff') - 6) < 1e-9);
assert.deepEqual(siteData.futures.map(row => row.name), [...projection.teams].sort((a, b) => b.title - a.title || b.playoff - a.playoff).map(row => row.name).slice(0, siteData.futures.length), 'Futures board order must follow simulated title odds.');
siteData.futures.forEach(row => assert.equal(row.odds, formatAmericanOdds(priceFromProbability(projected.get(row.name).title)), `${row.name} price must come from the simulation.`));
const recomputed = oddsModel.probabilities(oddsModel.prepare({...rankingsData, projection: undefined}), {});
oddsModel.prepare(rankingsData).teams.forEach((team, index) => {
  assert.equal(recomputed.title[index], projected.get(team.name).title, `Browser simulation must reproduce the stored projection for ${team.name}.`);
});

// AI-desk footnote: identical on the homepage board (static HTML) and the Playoffs tab.
const homepageHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const siteUiSource = readFileSync(new URL('../js/site-ui.js', import.meta.url), 'utf8');
assert.match(oddsModel.AI_FOOTNOTE, /^\* Computer-generated .* 10,000-run season simulation\./);
assert.ok(homepageHtml.includes(`data-futures-footnote>${oddsModel.AI_FOOTNOTE}</p>`), 'Homepage odds board must carry the same AI-desk footnote as the Playoffs tab.');
assert.ok(siteUiSource.includes('Odds<span class="odds-asterisk" aria-hidden="true">*</span>'), 'Homepage price column must carry the footnote asterisk.');
assert.ok(browserSource.includes('title-odds-footnote') && browserSource.includes('Playoff Probability Board<span class="odds-asterisk"'), 'Playoffs tab must carry the asterisk and footnote.');

// Method note: plain-language explanation filled from build output.
const sampleNote = oddsMethodNote({gamesPlayed: 4, scoringWeight: 0.1887, rosterWeight: 0.55, simulations: 10000, houseEdge: 0.05}, 'home');
assert.match(sampleNote, /After Week 4, preseason carries 81% of each rating and 2026 scoring 19%\./);
assert.match(sampleNote, /45% career form .* \+ 55% post-draft roster/);
assert.match(sampleNote, /simulated 10,000 times on the real schedule; standings ties go to points for; six-team bracket, top two seeds get byes\. Prices include a 5% house edge\.$/);
assert.match(oddsMethodNote({gamesPlayed: 0, scoringWeight: 0, rosterWeight: 0.55, simulations: 10000, houseEdge: 0.05}), /100% preseason/);
assert.match(oddsMethodNote({gamesPlayed: 3, scoringWeight: 0.15, simulations: 10000, houseEdge: 0.05, randomWeeks: 2}, 'playoffs'), /random pairings for 2 unconfirmed weeks.*Home's futures prices add a 5% house edge\.$/);
const liveShares = methodShares(rankingsData.currentSeason?.gamesPlayed || 0, rankingsData.scoring.reliabilityWeight);
const splitText = rankingsData.currentSeason
  ? `After Week ${rankingsData.currentSeason.gamesPlayed}, preseason carries ${liveShares.preseason}% of each rating and 2026 scoring ${liveShares.scoring}%.`
  : 'ratings are 100% preseason';
assert.ok(siteData.futuresMethod?.text.includes(splitText), 'Homepage method note must quote the current blend weight.');
assert.ok(rankingsData.method?.text.includes(splitText), 'Playoffs method note must quote the current blend weight.');
assert.equal(liveShares.scoring, Math.round(rankingsData.currentSeason.weight * 100), 'Quoted 2026 share must match the blend weight.');
assert.ok(siteData.futuresMethod.text.includes(`${projection.simulations.toLocaleString('en-US')} times`));
const w = rankingsData.scoring.reliabilityWeight;
rankingsData.ratings.forEach(row => assert.ok(Math.abs((1 - w) * row.preseasonPoints + w * row.pointsForPerGame - row.projectedPoints) < 0.02, `${row.name}: blend must equal (1-w)*preseason + w*2026 points.`));
assert.ok(homepageHtml.includes('data-futures-method-details') && homepageHtml.includes('data-futures-method-text') && siteUiSource.includes('config.futuresMethod?.text'), 'Homepage must render the method note from site.json.');

// Render the Playoffs tab against the checked-in data with a minimal DOM stub.
const rendered = {host: null};
const domStub = {
  querySelector: selector => selector === '#playoffs .playoff-toolbar' ? {insertAdjacentElement: (_, element) => { rendered.host = element; }} : null,
  createElement: () => ({classList: {remove(){}}, addEventListener(){}, innerHTML: ''})
};
const domSandbox = {document: domStub, window: {gateShared: {escapeHtml: value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}}, fetch: async () => ({ok: true, json: async () => rankingsData}), console};
vm.createContext(domSandbox);
vm.runInContext(browserSource, domSandbox);
await new Promise(resolve => setTimeout(resolve, 50));
const tabHtml = rendered.host?.innerHTML || '';
assert.ok(tabHtml.includes('data-odds-method') && tabHtml.includes(rankingsData.method.text.replace(/&/g, '&amp;')), 'Playoffs tab must render the method note.');
assert.ok(tabHtml.includes(splitText), 'Playoffs tab note must show the current split.');
const firstRow = rankingsData.ratings[0];
assert.ok(tabHtml.includes(`Pts/wk · Pre ${firstRow.preseasonPoints.toFixed(1)}`), 'Cards must show preseason and 2026 points per week.');
assert.ok(tabHtml.includes(oddsModel.AI_FOOTNOTE), 'Playoffs tab must keep the AI-desk footnote.');

console.log('Futures checks passed: weekly results blend, PF-only in-season ratings, evidence weight, schedule inference, PF tiebreak seeding, simulation-priced futures board, method note, and incomplete-board fallback.');
