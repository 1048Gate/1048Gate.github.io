import assert from 'node:assert/strict';
import {validatePowerRankings, validateSeasonState} from './data-validation.mjs';

const siteConfig = {
  seasonYear: 2026,
  seasonNumber: 10,
  phase: 'Week 2',
  draftNight: {status: 'complete'}
};
const currentSeason = {season: 2026, week: 2, phase: 'Week 2'};
const ratings = Array.from({length: 12}, (_, index) => ({
  name: `Manager ${index + 1}`,
  rating: 60 - index,
  preseasonRating: 55 - index
}));

assert.doesNotThrow(() => validateSeasonState(siteConfig, currentSeason));
assert.throws(
  () => validateSeasonState({...siteConfig, phase: 'Week 1'}, currentSeason),
  /phase must match the current-season board/
);

assert.doesNotThrow(() => validatePowerRankings({
  schemaVersion: 1,
  generatedForSeason: 10,
  basis: 'post-draft',
  currentSeason: null,
  ratings
}, siteConfig, currentSeason));

const weeklyRatings = ratings.map((row, index) => ({
  ...row,
  currentRating: 75 - index,
  wins: index < 6 ? 1 : 0,
  losses: index < 6 ? 0 : 1,
  ties: 0
}));
assert.doesNotThrow(() => validatePowerRankings({
  schemaVersion: 1,
  generatedForSeason: 10,
  basis: 'weekly-results-blend',
  currentSeason: {season: 2026, throughWeek: 2, gamesPlayed: 1, weight: 0.146},
  ratings: weeklyRatings
}, siteConfig, currentSeason));
assert.throws(
  () => validatePowerRankings({
    schemaVersion: 1,
    generatedForSeason: 10,
    basis: 'weekly-results-blend',
    currentSeason: {season: 2026, throughWeek: 1, gamesPlayed: 1, weight: 0.146},
    ratings: weeklyRatings
  }, siteConfig, currentSeason),
  /current season and week/
);
assert.throws(
  () => validatePowerRankings({schemaVersion: 1, generatedForSeason: 10, basis: 'manual', ratings}, siteConfig, currentSeason),
  /supported basis/
);

console.log('Data validation checks passed: advancing weeks and weekly-results rankings are accepted safely.');
