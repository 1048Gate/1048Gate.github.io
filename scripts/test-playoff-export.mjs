import { readFileSync } from 'node:fs';

const seasons = JSON.parse(readFileSync(new URL('../data/seasons.json', import.meta.url), 'utf8')).seasons;
const playoffs = JSON.parse(readFileSync(new URL('../data/playoffs.json', import.meta.url), 'utf8')).seasons;

if (!Array.isArray(seasons) || !Array.isArray(playoffs)) {
  throw new Error('Historical season/playoff exports must contain seasons arrays.');
}

const seasonByYear = new Map(seasons.map(row => [Number(row[0]), row]));
const playoffByYear = new Map(playoffs.map(row => [Number(row[0]), row]));

for (const [year, season] of seasonByYear) {
  const playoff = playoffByYear.get(year);
  if (!playoff) throw new Error(`Missing playoff export for ${year}.`);

  const standings = season[4] || [];
  const seedByTeam = new Map(standings.map(row => [String(row[2]).replace(/\s+/g, ' ').trim(), Number(row[1])]));
  const champion = standings.find(row => Number(row[1]) === 1);
  if (!champion) throw new Error(`Missing regular-season #1 seed for ${year}.`);
  if (String(playoff[1]).trim() !== String(season[2]).trim() || String(playoff[2]).trim() !== String(season[3]).trim()) {
    throw new Error(`Champion mismatch for ${year}: ${playoff[1]} / ${playoff[2]} vs ${season[2]} / ${season[3]}.`);
  }

  const games = playoff[6] || [];
  if (games.length !== 19) throw new Error(`Expected 19 postseason rows for ${year}; found ${games.length}.`);
  const bracketCounts = games.reduce((counts, row) => {
    counts[row[1]] = (counts[row[1]] || 0) + 1;
    return counts;
  }, {});
  for (const [bracket, expected] of [['championship', 7], ['placement', 3], ['consolation', 9]]) {
    if (bracketCounts[bracket] !== expected) {
      throw new Error(`${year} ${bracket} rows: expected ${expected}, found ${bracketCounts[bracket] || 0}.`);
    }
  }
  if (bracketCounts.legacy) throw new Error(`Unclassified legacy playoff rows remain for ${year}.`);

  for (const row of games) {
    const homeName = String(row[5] || '').replace(/\s+/g, ' ').trim();
    const awayName = String(row[9] || '').replace(/\s+/g, ' ').trim();
    if (row[4] !== null && seedByTeam.get(homeName) !== Number(row[4])) {
      throw new Error(`${year} home seed mismatch for ${homeName}: ${row[4]}.`);
    }
    if (row[8] !== null && seedByTeam.get(awayName) !== Number(row[8])) {
      throw new Error(`${year} away seed mismatch for ${awayName}: ${row[8]}.`);
    }
  }
}

if (playoffByYear.size !== seasonByYear.size) throw new Error('Playoff export contains an unsupported season.');
console.log(`Playoff export checks passed for ${seasonByYear.size} seasons.`);
