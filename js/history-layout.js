(function(){
  const history=document.getElementById('history');
  if(!history||history.dataset.historyLayout==='ready')return;
  history.dataset.historyLayout='ready';
  const title=history.querySelector('.section-title'),timeline=history.querySelector('.timeline'),recordGrid=history.querySelector('.record-grid'),shame=history.querySelector('.shame');
  if(!timeline||!recordGrid||!shame)return;
  const championsPanel=timeline.closest('.panel')||timeline.parentElement,recordsPanel=recordGrid.closest('.panel')||recordGrid.parentElement,shamePanel=shame.closest('.panel')||shame.parentElement;
  const shell=document.createElement('div');shell.className='history-shell';shell.innerHTML=`<div class="history-intro"><div><span class="history-eyebrow">1048 ARCHIVES</span><h3>Nine seasons of league lore</h3><p>Browse champions, full season standings, head-to-head rivalries, all-time records, and the moments nobody is allowed to forget.</p></div></div><div class="history-subnav" role="tablist" aria-label="League history sections"><button class="active" type="button" data-history-tab="champions">Champions</button><button type="button" data-history-tab="seasons">Seasons</button><button type="button" data-history-tab="matchups">Matchups</button><button type="button" data-history-tab="records">Record Book</button><button type="button" data-history-tab="shame">Wall of Shame</button></div><div class="history-tab-panels"><section class="history-tab-panel active" data-history-panel="champions"></section><section class="history-tab-panel" data-history-panel="seasons"></section><section class="history-tab-panel" data-history-panel="matchups"></section><section class="history-tab-panel" data-history-panel="records"></section><section class="history-tab-panel" data-history-panel="shame"></section></div>`;
  if(title)title.insertAdjacentElement('afterend',shell);else history.prepend(shell);
  const champHost=shell.querySelector('[data-history-panel="champions"]'),seasonHost=shell.querySelector('[data-history-panel="seasons"]'),matchupHost=shell.querySelector('[data-history-panel="matchups"]'),recordHost=shell.querySelector('[data-history-panel="records"]'),shameHost=shell.querySelector('[data-history-panel="shame"]');
  championsPanel.classList.add('history-content-panel');recordsPanel.classList.add('history-content-panel');shamePanel.classList.add('history-content-panel');champHost.appendChild(championsPanel);recordHost.appendChild(recordsPanel);shameHost.appendChild(shamePanel);
  const cleanHeading=(panel,label,sub)=>{const old=panel.querySelector(':scope > h3');if(old)old.remove();const head=document.createElement('div');head.className='history-section-head';head.innerHTML=`<div><span>${label}</span><h3>${sub}</h3></div>`;panel.prepend(head)};
  cleanHeading(championsPanel,'CHAMPIONSHIP ARCHIVE','Champions Through the Years');cleanHeading(recordsPanel,'LEAGUE RECORD BOOK','Records & Milestones');cleanHeading(shamePanel,'HALL OF MISFORTUNE','Wall of Shame');
  function activate(name){shell.querySelectorAll('[data-history-tab]').forEach(b=>b.classList.toggle('active',b.dataset.historyTab===name));shell.querySelectorAll('[data-history-panel]').forEach(p=>p.classList.toggle('active',p.dataset.historyPanel===name))}
  shell.querySelectorAll('[data-history-tab]').forEach(btn=>btn.addEventListener('click',()=>activate(btn.dataset.historyTab)));
  const {escapeHtml:esc,formatNumber}=window.gateShared;
  const num=value=>formatNumber(value,1,2);
  const clean=value=>String(value??'').trim().replace(/\s+/g,' ');
  const recordText=a=>a&&a[2]?`${a[0]}-${a[1]}-${a[2]}`:a?`${a[0]}-${a[1]}`:'—';
  async function loadSeasonArchive(){
    seasonHost.innerHTML='<div class="panel history-content-panel"><div class="history-loading">Loading season archive…</div></div>';
    try{
      const response=await fetch('data/seasons.json',{cache:'no-store'});if(!response.ok)throw new Error(`seasons.json returned HTTP ${response.status}`);const payload=await response.json();const seasons=Array.isArray(payload.seasons)?payload.seasons:[];if(!seasons.length)throw new Error('No seasons found');
      seasonHost.innerHTML='<div class="panel history-content-panel season-archive-panel"><div class="history-section-head"><div><span>SEASON ARCHIVE</span><h3>Year-by-Year Standings</h3></div></div><div class="season-year-nav"></div><div class="season-detail"></div></div>';
      const nav=seasonHost.querySelector('.season-year-nav'),detail=seasonHost.querySelector('.season-detail'),sorted=[...seasons].sort((a,b)=>b[0]-a[0]);
      nav.innerHTML=sorted.map((s,i)=>`<button type="button" class="${i===0?'active':''}" data-season-year="${s[0]}">${s[0]}</button>`).join('');
      function renderSeason(year){const season=sorted.find(s=>Number(s[0])===Number(year));if(!season)return;nav.querySelectorAll('button').forEach(btn=>btn.classList.toggle('active',Number(btn.dataset.seasonYear)===Number(year)));const [seasonYear,leagueName,championOwner,championTeam,standings]=season;detail.innerHTML=`<div class="season-summary"><div><span class="season-label">${esc(leagueName)}</span><h4>${seasonYear} Season</h4></div><div class="season-champion"><span>🏆 Champion</span><strong>${esc(championOwner)}</strong><small>${esc(championTeam)}</small></div></div><div class="season-table-wrap"><table class="season-archive-table"><thead><tr><th>Finish</th><th>Team</th><th>Owner</th><th>Record</th><th>PF</th><th>PA</th><th>Diff</th><th>RS</th></tr></thead><tbody>${(standings||[]).map(team=>{const [finish,regular,teamName,ownerName,record,pf,pa,diff]=team;return `<tr class="${Number(finish)===1?'season-champ-row':''}"><td class="season-finish">${Number(finish)===1?'🏆 ':''}#${finish}</td><td><strong>${esc(teamName)}</strong></td><td>${esc(ownerName)}</td><td>${esc(record)}</td><td>${num(pf)}</td><td>${num(pa)}</td><td class="${Number(diff)>=0?'positive-diff':'negative-diff'}">${Number(diff)>=0?'+':''}${num(diff)}</td><td>#${regular}</td></tr>`}).join('')}</tbody></table></div>`}
      nav.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>renderSeason(btn.dataset.seasonYear)));renderSeason(sorted[0][0]);
    }catch(error){console.error('Unable to load season archive:',error);seasonHost.innerHTML='<div class="panel history-content-panel"><div class="history-loading">Season archive could not be loaded.</div></div>'}
  }
  async function loadMatchups(){
    matchupHost.innerHTML='<div class="panel history-content-panel"><div class="history-loading">Loading matchup archive…</div></div>';
    try{
      const response=await fetch('data/matchups.json',{cache:'no-store'});if(!response.ok)throw new Error(`matchups.json returned HTTP ${response.status}`);const data=await response.json();const people=data.participants||[],pairs=data.pairs||[];
      matchupHost.innerHTML=`<div class="panel history-content-panel matchup-panel"><div class="history-section-head"><div><span>MATCHUP ARCHIVE</span><h3>Head-to-Head Rivalries</h3></div><small>${data.gameCount||0} played games analyzed</small></div><div class="h2h-builder"><div class="h2h-selects"><label>Manager A<select id="h2hA">${people.map((p,i)=>`<option value="${esc(p)}" ${i===0?'selected':''}>${esc(p)}</option>`).join('')}</select></label><div class="h2h-vs">VS</div><label>Manager B<select id="h2hB">${people.map((p,i)=>`<option value="${esc(p)}" ${i===1?'selected':''}>${esc(p)}</option>`).join('')}</select></label></div><div id="h2hResult"></div></div></div>`;
      const a=matchupHost.querySelector('#h2hA'),b=matchupHost.querySelector('#h2hB'),result=matchupHost.querySelector('#h2hResult');
      function render(){if(a.value===b.value){result.innerHTML='<div class="h2h-empty">Pick two different managers.</div>';return}const pair=pairs.find(p=>(p[0]===a.value&&p[1]===b.value)||(p[0]===b.value&&p[1]===a.value));if(!pair){result.innerHTML='<div class="h2h-empty">These managers never played each other in the archive.</div>';return}const same=pair[0]===a.value,all=pair[2],reg=pair[3],po=pair[4],aw=same?all[0]:all[1],bw=same?all[1]:all[0],ap=same?all[3]:all[4],bp=same?all[4]:all[3],ar=same?[reg[0],reg[1],reg[2]]:[reg[1],reg[0],reg[2]],br=[ar[1],ar[0],ar[2]],apo=same?[po[0],po[1],po[2]]:[po[1],po[0],po[2]],bpo=[apo[1],apo[0],apo[2]];result.innerHTML=`<div class="h2h-score"><div><span>${esc(a.value)}</span><strong>${aw}</strong><small>${num(ap)} pts scored</small></div><div class="h2h-middle"><span>ALL-TIME</span><b>${recordText([aw,bw,all[2]])}</b><small>${aw+bw+all[2]} meetings</small></div><div><span>${esc(b.value)}</span><strong>${bw}</strong><small>${num(bp)} pts scored</small></div></div><div class="h2h-splits"><div><span>Regular Season</span><strong>${recordText(ar)}</strong><small>${esc(a.value)}</small><strong>${recordText(br)}</strong><small>${esc(b.value)}</small></div><div><span>Playoffs</span><strong>${recordText(apo)}</strong><small>${esc(a.value)}</small><strong>${recordText(bpo)}</strong><small>${esc(b.value)}</small></div></div>`}
      a.addEventListener('change',render);b.addEventListener('change',render);render();
    }catch(error){console.error('Unable to load matchup archive:',error);matchupHost.innerHTML='<div class="panel history-content-panel"><div class="history-loading">Matchup archive could not be loaded.</div></div>'}
  }
  function trophyStats(seasons,playoffs){
    const champs=seasons.map(([year,,owner,team,standings])=>{
      const row=Array.isArray(standings)?standings.find(t=>Number(t[0])===1):null;
      return {year:Number(year),owner:clean(owner),team:clean(team),record:row?String(row[4]||''):'',diff:row?Number(row[7])||0:0};
    }).filter(c=>Number.isFinite(c.year)&&c.year>=2017);
    const byOwner={};
    champs.forEach(c=>{(byOwner[c.owner]=byOwner[c.owner]||[]).push(c.year)});
    const titleCounts=Object.entries(byOwner).map(([owner,years])=>({owner,years:years.sort((a,b)=>a-b),count:years.length}));
    const maxTitles=Math.max(...titleCounts.map(t=>t.count));
    const most=titleCounts.filter(t=>t.count===maxTitles).map(t=>t.owner).join(' & ');
    const repeats=[];
    titleCounts.forEach(({owner,years})=>{for(let i=1;i<years.length;i++)if(years[i]===years[i-1]+1)repeats.push({owner,from:years[i-1],to:years[i]})});
    const first=champs.reduce((a,b)=>a.year<b.year?a:b);
    const best=champs.reduce((a,b)=>{const aw=Number(a.record.split('-')[0])||0,bw=Number(b.record.split('-')[0])||0;return bw>aw?b:a});
    const diffMax=champs.reduce((a,b)=>b.diff>a.diff?b:a);
    const finals=playoffs.map(s=>{
      const year=Number(s[0]),champOwner=clean(s[1]),bracket=s[5]||[],games=s[6]||[];
      const seed=(bracket.find(t=>clean(t[2])===champOwner)||[])[0];
      const game=games.find(g=>g[2]==='Championship'&&typeof g[7]==='number'&&typeof g[11]==='number');
      return game?{year,seed:Number(seed)||0,margin:Math.abs(game[7]-game[11]),scores:[game[7],game[11]]}:null;
    }).filter(Boolean);
    const biggest=finals.reduce((a,b)=>b.margin>a.margin?b:a);
    const closest=finals.reduce((a,b)=>b.margin<a.margin?b:a);
    const underdog=finals.reduce((a,b)=>b.seed>a.seed?b:a);
    const ownerOf=year=>champs.find(c=>c.year===year)||{owner:''};
    const bestRecord=champs.filter(c=>Number(c.record.split('-')[0])===Number(best.record.split('-')[0])).map(c=>`${c.owner} '${String(c.year).slice(2)}`).join(' · ');
    return [
      {label:'Most Titles',value:`${maxTitles} apiece`,detail:most},
      {label:'First Champion',value:String(first.year),detail:`${first.owner} · ${first.team}`},
      {label:'Back-to-Back Champs',value:String(repeats.length),detail:[...repeats].sort((a,b)=>a.from-b.from).map(r=>`${r.owner} '${String(r.from).slice(2)}–'${String(r.to).slice(2)}`).join(' · ')},
      {label:'Best Champion Record',value:best.record,detail:bestRecord},
      {label:'Biggest Title-Game Win',value:`+${num(biggest.margin)}`,detail:`${ownerOf(biggest.year).owner}, ${biggest.year} (${num(biggest.scores[0])}–${num(biggest.scores[1])})`},
      {label:'Closest Title Game',value:`+${num(closest.margin)}`,detail:`${ownerOf(closest.year).owner}, ${closest.year} (${num(closest.scores[0])}–${num(closest.scores[1])})`},
      {label:'Lowest Seed to Win',value:`#${underdog.seed}`,detail:`${ownerOf(underdog.year).owner}, ${underdog.year}`},
      {label:'Best Champion Differential',value:`+${num(diffMax.diff)}`,detail:`${diffMax.owner}, ${diffMax.year}`}
    ];
  }

  async function loadTrophyRoom(){
    const trophy=history.querySelector('[data-trophy-room]');
    if(!trophy)return;
    try{
      const [seasonRes,playoffRes]=await Promise.all([
        fetch('data/seasons.json',{cache:'no-store'}),
        fetch('data/playoffs.json',{cache:'no-store'})
      ]);
      if(!seasonRes.ok)throw new Error(`seasons.json returned HTTP ${seasonRes.status}`);
      if(!playoffRes.ok)throw new Error(`playoffs.json returned HTTP ${playoffRes.status}`);
      const seasons=(await seasonRes.json()).seasons||[];
      const playoffs=(await playoffRes.json()).seasons||[];
      const years=seasons.map(s=>Number(s[0])).filter(Number.isFinite);
      trophy.innerHTML=`<div class="trophy-room-head"><span>TROPHY ROOM</span><small>Championship stats · ${Math.min(...years)}–${Math.max(...years)}</small></div><div class="trophy-grid">${trophyStats(seasons,playoffs).map(card=>`<div class="trophy-card"><span>${esc(card.label)}</span><strong>${esc(card.value)}</strong><small>${esc(card.detail)}</small></div>`).join('')}</div>`;
    }catch(error){
      console.error('Unable to load trophy room:',error);
      trophy.innerHTML='<div class="history-loading">Trophy room could not be loaded.</div>';
    }
  }

  loadSeasonArchive();loadMatchups();loadTrophyRoom();
  let shameAttempts=0;
  function placeShameTimeline(){
    const shameTimeline=document.getElementById('shameTimeline');
    if(shameTimeline){if(shameTimeline.parentElement!==shamePanel)shamePanel.appendChild(shameTimeline);return}
    if(++shameAttempts<20)setTimeout(placeShameTimeline,100);
  }
  placeShameTimeline();
})();
