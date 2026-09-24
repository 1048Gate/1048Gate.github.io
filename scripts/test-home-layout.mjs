import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const context = {window:{}, document:{getElementById:()=>null, querySelector:()=>null, addEventListener:()=>{}}};
runInNewContext(readFileSync(new URL('../js/home-layout.js', import.meta.url), 'utf8'), context);
const {stateFor} = context.window.gateHomeLayout;
const config = {seasonYear:2026, phase:'Week 2'};
const board = {season:2026, week:2, matchups:[{state:'final'},{state:'live'}]};
const edition = {season:2026, week:2, source_status:'verified_final', validation_status:'valid'};
assert.equal(stateFor(config, board, edition), 'live');
const final = {...board, matchups:[{state:'final'},{state:'final'}]};
assert.equal(stateFor(config, final, edition), 'recap');
for(const patch of [{week:1}, {season:2025}, {source_status:'verified_live'}, {validation_status:'invalid'}]){
  assert.equal(stateFor(config, final, {...edition, ...patch}), 'final');
}
assert.equal(stateFor(config, final, null), 'final');
assert.equal(stateFor(config, {...board, matchups:[{state:'final'}, {state:'scheduled'}]}, edition), 'upcoming');
assert.equal(stateFor(undefined, board, edition), 'unknown');
assert.equal(stateFor(config, {...board, matchups:[]}, edition), 'upcoming');
assert.equal(stateFor(config, {...board, matchups:[{state:'scheduled'}]}, edition), 'upcoming');
assert.equal(stateFor(config, {...board, season:2025}, edition), 'unknown');
assert.equal(stateFor(config, null, edition), 'unknown');
for(const phase of ['Pre-Season','Offseason','Off-season','Draft']){
  assert.equal(stateFor({...config, phase}, board, edition), 'offseason');
}
console.log('Homepage hierarchy: live, upcoming, final, verified recap, offseason, and stale/missing data checks passed.');
