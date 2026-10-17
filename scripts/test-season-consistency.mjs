import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=name=>readFileSync(new URL(`../js/${name}.js`,import.meta.url),'utf8');
const tick=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function element(dataset={}){
  return {dataset,innerHTML:'',textContent:'',value:'',hidden:false,handlers:{},
    classList:{toggle(){},contains(){return false;},add(){},remove(){}},
    addEventListener(name,fn){this.handlers[name]=fn;},appendChild(){},insertBefore(){}};
}
async function historyTest(){
  const panel=element(),button=element(),tbody=element(),thead=element(),empty=element(),pos=element(),search=element();
  const modes=['career','season'].map(x=>element({playerMode:x}));
  const years=[2024,2025,2023].map(x=>element({playerYear:String(x)}));
  const subnav=element(),panels=element();subnav.querySelector=()=>null;panels.querySelector=()=>null;
  const shell=element();shell.querySelector=s=>s==='.history-subnav'?subnav:s==='.history-tab-panels'?panels:null;shell.querySelectorAll=()=>[];
  panel.querySelector=s=>({'tbody':tbody,'thead':thead,'.player-empty':empty,'.player-pos':pos,'.player-search':search,'.player-year-nav':element()})[s];
  panel.querySelectorAll=s=>s==='[data-player-mode]'?modes:years;
  const requests=[];
  const context={window:{},document:{querySelector:()=>shell,createElement:tag=>tag==='button'?button:panel},console:{error(){}},
    fetch:url=>{if(url.endsWith('index.json'))return Promise.resolve({ok:true,json:async()=>({years:[2024,2025,2023]})});const request=deferred();requests.push({url,...request});return request.promise;}};
  runInNewContext(source('shared'),context);runInNewContext(source('player-history'),context);
  button.handlers.click();await tick();modes[1].handlers.click();
  const respond=(i,year,name)=>requests[i].resolve({ok:true,json:async()=>({year,players:[[1,name,'QB',10,1,1,10,1,'Team','Owner']]})});
  respond(0,2024,'2024 player');await tick();assert.match(tbody.innerHTML,/2024 player/);
  years[1].handlers.click();await tick();
  assert.doesNotMatch(tbody.innerHTML,/2024 player/,'selecting 2025 must immediately clear 2024 data');
  years[0].handlers.click();await tick();respond(2,2024,'latest 2024');await tick();respond(1,2025,'late 2025');await tick();
  assert.match(tbody.innerHTML,/latest 2024/);assert.doesNotMatch(tbody.innerHTML,/late 2025/);
  years[1].handlers.click();await tick();respond(3,2024,'wrong file');await tick();
  assert.equal(tbody.innerHTML,'');assert.match(empty.textContent,/2025.*unavailable/i);
  years[2].handlers.click();await tick();requests[4].resolve({ok:false,status:404});await tick();
  assert.equal(tbody.innerHTML,'');assert.match(empty.textContent,/2023.*unavailable/i);
  years[0].handlers.click();await tick();requests[5].reject(new Error('offline'));await tick();
  assert.equal(tbody.innerHTML,'');assert.match(empty.textContent,/2024.*unavailable/i);
  years[0].handlers.click();await tick();respond(6,2024,'recovered');await tick();assert.match(tbody.innerHTML,/recovered/);
}
async function pulseTest(){
  const listeners={},requests=[],card={outerHTML:''},host={innerHTML:''};
  const context={window:{addEventListener:(n,fn)=>{listeners[n]=fn;}},
    document:{addEventListener:(n,fn)=>{listeners[n]=fn;},getElementById:()=>null,
      querySelector:s=>s==='[data-pulse-card="transactions"]'?card:s==='[data-league-pulse]'?host:null},
    fetch:async()=>({ok:false}),console:{warn(){}}};
  context.window.gateSupabase={rpc:(name,args)=>{const request=deferred();requests.push({args,...request});return request.promise;}};
  runInNewContext(source('shared'),context);runInNewContext(source('league-pulse'),context);await tick();
  assert.equal(requests.length,0,'transactions must wait for validated season configuration');
  context.window.gateSiteConfig={seasonYear:2024};listeners['gate:site-ready']();await tick();
  assert.equal(requests[0].args.p_season_year,2024);assert.equal(requests[0].args.p_sort,'newest');
  context.window.gateSiteConfig={seasonYear:2025};listeners['gate:site-ready']();await tick();
  assert.equal(requests[1].args.p_season_year,2025);
  requests[1].resolve({data:{items:[{season_year:2025,team_name:'current team',transaction_type:'WAIVER'}]}});await tick();
  assert.match(card.outerHTML,/current team/);assert.match(card.outerHTML,/2025/);
  requests[0].resolve({data:{items:[{season_year:2024,team_name:'obsolete team'}]}});await tick();assert.doesNotMatch(card.outerHTML,/obsolete/);
  context.window.gateSiteConfig={seasonYear:2026};listeners['gate:site-ready']();await tick();
  requests[2].resolve({data:{items:[{season_year:2025,team_name:'wrong season'}]}});await tick();assert.doesNotMatch(card.outerHTML,/wrong season|current team/);
  context.window.gateSiteConfig={seasonYear:'2025'};listeners['gate:site-ready']();await tick();assert.equal(requests.length,3);
}
async function archiveTest(){
  const nodes=new Map(),listeners={},requests=[];
  const node=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  node('transactionSeason').value='all';node('transactionSort').value='newest';
  const context={window:{location:{hash:'#transactions'},addEventListener(){}},
    document:{getElementById:node,querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(n,fn)=>{listeners[n]=fn;}},
    URLSearchParams,history:{replaceState(){}},setTimeout,clearTimeout,console:{error(){}}};
  context.window.gateSupabase={rpc:async(name,args)=>{
    if(name==='get_transaction_archive_seasons')return {data:[{season_year:2025},{season_year:2024}]};
    if(args.p_page_size===1)return {data:{total_count:0,items:[]}};
    const request=deferred();requests.push({args,...request});return request.promise;
  }};
  runInNewContext(source('shared'),context);runInNewContext(source('transactions'),context);
  listeners['gate:viewchange']({detail:{name:'transactions'}});await tick();
  node('transactionSeason').value='2024';node('transactionSeason').handlers.change();await tick();
  node('transactionSeason').value='2025';node('transactionSeason').handlers.change();await tick();
  assert.deepEqual(requests.map(x=>x.args.p_season_year),[null,2024,2025]);
  requests[2].resolve({data:{items:[],total_count:25}});await tick();assert.match(node('transactionResultCount').textContent,/^25 /);
  requests[1].resolve({data:{items:[],total_count:24}});requests[0].reject(new Error('old failed request'));await tick();
  assert.match(node('transactionResultCount').textContent,/^25 /);assert.doesNotMatch(node('transactionFeed').innerHTML,/unavailable/);
  node('transactionSeason').value='2024';node('transactionSeason').handlers.change();await tick();
  requests[3].resolve({data:{items:[{season_year:2025,team_name:'wrong season'}],total_count:1}});await tick();
  assert.match(node('transactionFeed').innerHTML,/unavailable/);assert.doesNotMatch(node('transactionFeed').innerHTML,/wrong season/);
  const count=requests.length;node('transactionSeason').value='';node('transactionSeason').handlers.change();await tick();assert.equal(requests.length,count);
}
async function weekBoundaryTest(){
  const requests=[],rendered=[],board=element(),games=element();board.dataset={weekSeason:'2025',week:'2'};
  const context={window:{addEventListener(){},localStorage:{getItem:()=>null,setItem(){}}},
    document:{querySelector:s=>s==='[data-week-matchups]'?games:null,querySelectorAll:()=>[],getElementById:id=>id==='weekBoard'?board:null,dispatchEvent(){}},
    CustomEvent:class{},console:{warn(){}},fetch:url=>{
      if(url==='data/site.json')return new Promise(()=>{});
      const request=deferred();requests.push({url,...request});return request.promise;
    }};
  board.querySelector=()=>null;
  runInNewContext(source('freshness'),context);runInNewContext(source('site-ui'),context);
  const actualRender=context.renderWeekBoardFrom;
  context.renderWeekBoardFrom=payload=>rendered.push(payload);
  const payload=(season,week)=>({season,week,matchups:Array.from({length:6},()=>({week})),standings:Array.from({length:12},()=>({})),league_pulse:[]});
  const respond=(i,data)=>requests[i].resolve({ok:true,json:async()=>data});
  context.window.gateSiteConfig={seasonYear:2026,phase:'Week 2'};
  const pending=context.renderWeekBoard();await tick();respond(0,payload(2025,2));await tick();
  assert.equal(requests[1].url,'data/current-season.json');respond(1,payload(2026,1));await pending;
  assert.equal(rendered.length,0,'wrong-season home file and wrong-week current file must not render');
  assert.equal(board.dataset.weekSource,'unavailable');assert.match(games.textContent,/temporarily unavailable/);
  const old=context.renderWeekBoard();await tick();
  context.window.gateSiteConfig={seasonYear:2026,phase:'Week 3'};
  const latest=context.renderWeekBoard();await tick();respond(3,payload(2026,3));await latest;
  respond(2,payload(2026,2));await old;
  assert.equal(rendered.length,1);assert.equal(rendered[0].week,3);
  assert.equal(context.window.gateHomepageWeek.week,3,'late file must not overwrite the derived payload cache');
  context.renderWeekBoardFrom=actualRender;
  actualRender(payload(2026,3));
  assert.equal(board.dataset.weekSeason,'2026');assert.equal(board.dataset.week,'3');
  context.window.gateSiteConfig={seasonYear:2026,phase:'Week 2'};
  const failed=context.renderWeekBoard();await tick();
  requests[4].resolve({ok:false});await tick();requests[5].resolve({ok:false,status:503});await failed;
  assert.equal(board.dataset.weekSource,'unavailable');assert.equal(context.window.gateHomeBoard,null);
}
await historyTest();await pulseTest();await archiveTest();await weekBoundaryTest();
console.log('Season consistency: history races, wrong/missing/failed files, recovery, configuration readiness, transaction invalidation and labels passed.');
