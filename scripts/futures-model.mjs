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
  const minPA = Math.min(...papg), maxPA = Math.max(...papg);
  const games = parsed[0].games;
  // Week 1 carries about 15% of the rating. The live season grows to 70%
  // by Week 13, keeping early outliers from erasing the preseason baseline.
  const weight = Math.min(0.70, 0.10 + (0.60 * games / 13));

  return {
    games,
    week: Number(payload.week) || games,
    weight,
    ratings: new Map(parsed.map((row, index) => {
      const record = (row.wins + 0.5 * row.ties) / row.games;
      const offense = scale(pfpg[index], minPF, maxPF);
      // Points against is schedule context, not "defense" in fantasy. A team
      // that faced more points receives a small difficulty adjustment.
      const schedule = scale(papg[index], minPA, maxPA);
      const rating = 100 * (0.45 * record + 0.40 * offense + 0.15 * schedule);
      return [row.name, {...row, record, pfpg: pfpg[index], papg: papg[index], offense, schedule, rating}];
    }))
  };
}

export function blendRating(preseasonRating, current, weight){
  if(!current || !Number.isFinite(current.rating)) return preseasonRating;
  return ((1 - weight) * preseasonRating) + (weight * current.rating);
}
