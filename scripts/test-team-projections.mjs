import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const esc=v=>String(v??'').replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
const context={window:{gateShared:{escapeHtml:esc}},document:{addEventListener(){}}};
runInNewContext(readFileSync(new URL('../js/team-projections.js',import.meta.url),'utf8'),context);
const render=context.window.gateTeamProjections.teamHtml;
const board={week:5,standings:[{teamId:10,owner:'Collin',team:'Team <test>'}],teamProjections:[{teamId:10,complete:true,projectedScore:123.45,starters:[{name:'<script>',lineup_slot:'RB',projected_points:0}]}]};
const html=render(board,'Collin');
assert.match(html,/123.45 projected points/);
assert.match(html,/Team &lt;test&gt;/);
assert.doesNotMatch(html,/&lt;script&gt;|<table>|lineup_slot/);
assert.doesNotMatch(html,/<script>/);
board.teamProjections[0].projectedScore=0;
assert.match(render(board,'Collin'),/0.00 projected points/);
assert.match(render(board,'Other'),/unavailable/);
board.projectionsStale=true;
board.projectionsFetchedAt='2026-09-09T10:00:00Z';
assert.match(render(board,'Collin'),/Stale projection snapshot · Refresh unavailable/);
assert.match(render(board,'Collin'),/Sep 9/);
board.projectionsStale=false;
assert.doesNotMatch(render(board,'Collin'),/Refresh unavailable/);
board.teamProjections[0].complete=false;board.teamProjections[0].projectedScore=null;
assert.match(render(board,'Collin'),/Incomplete lineup/);
assert.doesNotMatch(render(board,'Collin'),/0.00 projected points/);
// The standalone projections page must retain the source date and stale label too.
for(const stale of [true,false]){
  const elements={projectionStatus:{},projectionTable:{}};
  const page={window:{},document:{getElementById:id=>elements[id]},
    fetch:async()=>({ok:true,json:async()=>({...board,season:2026,projectionsStale:stale})}),Intl,Date};
  runInNewContext(readFileSync(new URL('../js/shared.js',import.meta.url),'utf8'),page);
  await runInNewContext(readFileSync(new URL('../js/player-projections.js',import.meta.url),'utf8'),page);
  assert.match(elements.projectionStatus.textContent,/Sep 9, 2026/);
  assert.equal(elements.projectionStatus.textContent.includes('Refresh unavailable'),stale);
}
console.log('Team projections: starter totals, zero points, missing data, HTML escaping, and retained snapshot labels passed.');
