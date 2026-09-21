import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const root = new URL('../', import.meta.url);
const context = {window:{}, document:{}};
runInNewContext(readFileSync(new URL('js/shared.js', root), 'utf8'), context);
const {normalizeSeason, normalizeMember, normalizeDraftSeason} = context.window.gateShared;

const compact = normalizeSeason([2025, 5, 'Shiesty Szn', '8-6', 1686.08, 1565.66]);
assert.equal(compact.year, 2025);
assert.equal(compact.finish, 5);
assert.equal(compact.team, 'Shiesty Szn');
assert.equal(compact.record, '8-6');
assert.equal(compact.pointsFor, 1686.08);
assert.equal(compact.pointsAgainst, 1565.66);

const named = normalizeSeason({year:2025, finish:5, team:'Shiesty Szn', record:'8-6', pointsFor:1686.08, pointsAgainst:1565.66});
assert.deepEqual(
  {year:named.year, finish:named.finish, team:named.team, record:named.record, pointsFor:named.pointsFor, pointsAgainst:named.pointsAgainst},
  {year:compact.year, finish:compact.finish, team:compact.team, record:compact.record, pointsFor:compact.pointsFor, pointsAgainst:compact.pointsAgainst}
);

const members = JSON.parse(readFileSync(new URL('data/members.json', root), 'utf8'));
assert.equal(members.schemaVersion, 2);
assert.equal(members.provenance?.kind, 'canonical');
const travis = members.members.find(member => member.number === '01');
assert.equal(travis.id, 'mgr-01');
assert.equal(typeof travis.seasons[0], 'object');
assert.ok(!Array.isArray(travis.seasons[0]));
assert.equal(travis.seasons.at(-1).id, 'mgr-01-2025');
assert.equal(travis.seasons.at(-1).team, 'Shiesty Szn');

const normalized = normalizeMember(travis);
assert.equal(normalized.id, 'mgr-01');
assert.equal(normalized.seasons.at(-1).id, 'mgr-01-2025');

const fromCompact = normalizeMember({number:'01', name:'George Travis', seasons:[[2025,5,'Shiesty Szn','8-6',1686.08,1565.66]]});
assert.equal(fromCompact.id, 'mgr-01');
assert.equal(fromCompact.seasons[0].id, 'mgr-01-2025');
assert.equal(fromCompact.seasons[0].team, 'Shiesty Szn');

const drafts = JSON.parse(readFileSync(new URL('data/drafts/index.json', root), 'utf8'));
assert.equal(drafts.schemaVersion, 2);
const szn10 = drafts.seasons.map(normalizeDraftSeason).find(row => row.year === 2026);
assert.equal(szn10.id, 'draft-2026');
assert.equal(szn10.picks, 192);
assert.equal(szn10.keepers, 12);
assert.deepEqual(normalizeDraftSeason([2026,'1048 Gate Szn 10',12,192]), szn10);

console.log('Phase 8 named records: compact arrays, named member seasons, and draft index checks passed.');
