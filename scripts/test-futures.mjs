import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {blendRating, currentSeasonRatings} from './futures-model.mjs';

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

const browserSource = readFileSync(new URL('../js/title-odds.js', import.meta.url), 'utf8');
assert.match(browserSource, /team\.wins \+ 0\.5 \* team\.ties/, 'Playoff simulations must begin with actual wins.');
assert.match(browserSource, /GAMES_PER_SEASON - gamesPlayed/, 'Playoff simulations must only project remaining games.');

console.log('Futures checks passed: weekly results blend, early-season restraint, incomplete-board fallback, and weight cap.');
