import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const dom={
  host:{innerHTML:''},
  section:{dataset:{}},
  status:{textContent:''},
  weekBoard:{dataset:{weekSource:'saved'}}
};
const context={
  window:{gateShared:{escapeHtml:value=>String(value??'')},addEventListener(){}},
  document:{
    addEventListener(){},querySelectorAll(){return []},
    querySelector(selector){
      if(selector==='[data-league-pulse]') return dom.host;
      if(selector==='[data-pulse-status]') return dom.status;
      return null;
    },
    getElementById(id){
      if(id==='leaguePulse') return dom.section;
      if(id==='weekBoard') return dom.weekBoard;
      return null;
    }
  },
  fetch:async()=>({ok:false}),
  console
};
runInNewContext(readFileSync(new URL('../js/league-pulse.js',import.meta.url),'utf8'),context,{filename:'js/league-pulse.js'});
const pulse=context.window.gateLeaguePulse;

const config={seasonNumber:10,seasonYear:2026,phase:'Week 2',futures:[{name:'Favorite Manager',odds:'+300'}],draftOrder:Array.from({length:12},(_,index)=>({pick:index+1}))};
const standings=Array.from({length:12},(_,index)=>({owner:`Manager ${index+1}`,team:`Team ${index+1}`,wins:index<6?1:0,losses:index<6?0:1,pointsFor:200-index*8}));
const matchups=Array.from({length:6},(_,index)=>({state:'live',away:{owner:`Away ${index}`,team:`Away Team ${index}`,score:100+index},home:{owner:`Home ${index}`,team:`Home Team ${index}`,score:index===3?102.5:90-index}}));
const currentSeasonScores=standings.map((team,index)=>({owner:team.owner,team:team.team,week:1,score:index<6?120:90,opponentScore:index<6?90:120}));
const archive={records:{highestScore:[235.64,'Record Holder','Record Team','Opponent','Opponent Team',2022,8,0]},currentSeasonScores,leaderboards:{winningStreaks:[{manager:'Historic Manager',games:8,season:2021}]}};

const cards=pulse.buildCards({config,board:{week:2,standings,matchups},archive});
assert.deepEqual(Array.from(cards,card=>card.id),['matchup','playoff','transactions','odds','record','streak']);
assert.equal(cards.find(card=>card.id==='odds').title,'Favorite Manager +300');
assert.match(cards.find(card=>card.id==='playoff').title,/Manager 6 holds No\. 6/);
assert.match(cards.find(card=>card.id==='matchup').detail,/0\.5 points apart · Live/);
assert.match(cards.find(card=>card.id==='record').detail,/130\.6 shy of the 235\.6 all-time mark/);
assert.equal(cards.find(card=>card.id==='streak').title,'6 teams opened 1–0');

const moving=standings.map((team,index)=>({...team,previousRank:index+1}));
moving[0].previousRank=4;
const movement=pulse.buildCards({config,board:{week:2,standings:moving,matchups},archive}).find(card=>card.id==='playoff');
assert.equal(movement.label,'Playoff movement');
assert.match(movement.title,/↑3 to No\. 1/);

const offseason=pulse.buildCards({config:{...config,phase:'Offseason'},board:{week:2,standings,matchups},archive});
assert.deepEqual(Array.from(offseason,card=>card.id),['draft','transactions','odds','record','streak']);
assert.equal(offseason.find(card=>card.id==='record').title,'Record Holder · 235.6');
assert.ok(!offseason.some(card=>['playoff','matchup'].includes(card.id)));

const archiveFailure=pulse.buildCards({config,board:{week:2,standings,matchups},archive:{}});
assert.deepEqual(Array.from(archiveFailure,card=>card.id),['matchup','playoff','transactions','odds','record','streak']);
assert.deepEqual(Array.from(archiveFailure.filter(card=>['record','streak'].includes(card.id)),card=>[card.label,card.view]),[
  ['Record book','intel'],
  ['Streak history','intel']
]);
const offseasonArchiveFailure=pulse.buildCards({config:{...config,phase:'Offseason'},board:{week:2,standings,matchups},archive:{}});
assert.deepEqual(Array.from(offseasonArchiveFailure,card=>card.id),['draft','transactions','odds','record','streak']);

context.window.gateSiteConfig=config;
context.window.gateHomeBoard={week:2,standings,matchups};
await pulse.refresh();
assert.equal(dom.section.dataset.pulseSource,'saved');
assert.equal(dom.status.textContent,'Saved league read');
assert.equal((dom.host.innerHTML.match(/data-pulse-card=/g)||[]).length,6);

const transaction=pulse.transactionCard({transaction_type:'WAIVER',team_name:'Team Hash',items:[{item_type:'ADD',player_name:'Example Player',to_team_name:'Team Hash'}]});
assert.equal(transaction.title,'Team Hash · Waiver claim');
assert.equal(transaction.detail,'Example Player · added to Team Hash');
assert.equal(transaction.view,'transactions');

console.log('League Pulse checks passed: core cards, saved-board provenance, archive-failure fallbacks, offseason, and transaction enrichment.');
