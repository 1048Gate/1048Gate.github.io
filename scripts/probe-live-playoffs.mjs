#!/usr/bin/env node

const baseUrl = (process.argv[2] || process.env.SITE_URL || 'https://1048gate.github.io').replace(/\/$/, '');
const artifactUrl = `${baseUrl}/data/playoffs.json`;
const timeoutMs = Number(process.env.PROBE_TIMEOUT_MS || 10000);

function fail(message) {
  console.error(`LIVE PLAYOFF PROBE FAILED: ${message}`);
  process.exitCode = 1;
}

try {
  const response = await fetch(artifactUrl, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${artifactUrl}`);

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('json')) {
    throw new Error(`unexpected content type: ${contentType || 'missing'}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload.seasons)) throw new Error('payload.seasons is not an array');

  const season = payload.seasons.find(row => Number(row?.[0]) === 2025);
  if (!season) throw new Error('2025 season is missing');
  if (!Array.isArray(season[6])) throw new Error('2025 playoff games are missing');
  if (season[6].length !== 19) throw new Error(`2025 playoff row count is ${season[6].length}, expected 19`);

  const counts = season[6].reduce((result, row) => {
    const bracket = row?.[1];
    result[bracket] = (result[bracket] || 0) + 1;
    return result;
  }, {});
  for (const [bracket, expected] of [['championship', 7], ['placement', 3], ['consolation', 9]]) {
    if (counts[bracket] !== expected) {
      throw new Error(`2025 ${bracket} row count is ${counts[bracket] || 0}, expected ${expected}`);
    }
  }
  if (counts.legacy) throw new Error('2025 contains unclassified legacy playoff rows');

  const expectedSeeds = new Map([
    ['Darty at 1048', 7],
    ['Jigalos Jims', 8],
    ['Buckle Up', 11],
    ['Lamb Fried Rice', 12],
    ["Ja'Marr-a-Lago", 9],
    ['Team Hash', 10],
  ]);
  const observed = new Map();
  for (const row of season[6]) {
    for (const [seedIndex, nameIndex] of [[4, 5], [8, 9]]) {
      const name = row?.[nameIndex];
      if (expectedSeeds.has(name)) {
        const seed = Number(row[seedIndex]);
        if (observed.has(name) && observed.get(name) !== seed) {
          throw new Error(`${name} changes seed from ${observed.get(name)} to ${seed}`);
        }
        observed.set(name, seed);
      }
    }
  }
  for (const [name, expected] of expectedSeeds) {
    if (observed.get(name) !== expected) {
      throw new Error(`${name} has seed ${observed.get(name) ?? 'missing'}, expected ${expected}`);
    }
  }

  console.log(`LIVE PLAYOFF PROBE PASSED: ${artifactUrl}`);
  console.log(`2025 rows=${season[6].length}; championship=${counts.championship}; placement=${counts.placement}; consolation=${counts.consolation}`);
  console.log([...expectedSeeds].map(([name, seed]) => `${name}=${seed}`).join(', '));
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
