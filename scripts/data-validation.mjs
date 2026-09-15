const WEEKLY_BASIS = 'weekly-results-blend';
const PRESEASON_BASES = new Set(['post-draft', 'career']);

function requireCondition(condition, message){
  if(!condition) throw new Error(message);
}

export function validateSeasonState(siteConfig, currentSeason){
  requireCondition(
    currentSeason?.season === siteConfig?.seasonYear && Number.isInteger(currentSeason?.week) && currentSeason.week > 0,
    'current-season.json must match the configured season and include a positive week.'
  );
  requireCondition(
    currentSeason.phase === `Week ${currentSeason.week}`,
    'current-season.json phase must match its week.'
  );
  requireCondition(
    siteConfig.phase === currentSeason.phase,
    'data/site.json phase must match the current-season board.'
  );
  requireCondition(
    siteConfig.draftNight?.status === 'complete',
    'The current season must retain a completed draft night.'
  );
}

export function validatePowerRankings(powerRankings, siteConfig, currentSeason){
  const ratings = powerRankings?.ratings;
  const allowedBasis = PRESEASON_BASES.has(powerRankings?.basis) || powerRankings?.basis === WEEKLY_BASIS;
  requireCondition(
    powerRankings?.schemaVersion === 1 && powerRankings.generatedForSeason === siteConfig?.seasonNumber && allowedBasis,
    'Power rankings must use a supported basis for the configured season.'
  );
  requireCondition(
    Array.isArray(ratings) && ratings.length === 12 && new Set(ratings.map(row => row?.name)).size === 12,
    'Power rankings must include 12 uniquely named managers.'
  );
  requireCondition(
    ratings.every(row => row?.name && Number.isFinite(row.rating) && Number.isFinite(row.preseasonRating)),
    'Every power ranking must include a manager, rating, and preseason rating.'
  );

  if(powerRankings.basis === WEEKLY_BASIS){
    const snapshot = powerRankings.currentSeason;
    requireCondition(
      snapshot?.season === siteConfig.seasonYear && snapshot.throughWeek === currentSeason.week,
      'Weekly power rankings must identify the current season and week.'
    );
    requireCondition(
      Number.isInteger(snapshot.gamesPlayed) && snapshot.gamesPlayed > 0 && snapshot.gamesPlayed <= snapshot.throughWeek &&
        Number.isFinite(snapshot.weight) && snapshot.weight > 0 && snapshot.weight <= 0.70,
      'Weekly power rankings must include a valid games-played count and blend weight.'
    );
    requireCondition(
      ratings.every(row => Number.isFinite(row.currentRating) && Number.isInteger(row.wins) && Number.isInteger(row.losses) && Number.isInteger(row.ties)),
      'Weekly power rankings must include current ratings and records for all managers.'
    );
  } else {
    requireCondition(
      powerRankings.currentSeason == null,
      'Preseason power rankings must not claim a current-season results snapshot.'
    );
  }
}
