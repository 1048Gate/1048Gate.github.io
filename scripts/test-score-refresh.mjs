import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const fixture=JSON.parse(readFileSync(new URL('../data/current-season.json',import.meta.url),'utf8'));
let now=Date.parse(fixture.fetchedAt)+7200000;
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const element=()=>({innerHTML:'',textContent:'',dataset:{},disabled:false,children:[],handlers:{},
  classList:{toggle(){},contains:()=>true},setAttribute(){},removeAttribute(){},replaceChildren(...children){this.children=children;},append(child){this.children.push(child);},addEventListener(name,fn){this.handlers[name]=fn;}});
const games=element(),standings=element(),stamp=element(),board=element(),button=element(),status=element(),heading=element(),home=element();
board.querySelector=()=>stamp;board.dataset={weekSeason:String(fixture.season),week:String(fixture.week)};
const listeners={},pending=[],storage=new Map();
const nodes={weekBoard:board,refreshScores:button,scoreRefreshStatus:status,home};
const context={URL,Date:Clock,window:{location:{origin:'https://example.test'},addEventListener(){},setInterval:()=>1,clearInterval(){},scrollTo(){throw new Error('Score refresh must not scroll');},localStorage:{setItem:(key,value)=>storage.set(key,value),getItem:key=>storage.get(key)||null}},
  document:{baseURI:'https://example.test/',visibilityState:'visible',activeElement:null,
    addEventListener:(name,fn)=>{listeners[name]=fn;},dispatchEvent(){},
    getElementById:id=>nodes[id]||null,
    querySelector:selector=>({'[data-week-matchups]':games,'[data-week-standings]':standings,'[data-week-stamp]':stamp})[selector]||null,
    querySelectorAll:selector=>selector==='[data-week-heading], #weekBoard h2'?[heading]:[],
    createTextNode:text=>({textContent:text}),createElement:()=>element()},
  fetch:url=>{if(String(url).endsWith('site.json'))return new Promise(()=>{});assert.match(String(url),/\/data\/(?:current-season|homepage-week)\.json$/);return new Promise((resolve,reject)=>pending.push({url,resolve,reject}));},
  CustomEvent:class{},console:{warn(){}}};
for(const name of ['shared','data-loader','freshness','week-board','site-ui'])runInNewContext(readFileSync(new URL(`../js/${name}.js`,import.meta.url),'utf8'),context,{filename:`js/${name}.js`});
const freshness=context.window.gateFreshness,api=context.window.gateScoreRefresh;
const config=(season=fixture.season,week=fixture.week)=>({seasonYear:season,phase:`Week ${week}`});
const data=(season=fixture.season,week=fixture.week)=>({...structuredClone(fixture),season,week,phase:`Week ${week}`,fetchedAt:new Clock(now-1000).toISOString(),matchups:fixture.matchups.map(game=>({...structuredClone(game),week,state:'live'}))});
const respond=(value,index=pending.length-1)=>pending[index].resolve(Response.json(value));
const tick=()=>new Promise(setImmediate);
context.window.gateSiteConfig=config();
context.renderWeekBoardFrom(fixture);
const one=api.refresh(),two=api.refresh();assert.equal(one,two);assert.equal(pending.length,1);assert.equal(button.disabled,true);
const live=data();live.matchups[0].away.score=222.5;respond(live);assert.equal(await one,true);
assert.equal(button.disabled,false);assert.match(games.innerHTML,/222\.50/);assert.match(status.textContent,/File retrieved/);
assert.match(stamp.children[0].textContent,/Collected/);
await api.refresh();assert.equal(pending.length,1,'minimum interval prevents repeated requests');
now+=60001;const finished=data();finished.matchups.forEach(game=>game.state='final');const finish=api.refresh();respond(finished);await finish;
assert.ok(context.window.gateHomeBoard.matchups.every(game=>game.state==='final'));assert.match(stamp.children[0].textContent,/Final/);
const validHtml=games.innerHTML;
for(const kind of ['network','malformed','wrong-week','wrong-season','incomplete','duplicate','missing-live-score','projection-mismatch','older','missing-time']){
  now+=60001;const work=api.refresh();const bad=data();
  if(kind==='network')pending.at(-1).reject(new Error('offline'));
  else if(kind==='malformed')pending.at(-1).resolve(new Response('{bad'));
  else{
    if(kind==='wrong-week')bad.week++;
    if(kind==='wrong-season')bad.season--;
    if(kind==='incomplete')bad.matchups.pop();
    if(kind==='duplicate')bad.standings[1].teamId=bad.standings[0].teamId;
    if(kind==='missing-live-score')bad.matchups[0].away.score=null;
    if(kind==='projection-mismatch')bad.teamProjections[0].projectedScore+=1;
    if(kind==='older')bad.fetchedAt=fixture.fetchedAt;
    if(kind==='missing-time')delete bad.fetchedAt;
    respond(bad);
  }
  assert.equal(await work,false,kind);assert.equal(games.innerHTML,validHtml,kind);assert.match(status.textContent,/Keeping the last valid scores/);
}
// Retained projections keep the real timestamp and stale label on scheduled cards.
now+=60001;const stale=data();stale.projectionsStale=true;stale.matchups.forEach(game=>game.state='scheduled');const staleWork=api.refresh();respond(stale);await staleWork;
assert.equal(context.window.gateHomeBoard.projectionsFetchedAt,fixture.projectionsFetchedAt);assert.match(games.innerHTML,/Saved ESPN projections · stale/);
// Return after five minutes: one published-file request, never while hidden.
context.document.visibilityState='hidden';now+=300000;const count=pending.length;listeners.visibilitychange();await api.refresh();assert.equal(pending.length,count);
context.document.visibilityState='visible';listeners.visibilitychange();listeners.visibilitychange();assert.equal(pending.length,count+1);respond(data());await tick();await tick();
// Rapid period changes: newest successful state survives late successes and failures.
now+=60001;context.window.gateSiteConfig=config(2024);const old=api.refresh();const oldIndex=pending.length-1;
context.window.gateSiteConfig=config(2025);const middle=api.refresh();const middleIndex=pending.length-1;
context.window.gateSiteConfig=config(2024);const latest=api.refresh();respond(data(2024));await latest;
respond(data(2024),oldIndex);pending[middleIndex].reject(new Error('obsolete request failed'));await Promise.all([old,middle]);
assert.equal(context.window.gateHomeBoard.season,2024);assert.doesNotMatch(status.textContent,/Refresh unavailable/);
now+=60001;const inPlaceOld=api.refresh();const inPlaceIndex=pending.length-1;
context.window.gateSiteConfig.phase=`Week ${fixture.week+1}`;
const inPlaceNew=api.refresh();respond(data(2024,fixture.week+1));await inPlaceNew;
respond(data(2024),inPlaceIndex);await inPlaceOld;assert.equal(context.window.gateHomeBoard.week,fixture.week+1);
// Reject a rollback of projections even if the public score collection is newer.
now+=60001;const projectionNew=data(2024,fixture.week+1);projectionNew.projectionsFetchedAt=new Clock(now-2000).toISOString();
const projectionWork=api.refresh();respond(projectionNew);await projectionWork;
now+=60001;const projectionOld=api.refresh();respond(data(2024,fixture.week+1));assert.equal(await projectionOld,false);
assert.equal(context.window.gateHomeBoard.projectionsFetchedAt,projectionNew.projectionsFetchedAt);
now+=60001;
const startup=context.renderWeekBoard();
const startupData={...data(2024,fixture.week+1),league_pulse:[],projectionsFetchedAt:projectionNew.projectionsFetchedAt};
respond(startupData);assert.equal(await startup,true);
const startupCount=pending.length;
assert.equal(await api.refresh(),false);
assert.equal(pending.length,startupCount,'Startup is a score check and must obey the same minimum interval');
const invalid=structuredClone(fixture);invalid.matchups[0].away.score=Infinity;assert.equal(freshness.validScoreboard(invalid),false);
for(const shape of ['standings','matchups','teamProjections']){
  const malformed=structuredClone(fixture);malformed[shape][0]=null;
  assert.equal(freshness.validScoreboard(malformed),false,`${shape} null rows must fail safely, including cached files`);
}
assert.equal(freshness.validScoreboard({...fixture,fetchedAt:'2026-10-17T12:00:00'}),false,'Ambiguous timestamps cannot acquire the browser timezone');
assert.equal(freshness.validScoreboard(fixture),true);
console.log('Score refresh: real loader/validator/rendering passed live/final, cooldown, concurrent/visible/hidden requests, bad data preservation, stale projections, rapid periods and late responses.');
