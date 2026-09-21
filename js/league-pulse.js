/* Phase 6: a compact current-league read assembled from existing trusted data. */
(function(){
  const clean=value=>String(value??'').trim().replace(/\s+/g,' ');
  const number=value=>{
    const parsed=Number(value);
    if(!Number.isFinite(parsed)) return '—';
    return Number.isInteger(parsed)?String(parsed):parsed.toFixed(1).replace(/\.0$/,'');
  };
  const record=team=>{
    const wins=Number(team?.wins||0),losses=Number(team?.losses||0),ties=Number(team?.ties||0);
    return ties?`${wins}-${losses}-${ties}`:`${wins}-${losses}`;
  };
  const standings=rows=>[...(Array.isArray(rows)?rows:[])].sort((a,b)=>{
    const winDiff=(Number(b.wins||0)+.5*Number(b.ties||0))-(Number(a.wins||0)+.5*Number(a.ties||0));
    return winDiff||Number(b.pointsFor||0)-Number(a.pointsFor||0);
  });
  const sides=board=>(Array.isArray(board?.matchups)?board.matchups:[]).flatMap(game=>[
    {...game.away,state:game.state,opponent:game.home},
    {...game.home,state:game.state,opponent:game.away}
  ]);
  const isOffseason=config=>/pre[ -]?season|off[ -]?season|draft|keeper/i.test(config?.phase||'');

  function oddsCard(config){
    const favorite=Array.isArray(config?.futures)?config.futures[0]:null;
    if(!favorite?.name||!favorite?.odds) return null;
    return {id:'odds',label:'Odds board',title:`${favorite.name} ${favorite.odds}`,detail:'The current championship favorite. Open the full board for every club.',scrollTo:'championshipOdds'};
  }

  function playoffCard(board){
    const table=standings(board?.standings);
    if(table.length<7) return null;
    const mover=table
      .map((team,index)=>({...team,rank:index+1,move:Number(team.previousRank||0)-(index+1)}))
      .filter(team=>team.previousRank&&team.move)
      .sort((a,b)=>Math.abs(b.move)-Math.abs(a.move))[0];
    if(mover){
      const arrow=mover.move>0?'↑':'↓';
      return {id:'playoff',label:'Playoff movement',title:`${clean(mover.owner||mover.team)} ${arrow}${Math.abs(mover.move)} to No. ${mover.rank}`,detail:`${record(mover)} · ${number(mover.pointsFor)} points for`,scrollTo:'weekBoard'};
    }
    const inTeam=table[5],outTeam=table[6];
    return {id:'playoff',label:'Playoff line',title:`${clean(inTeam.owner||inTeam.team)} holds No. 6`,detail:`${record(inTeam)} at the cut · ${clean(outTeam.owner||outTeam.team)} is next`,scrollTo:'weekBoard'};
  }

  function matchupCard(board){
    const games=(Array.isArray(board?.matchups)?board.matchups:[]).filter(game=>game?.away&&game?.home);
    if(!games.length) return null;
    const active=games.filter(game=>game.state==='live');
    const pool=active.length?active:games.filter(game=>game.state==='final');
    if(!pool.length){
      return {id:'matchup',label:'On deck',title:`${games.length} matchups posted`,detail:`Week ${board.week||'—'} is ready on the league board.`,scrollTo:'weekBoard'};
    }
    const closest=[...pool].sort((a,b)=>Math.abs(Number(a.away.score||0)-Number(a.home.score||0))-Math.abs(Number(b.away.score||0)-Number(b.home.score||0)))[0];
    const margin=Math.abs(Number(closest.away.score||0)-Number(closest.home.score||0));
    const state=closest.state==='live'?'Live':'Final';
    return {id:'matchup',label:active.length?'Game watch':'Closest finish',title:`${clean(closest.away.team)} / ${clean(closest.home.team)}`,detail:`${number(margin)} points apart · ${state}`,scrollTo:'weekBoard'};
  }

  function recordCard(board,archive){
    const leader=sides(board).sort((a,b)=>Number(b.score||0)-Number(a.score||0))[0];
    const recordRow=archive?.records?.highestScore;
    const allTime=Number(Array.isArray(recordRow)?recordRow[0]:recordRow?.score);
    if(!Number.isFinite(allTime)) return null;
    if(!leader){
      const holder=clean(Array.isArray(recordRow)?recordRow[1]:recordRow?.owner);
      const season=Array.isArray(recordRow)?recordRow[5]:recordRow?.season;
      return {id:'record',label:'Record book',title:`${holder||'League record'} · ${number(allTime)}`,detail:`Highest single-team week${season?` · ${season}`:''}.`,view:'intel'};
    }
    const score=Number(leader.score||0),gap=allTime-score;
    const final=leader.state==='final';
    let detail=`${number(gap)} shy of the ${number(allTime)} all-time mark`;
    if(gap<0) detail=final?`${number(Math.abs(gap))} above the previous league record`:`Live score · ${number(Math.abs(gap))} above the current record`;
    if(gap===0) detail=final?'Ties the all-time single-week mark':'Live score tied with the all-time mark';
    return {id:'record',label:'Record watch',title:`${clean(leader.owner||leader.team)} · ${number(score)}`,detail,view:'intel'};
  }

  function resultFor(row){
    const score=Number(row?.score),opponent=Number(row?.opponentScore);
    if(!Number.isFinite(score)||!Number.isFinite(opponent)) return '';
    return score===opponent?'T':score>opponent?'W':'L';
  }

  function streakCard(archive){
    const rows=Array.isArray(archive?.currentSeasonScores)?archive.currentSeasonScores:[];
    const byOwner=new Map();
    for(const row of rows){
      const owner=clean(row.owner),result=resultFor(row);
      if(!owner||!result) continue;
      if(!byOwner.has(owner)) byOwner.set(owner,[]);
      byOwner.get(owner).push({...row,result});
    }
    const streaks=[];
    for(const [owner,games] of byOwner){
      games.sort((a,b)=>Number(b.week||0)-Number(a.week||0));
      const type=games[0]?.result;
      let count=0;
      for(const game of games){if(game.result!==type) break;count+=1;}
      if(count) streaks.push({owner,team:games[0].team,type,count});
    }
    streaks.sort((a,b)=>b.count-a.count||a.owner.localeCompare(b.owner));
    if(streaks.length){
      const best=streaks[0],tied=streaks.filter(item=>item.count===best.count&&item.type===best.type);
      if(best.count===1&&best.type==='W'&&tied.length>1){
        return {id:'streak',label:'Form guide',title:`${tied.length} teams opened 1–0`,detail:'The first separation in the table is points for.',scrollTo:'weekBoard'};
      }
      const word=best.type==='W'?'win':best.type==='L'?'loss':'tie';
      return {id:'streak',label:'Form guide',title:`${best.owner} · ${best.count} straight`,detail:`Active ${word} streak for ${clean(best.team||'the current team')}.`,scrollTo:'weekBoard'};
    }
    const historic=archive?.leaderboards?.winningStreaks?.[0];
    if(!historic) return null;
    return {id:'streak',label:'Streak book',title:`${clean(historic.manager)} · ${historic.games} straight`,detail:`League record set in ${historic.season}.`,view:'intel'};
  }

  function draftCard(config){
    const complete=Array.isArray(config?.draftOrder)&&config.draftOrder.length===12;
    return {id:'draft',label:'Draft & keepers',title:complete?`Szn ${config.seasonNumber||''} draft complete`:'The next season is taking shape',detail:'Keeper ledger and draft archive are ready.',view:'league',scrollTo:'membersKeepers'};
  }

  function transactionFallback(){
    return {id:'transactions',label:'Latest moves',title:'Transaction Wire',detail:'Completed adds, waivers, and accepted trades live in the verified archive.',view:'transactions'};
  }

  function buildCards({config={},board={},archive={}}={}){
    const cards=isOffseason(config)
      ? [draftCard(config),oddsCard(config),recordCard(null,archive),streakCard(archive),transactionFallback()]
      : [oddsCard(config),playoffCard(board),matchupCard(board),recordCard(board,archive),streakCard(archive),transactionFallback()];
    return cards.filter(Boolean);
  }

  function transactionCard(row){
    if(!row) return transactionFallback();
    const labels={FREEAGENT:'Add / drop',WAIVER:'Waiver claim',TRADE_ACCEPT:'Accepted trade'};
    const type=labels[row.transaction_type]||clean(row.transaction_type).toLowerCase().replaceAll('_',' ')||'League move';
    const item=Array.isArray(row.items)?row.items[0]:null;
    const player=clean(item?.player_name);
    const route=item?.item_type==='ADD'?`added to ${clean(item.to_team_name||row.team_name||'a roster')}`
      :item?.item_type==='DROP'?`dropped by ${clean(item.from_team_name||row.team_name||'a roster')}`
      :item?.item_type==='TRADE'?`${clean(item.from_team_name||'One team')} → ${clean(item.to_team_name||'another team')}`:'';
    return {id:'transactions',label:'Latest move',title:`${clean(row.team_name||'League activity')} · ${type}`,detail:player?`${player}${route?` · ${route}`:''}`:'Open the verified transaction for full details.',view:'transactions'};
  }

  const api=Object.freeze({buildCards,transactionCard,isOffseason});
  window.gateLeaguePulse=api;

  const esc=value=>(window.gateShared?.escapeHtml||((text)=>String(text??'')))(value);
  let archive=null,archiveRequested=false,transactionRequested=false,latestTransaction=null;

  function cardHtml(card){
    const action=card.view
      ? `<button type="button" data-view-link="${esc(card.view)}"${card.scrollTo?` data-scroll-to="${esc(card.scrollTo)}"`:''}>Open <span aria-hidden="true">→</span></button>`
      :card.scrollTo?`<button type="button" data-scroll-to="${esc(card.scrollTo)}">Open <span aria-hidden="true">→</span></button>`:'';
    return `<article class="league-pulse-card" data-pulse-card="${esc(card.id)}" role="listitem"><span>${esc(card.label)}</span><strong>${esc(card.title)}</strong><p>${esc(card.detail)}</p>${action}</article>`;
  }

  function render(cards,{saved=false}={}){
    const host=document.querySelector('[data-league-pulse]');
    if(!host||!cards.length) return;
    if(latestTransaction) cards=cards.map(card=>card.id==='transactions'?transactionCard(latestTransaction):card);
    host.innerHTML=cards.map(cardHtml).join('');
    const section=document.getElementById('leaguePulse');
    if(section) section.dataset.pulseSource=saved?'saved':'current';
    const status=document.querySelector('[data-pulse-status]');
    if(status) status.textContent=saved?'Saved league read':'Current league read';
  }

  async function loadArchive(){
    if(archiveRequested) return archive;
    archiveRequested=true;
    try{
      const response=await fetch('data/matchups.json',{cache:'no-store'});
      if(response.ok) archive=await response.json();
    }catch(error){console.warn('League Pulse could not refresh matchup history.',error);}
    return archive;
  }

  async function refresh(){
    const config=window.gateSiteConfig;
    const board=window.gateHomeBoard;
    if(!config||!board) return;
    await loadArchive();
    render(buildCards({config,board,archive:archive||{}}));
  }

  async function refreshTransaction(){
    if(transactionRequested) return;
    const supabase=window.gateSupabase||await(window.gateSupabaseReady||Promise.resolve(null));
    if(!supabase) return;
    transactionRequested=true;
    try{
      const {data,error}=await supabase.rpc('get_transaction_archive',{p_page:1,p_page_size:1,p_season_year:Number(window.gateSiteConfig?.seasonYear)||null,p_category:'all',p_search:null,p_sort:'newest'});
      if(error) throw error;
      const row=Array.isArray(data?.items)?data.items[0]:null;
      if(!row) return;
      latestTransaction=row;
      const card=document.querySelector('[data-pulse-card="transactions"]');
      if(card) card.outerHTML=cardHtml(transactionCard(row));
    }catch(error){console.warn('League Pulse could not refresh the latest transaction.',error);}
  }

  function scrollPulse(direction){
    const rail=document.querySelector('[data-league-pulse]');
    const card=rail?.querySelector('.league-pulse-card');
    if(!rail||!card) return;
    rail.scrollBy({left:direction*(card.getBoundingClientRect().width+16),behavior:'smooth'});
  }

  document.addEventListener('click',event=>{
    if(event.target.closest('[data-pulse-prev]')) scrollPulse(-1);
    if(event.target.closest('[data-pulse-next]')) scrollPulse(1);
  });
  ['gate:site-ready','gate:home-board-ready'].forEach(name=>document.addEventListener(name,refresh));
  window.addEventListener('gate-supabase-ready',refreshTransaction);
  if(window.gateSupabase) refreshTransaction();
  refresh();
})();
