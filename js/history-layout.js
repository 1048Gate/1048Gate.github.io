(function(){
  const history=document.getElementById('history');
  if(!history||history.dataset.historyLayout==='ready')return;
  history.dataset.historyLayout='ready';
  const title=history.querySelector('.section-title'),timeline=history.querySelector('.timeline'),recordGrid=history.querySelector('.record-grid'),shame=history.querySelector('.shame');
  if(!timeline||!recordGrid||!shame)return;
  const championsPanel=timeline.closest('.panel')||timeline.parentElement,recordsPanel=recordGrid.closest('.panel')||recordGrid.parentElement,shamePanel=shame.closest('.panel')||shame.parentElement;
  const shell=document.createElement('div');shell.className='history-shell';shell.innerHTML=`<div class="history-intro archive-explorer-intro"><div><span class="history-eyebrow">1048 ARCHIVES</span><h3>Choose your way into the league story.</h3><p>Start with a season, a rivalry, a title run, or the league wire. The detailed tables are still here—now they are one deliberate step away instead of the first thing you have to decode.</p></div><div class="archive-intro-note"><span>START HERE</span><strong>One question at a time.</strong><small>Follow a season · compare managers · revisit milestones</small></div></div><div class="history-subnav" role="tablist" aria-label="League history sections"><button class="active" type="button" data-history-tab="overview" role="tab" aria-selected="true">Overview</button><button type="button" data-history-tab="seasons" role="tab" aria-selected="false">Season Vault</button><button type="button" data-history-tab="champions" role="tab" aria-selected="false">Champions</button><button type="button" data-history-tab="matchups" role="tab" aria-selected="false">Rivalries</button><button type="button" data-history-tab="records" role="tab" aria-selected="false">Record Book</button><button type="button" data-history-tab="shame" role="tab" aria-selected="false">Hall of Shame</button></div><div class="history-tab-panels"><section class="history-tab-panel active" data-history-panel="overview"></section><section class="history-tab-panel" data-history-panel="seasons"></section><section class="history-tab-panel" data-history-panel="champions"></section><section class="history-tab-panel" data-history-panel="matchups"></section><section class="history-tab-panel" data-history-panel="records"></section><section class="history-tab-panel" data-history-panel="shame"></section></div>`;
  if(title)title.insertAdjacentElement('afterend',shell);else history.prepend(shell);
  const overviewHost=shell.querySelector('[data-history-panel="overview"]'),champHost=shell.querySelector('[data-history-panel="champions"]'),seasonHost=shell.querySelector('[data-history-panel="seasons"]'),matchupHost=shell.querySelector('[data-history-panel="matchups"]'),recordHost=shell.querySelector('[data-history-panel="records"]'),shameHost=shell.querySelector('[data-history-panel="shame"]');
  championsPanel.classList.add('history-content-panel');recordsPanel.classList.add('history-content-panel');shamePanel.classList.add('history-content-panel');champHost.appendChild(championsPanel);recordHost.appendChild(recordsPanel);shameHost.appendChild(shamePanel);
  const cleanHeading=(panel,label,sub)=>{const old=panel.querySelector(':scope > h3');if(old)old.remove();const head=document.createElement('div');head.className='history-section-head';head.innerHTML=`<div><span>${label}</span><h3>${sub}</h3></div>`;panel.prepend(head)};
  cleanHeading(championsPanel,'CHAMPIONSHIP ARCHIVE','Champions Through the Years');cleanHeading(recordsPanel,'LEAGUE RECORD BOOK','Records & Milestones');cleanHeading(shamePanel,'HALL OF MISFORTUNE','Wall of Shame');
  function activate(name){shell.querySelectorAll('[data-history-tab]').forEach(b=>{const active=b.dataset.historyTab===name;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active))});shell.querySelectorAll('[data-history-panel]').forEach(p=>p.classList.toggle('active',p.dataset.historyPanel===name))}
  shell.querySelectorAll('[data-history-tab]').forEach(btn=>btn.addEventListener('click',()=>activate(btn.dataset.historyTab)));
  const {escapeHtml:esc,formatNumber}=window.gateShared;
  const num=value=>formatNumber(value,1,2);
  const clean=value=>String(value??'').trim().replace(/\s+/g,' ');
  const recordText=a=>a&&a[2]?`${a[0]}-${a[1]}-${a[2]}`:a?`${a[0]}-${a[1]}`:'—';
  async function loadArchiveOverview(){
    overviewHost.innerHTML='<div class="panel history-content-panel archive-overview-panel"><div class="history-loading">Building the archive map…</div></div>';
    try{
      const response=await fetch('data/seasons.json',{cache:'no-store'});
      if(!response.ok)throw new Error(`seasons.json returned HTTP ${response.status}`);
      const seasons=((await response.json()).seasons||[]).filter(s=>Array.isArray(s)&&s.length>=5).sort((a,b)=>b[0]-a[0]);
      if(!seasons.length)throw new Error('No archived seasons found');
      const titleCounts={};seasons.forEach(s=>{const owner=clean(s[2]);if(owner)titleCounts[owner]=(titleCounts[owner]||0)+1});
      const titleLeader=Object.entries(titleCounts).sort((a,b)=>b[1]-a[1])[0]||['—',0];
      const latest=seasons[0],latestYear=latest[0];
      const cards=seasons.slice(0,5).map((season,index)=>{const [year,leagueName,championOwner,championTeam,standings]=season;const runnerUp=(standings||[]).find(row=>Number(row[0])===2);return `<button type="button" class="archive-season-card ${index===0?'is-latest':''}" data-archive-season="${year}"><span>${index===0?'LATEST ARCHIVE':'SEASON'}</span><strong>${year}</strong><b>${esc(championOwner)}</b><small>${esc(championTeam)}${runnerUp?` · def. ${esc(String(runnerUp[3]||''))}`:''}</small></button>`}).join('');
      overviewHost.innerHTML=`<div class="panel history-content-panel archive-overview-panel"><div class="archive-overview-head"><div><span>ARCHIVE EXPLORER</span><h3>What do you want to understand?</h3><p>Pick a path first. The site will take you to the right level of detail instead of dropping you into every stat at once.</p></div><div class="archive-overview-metric"><span>COMPLETE SEASONS</span><strong>${seasons.length}</strong><small>Most titles: ${esc(titleLeader[0])} · ${titleLeader[1]}</small></div></div><div class="archive-path-grid"><button type="button" class="archive-path-card primary" data-archive-season="${latestYear}"><span>01 · START WITH A SEASON</span><strong>${latestYear} Season Rundown</strong><small>Champion, final standings, playoffs, draft, and leaders in one guided page.</small></button><button type="button" class="archive-path-card" data-archive-tab="champions"><span>02 · FOLLOW THE TITLES</span><strong>Championship Lineage</strong><small>See who won, how often, and which title runs defined the league.</small></button><button type="button" class="archive-path-card" data-archive-tab="matchups"><span>03 · SETTLE A RIVALRY</span><strong>Head-to-Head Explorer</strong><small>Compare any two managers without scanning a full matrix first.</small></button><button type="button" class="archive-path-card" data-archive-view="transactions"><span>04 · CHECK THE LEAGUE WIRE</span><strong>Moves &amp; Waivers</strong><small>Search verified adds, drops, and successful waiver claims.</small></button></div><div class="archive-timeline-head"><div><span>SEASON TIMELINE</span><h4>Pick a recent chapter</h4></div><small>Every card opens the focused season vault.</small></div><div class="archive-season-strip">${cards}</div></div>`;
      overviewHost.addEventListener('click',event=>{
        const seasonButton=event.target.closest('[data-archive-season]');
        if(seasonButton){activate('seasons');setTimeout(()=>shell.querySelector(`[data-season-year="${seasonButton.dataset.archiveSeason}"]`)?.click(),0);return}
        const tabButton=event.target.closest('[data-archive-tab]');
        if(tabButton){activate(tabButton.dataset.archiveTab);return}
        const viewButton=event.target.closest('[data-archive-view]');
        if(viewButton)document.querySelector(`[data-view="${viewButton.dataset.archiveView}"]`)?.click();
      });
    }catch(error){console.error('Unable to build archive overview:',error);overviewHost.innerHTML='<div class="panel history-content-panel"><div class="history-loading">Archive overview could not be loaded.</div></div>'}
  }

  function applyRundownStory(block,note){
    block.style.display='';
    if(!block.querySelector('p'))block.insertAdjacentHTML('beforeend',`<p>${esc(note)}</p>`);
  }
  function fillRundownStory(detail,year){
    const block=detail.querySelector('[data-rundown-story]');
    if(!block||detail.dataset.renderYear!==String(year))return;
    const store=window.gateChampionStories,note=store&&store.byYear?store.byYear[Number(year)]:'';
    if(note){applyRundownStory(block,note);return}
    Promise.race([(store&&store.ready)||Promise.resolve(),new Promise(r=>setTimeout(r,4000))]).then(()=>{
      const late=window.gateChampionStories&&window.gateChampionStories.byYear[Number(year)];
      if(late&&detail.dataset.renderYear===String(year))applyRundownStory(block,late);
    });
  }
  async function loadSeasonArchive(){
    seasonHost.innerHTML='<div class="panel history-content-panel"><div class="history-loading">Loading season archive…</div></div>';
    try{
      const [seasonRes,playoffRes]=await Promise.all([fetch('data/seasons.json',{cache:'no-store'}),fetch('data/playoffs.json',{cache:'no-store'})]);
      if(!seasonRes.ok)throw new Error(`seasons.json returned HTTP ${seasonRes.status}`);
      if(!playoffRes.ok)throw new Error(`playoffs.json returned HTTP ${playoffRes.status}`);
      const seasons=(await seasonRes.json()).seasons||[];
      const playoffByYear=new Map(((await playoffRes.json()).seasons||[]).map(s=>[Number(s[0]),s]));
      const seasonsList=seasons.filter(s=>Array.isArray(s)&&s.length>=5).sort((a,b)=>b[0]-a[0]);
      if(!seasonsList.length)throw new Error('No seasons found');
      const extraCache={};
      const loadExtras=year=>{
        if(!extraCache[year]){
          extraCache[year]=Promise.all([
            fetch(`data/drafts/${year}.json`,{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null),
            fetch(`data/players/${year}.json`,{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null)
          ]).then(([draft,players])=>({draft,players}));
        }
        return extraCache[year];
      };
      seasonHost.innerHTML='<div class="panel history-content-panel season-archive-panel"><div class="history-section-head"><div><span>SEASON ARCHIVE</span><h3>Season Rundowns</h3></div><small>Standings · Playoffs · Draft · Leaders</small></div><div class="season-year-nav"></div><div class="season-detail"></div></div>';
      const nav=seasonHost.querySelector('.season-year-nav'),detail=seasonHost.querySelector('.season-detail');
      nav.innerHTML=seasonsList.map((s,i)=>`<button type="button" class="${i===0?'active':''}" data-season-year="${s[0]}">${s[0]}</button>`).join('');
      function titleGame(playoffEntry){
        const games=(playoffEntry&&playoffEntry[6])||[];
        const final=[...games].reverse().find(g=>g&&g[2]==='Championship'&&typeof g[7]==='number'&&typeof g[11]==='number');
        if(!final)return null;
        const champFirst=final[7]>=final[11];
        return {round:String(final[2]),label:String(final[3]||''),winnerTeam:String(champFirst?final[4]:final[9]),winnerOwner:String(champFirst?final[5]:final[10]),winnerScore:final[7]>=final[11]?final[7]:final[11],runnerUpTeam:String(champFirst?final[9]:final[4]),runnerUpOwner:String(champFirst?final[10]:final[5]),runnerUpScore:champFirst?final[11]:final[7]};
      }
      function postseasonRounds(playoffEntry){
        const rounds=[];
        for(const game of (playoffEntry&&playoffEntry[6])||[]){
          if(!game||game[1]!=='championship')continue;
          const label=String(game[2]);
          let round=rounds.find(r=>r.label===label);
          if(!round){round={label,games:[]};rounds.push(round)}
          round.games.push(game);
        }
        return rounds;
      }
      function renderSeason(year){
        const season=seasonsList.find(s=>Number(s[0])===Number(year));
        if(!season)return;
        nav.querySelectorAll('button').forEach(btn=>btn.classList.toggle('active',Number(btn.dataset.seasonYear)===Number(year)));
        detail.dataset.renderYear=String(year);
        const [seasonYear,leagueName,championOwner,championTeam,standings]=season;
        const playoffEntry=playoffByYear.get(Number(seasonYear))||null;
        const final=titleGame(playoffEntry);
        const runnerUpRow=Array.isArray(standings)?standings.find(t=>Number(t[0])===2):null;
        const champRow=Array.isArray(standings)?standings.find(t=>Number(t[0])===1):null;
        const banner=`<div class="season-hero"><div class="season-hero-year"><span>${seasonYear}</span><small>${esc(leagueName)}</small></div><div class="season-hero-champ"><span>🏆 League Champion</span><strong>${esc(championOwner)}</strong><small>${esc(championTeam)}${champRow?` · ${esc(String(champRow[4]||''))} record`:''}</small></div>${final?`<div class="season-hero-final"><span>${esc(final.round)}</span><div class="season-hero-score"><b>${esc(final.winnerOwner)}</b><strong>${num(final.winnerScore)}</strong></div><em>def.</em><div class="season-hero-score"><b>${esc(final.runnerUpOwner)}</b><strong>${num(final.runnerUpScore)}</strong></div></div>`:(runnerUpRow?`<div class="season-hero-final"><span>Runner-up</span><div class="season-hero-score"><b>${esc(String(runnerUpRow[3]||''))}</b><strong>${esc(String(runnerUpRow[2]||''))}</strong></div></div>`:'')}</div>`;
        const standingsTable=`<div class="rundown-block"><div class="rundown-head"><span>REGULAR SEASON</span><h4>Final Standings</h4></div><div class="season-table-wrap"><table class="season-archive-table"><thead><tr><th>Finish</th><th>Team</th><th>Owner</th><th>Record</th><th>PF</th><th>PA</th><th>Diff</th><th>Seed</th></tr></thead><tbody>${(standings||[]).map(team=>{const [finish,regular,teamName,ownerName,record,pf,pa,diff]=team;return `<tr class="${Number(finish)===1?'season-champ-row':''}${Number(finish)<=6?' playoff-row':''}"><td class="season-finish">${Number(finish)===1?'🏆 ':''}#${finish}</td><td><strong>${esc(teamName)}</strong></td><td>${esc(ownerName)}</td><td>${esc(record)}</td><td>${num(pf)}</td><td>${num(pa)}</td><td class="${Number(diff)>=0?'positive-diff':'negative-diff'}">${Number(diff)>=0?'+':''}${num(diff)}</td><td>#${regular}</td></tr>`}).join('')}</tbody></table></div><small class="rundown-note">Top six seeds reached the postseason.</small></div>`;
        const rounds=postseasonRounds(playoffEntry);
        const playoffsBlock=`<div class="rundown-block"><div class="rundown-head"><span>POSTSEASON</span><h4>Playoff Results</h4></div>${rounds.length?rounds.map(round=>`<div class="playoff-round-group"><span class="playoff-round-label">${esc(round.label)}</span>${round.games.map(g=>{const hasBoth=typeof g[7]==='number'&&typeof g[11]==='number';if(!hasBoth)return `<div class="playoff-result-row bye"><span>#${esc(g[4])} ${esc(g[5])}</span><em>bye</em><span></span></div>`;const aWins=g[7]>=g[11];return `<div class="playoff-result-row"><span class="${aWins?'is-winner':''}">#${esc(g[4])} ${esc(g[5])}</span><strong>${num(g[7])}</strong><span class="playoff-vs">—</span><strong>${num(g[11])}</strong><span class="${!aWins?'is-winner':''}">#${esc(g[8])} ${esc(g[9])}</span></div>`}).join('')}</div>`).join(''):'<div class="rundown-empty">No postseason archive recorded for this season.</div>'}</div>`;
        detail.innerHTML=`${banner}<div class="rundown-block rundown-story" data-rundown-story style="display:none"><div class="rundown-head"><span>THE STORY</span><h4>How the Title Was Won</h4></div></div><div class="rundown-grid">${standingsTable}${playoffsBlock}<div class="rundown-block" data-rundown-draft><div class="rundown-head"><span>THE DRAFT</span><h4>Round 1 Recap</h4></div><div class="history-loading">Loading draft recap…</div></div><div class="rundown-block" data-rundown-leaders><div class="rundown-head"><span>STAT LEADERS</span><h4>Top Performers</h4></div><div class="history-loading">Loading stat leaders…</div></div></div>`;
        fillRundownStory(detail,seasonYear);
        loadExtras(seasonYear).then(({draft,players})=>{
          if(detail.dataset.renderYear!==String(year))return;
          const draftBlock=detail.querySelector('[data-rundown-draft]');
          if(draftBlock){
            const picks=(draft&&Array.isArray(draft.picks)?draft.picks:[]).slice(0,12);
            const teams=(draft&&Array.isArray(draft.teams))?draft.teams:[];
            draftBlock.innerHTML=`<div class="rundown-head"><span>THE DRAFT</span><h4>Round 1 Recap</h4></div>${picks.length?`<ol class="draft-recap-list">${picks.map(pick=>{const [overall,teamIdx,player,isKeeper]=pick;const teamInfo=teams[teamIdx]||['',''];return `<li><span class="draft-recap-pick">${overall}</span><strong>${esc(player)}</strong><small>${esc(teamInfo[1])}<em> · ${esc(teamInfo[0])}</em></small>${Number(isKeeper)?'<i class="keeper-tag">Keeper</i>':''}</li>`}).join('')}</ol>`:'<div class="rundown-empty">No draft archive recorded for this season.</div>'}`;
          }
          const leadersBlock=detail.querySelector('[data-rundown-leaders]');
          if(leadersBlock){
            const rows=((players&&Array.isArray(players.players)?players.players:[])||[]).slice(0,8);
            leadersBlock.innerHTML=`<div class="rundown-head"><span>STAT LEADERS</span><h4>Top Performers</h4></div>${rows.length?`<div class="season-table-wrap"><table class="season-archive-table leaders-table"><thead><tr><th>#</th><th>Player</th><th>Pos</th><th>Pts</th><th>Fantasy Team</th></tr></thead><tbody>${rows.map((row,i)=>{const name=row[1],pos=row[2],points=row[3],ownerName=row[8],teamName=row[9];return `<tr><td class="season-finish">${i+1}</td><td><strong>${esc(name)}</strong></td><td>${esc(pos)}</td><td>${num(points)}</td><td>${esc(ownerName)}<small> · ${esc(teamName)}</small></td></tr>`}).join('')}</tbody></table></div>`:'<div class="rundown-empty">No player stats recorded for this season.</div>'}`;
          }
        });
      }
      nav.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>renderSeason(btn.dataset.seasonYear)));
      renderSeason(seasonsList[0][0]);
    }catch(error){console.error('Unable to load season archive:',error);seasonHost.innerHTML='<div class="panel history-content-panel"><div class="history-loading">Season archive could not be loaded.</div></div>'}
  }
  async function loadMatchups(){
    matchupHost.innerHTML='<div class="panel history-content-panel"><div class="history-loading">Loading matchup archive…</div></div>';
    try{
      const response=await fetch('data/matchups.json',{cache:'no-store'});if(!response.ok)throw new Error(`matchups.json returned HTTP ${response.status}`);const data=await response.json();const people=data.participants||[],pairs=data.pairs||[];
      function rivalryMatrix(){
        const shortName=p=>{const t=String(p).trim().split(/\s+/);return t.length>1?`${t[0][0]}. ${t[t.length-1]}`:p};
        const record=(i,j)=>{
          const nA=people[i],nB=people[j];
          const pair=pairs.find(p=>(p[0]===nA&&p[1]===nB)||(p[0]===nB&&p[1]===nA));
          if(!pair)return null;
          const same=pair[0]===nA;
          return same?[pair[2][0],pair[2][1],pair[2][2]]:[pair[2][1],pair[2][0],pair[2][2]];
        };
        const head=`<thead><tr><th class="rivalry-corner" scope="col">Manager</th>${people.map(n=>`<th scope="col" title="${esc(n)}">${esc(shortName(n))}</th>`).join('')}</tr></thead>`;
        const body=`<tbody>${people.map((rowName,i)=>`<tr><th scope="row">${esc(rowName)}</th>${people.map((colName,j)=>{
          if(i===j)return '<td class="rivalry-cell rivalry-self"></td>';
          const rec=record(i,j);
          if(!rec)return '<td class="rivalry-cell">—</td>';
          const cls=rec[0]>rec[1]?'is-winning':rec[0]<rec[1]?'is-losing':'is-even';
          return `<td class="rivalry-cell ${cls}"><button type="button" class="rivalry-btn" data-rivalry-a="${esc(rowName)}" data-rivalry-b="${esc(colName)}">${rec[0]}–${rec[1]}${rec[2]?`–${rec[2]}`:''}</button></td>`;
        }).join('')}</tr>`).join('')}</tbody>`;
        return `<div class="history-section-head"><div><span>RIVALRY MATRIX</span><h3>All-Time Head-to-Head</h3></div><small>Tap any score for the full breakdown</small></div><div class="season-table-wrap rivalry-wrap"><table class="season-archive-table rivalry-matrix">${head}${body}</table></div>`;
      }
      matchupHost.innerHTML=`<div class="panel history-content-panel matchup-panel"><div class="history-section-head"><div><span>MATCHUP ARCHIVE</span><h3>Head-to-Head Rivalries</h3></div><small>${data.gameCount||0} played games analyzed</small></div>${rivalryMatrix()}<div class="h2h-builder"><div class="h2h-selects"><label>Manager A<select id="h2hA">${people.map((p,i)=>`<option value="${esc(p)}" ${i===0?'selected':''}>${esc(p)}</option>`).join('')}</select></label><div class="h2h-vs">VS</div><label>Manager B<select id="h2hB">${people.map((p,i)=>`<option value="${esc(p)}" ${i===1?'selected':''}>${esc(p)}</option>`).join('')}</select></label></div><div id="h2hResult"></div></div></div>`;
      if(matchupHost.dataset.rivalryWired!=='true'){
        matchupHost.dataset.rivalryWired='true';
        matchupHost.addEventListener('click',event=>{
          const btn=event.target.closest('[data-rivalry-a]');
          if(!btn)return;
          const a=matchupHost.querySelector('#h2hA'),b=matchupHost.querySelector('#h2hB');
          if(a&&b){a.value=btn.dataset.rivalryA;b.value=btn.dataset.rivalryB;a.dispatchEvent(new Event('change'))}
          matchupHost.querySelector('.h2h-builder')?.scrollIntoView({behavior:'smooth',block:'nearest'});
        });
      }
      const a=matchupHost.querySelector('#h2hA'),b=matchupHost.querySelector('#h2hB'),result=matchupHost.querySelector('#h2hResult');
      function render(){if(a.value===b.value){result.innerHTML='<div class="h2h-empty">Pick two different managers.</div>';return}const pair=pairs.find(p=>(p[0]===a.value&&p[1]===b.value)||(p[0]===b.value&&p[1]===a.value));if(!pair){result.innerHTML='<div class="h2h-empty">These managers never played each other in the archive.</div>';return}const same=pair[0]===a.value,all=pair[2],reg=pair[3],po=pair[4],aw=same?all[0]:all[1],bw=same?all[1]:all[0],ap=same?all[3]:all[4],bp=same?all[4]:all[3],ar=same?[reg[0],reg[1],reg[2]]:[reg[1],reg[0],reg[2]],br=[ar[1],ar[0],ar[2]],apo=same?[po[0],po[1],po[2]]:[po[1],po[0],po[2]],bpo=[apo[1],apo[0],apo[2]];result.innerHTML=`<div class="h2h-score"><div><span>${esc(a.value)}</span><strong>${aw}</strong><small>${num(ap)} pts scored</small></div><div class="h2h-middle"><span>ALL-TIME</span><b>${recordText([aw,bw,all[2]])}</b><small>${aw+bw+all[2]} meetings</small></div><div><span>${esc(b.value)}</span><strong>${bw}</strong><small>${num(bp)} pts scored</small></div></div><div class="h2h-splits"><div><span>Regular Season</span><strong>${recordText(ar)}</strong><small>${esc(a.value)}</small><strong>${recordText(br)}</strong><small>${esc(b.value)}</small></div><div><span>Playoffs</span><strong>${recordText(apo)}</strong><small>${esc(a.value)}</small><strong>${recordText(bpo)}</strong><small>${esc(b.value)}</small></div></div>`}
      a.addEventListener('change',render);b.addEventListener('change',render);render();
    }catch(error){console.error('Unable to load matchup archive:',error);matchupHost.innerHTML='<div class="panel history-content-panel"><div class="history-loading">Matchup archive could not be loaded.</div></div>'}
  }
  function trophyStats(seasons,playoffs,currentMembers){
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
    const career={};
    seasons.forEach(s=>{
      (Array.isArray(s[4])?s[4]:[]).forEach(row=>{
        const owner=clean(row[3]);if(!owner)return;
        const parts=String(row[4]||'').split('-');
        const c=career[owner]=career[owner]||{w:0,l:0,t:0};
        c.w+=Number(parts[0])||0;c.l+=Number(parts[1])||0;c.t+=Number(parts[2])||0;
      });
    });
    const bestCareer=Object.entries(career).map(([owner,c])=>{
      const games=c.w+c.l+c.t;
      return {owner,games,pct:games?c.w/games:0,line:recordText([c.w,c.l,c.t])};
    }).filter(c=>c.games>=40).sort((a,b)=>b.pct-a.pct);
    const topCareerPct=bestCareer.length?bestCareer.filter(c=>c.pct===bestCareer[0].pct):[];
    const appearances={};
    playoffs.forEach(s=>{
      const year=Number(s[0]);
      (Array.isArray(s[5])?s[5]:[]).forEach(t=>{
        const owner=clean(t[2]);if(!owner)return;
        (appearances[owner]=appearances[owner]||new Set()).add(year);
      });
    });
    const appearanceCounts=Object.entries(appearances).map(([owner,years])=>({owner,count:years.size})).sort((a,b)=>b.count-a.count);
    const topAppearances=appearanceCounts.length?appearanceCounts.filter(a=>a.count===appearanceCounts[0].count):[];
    const titleOwners=new Set(Object.keys(byOwner));
    const chasing=(Array.isArray(currentMembers)?currentMembers:[]).map(clean).filter(name=>name&&!titleOwners.has(name));
    let biggestFall=null;
    champs.forEach(c=>{
      const nextSeason=seasons.find(s=>Number(s[0])===c.year+1);
      if(!nextSeason||!Array.isArray(nextSeason[4]))return;
      const row=nextSeason[4].find(t=>clean(t[3])===c.owner);
      if(!row)return;
      const finish=Number(row[0]);
      if(!biggestFall||finish>biggestFall.finish)biggestFall={owner:c.owner,from:c.year,to:c.year+1,finish};
    });
    return [
      {label:'Most Titles',value:titleCounts.filter(t=>t.count===maxTitles).length>1?`${maxTitles} apiece`:String(maxTitles),detail:most},
      {label:'First Champion',value:String(first.year),detail:`${first.owner} · ${first.team}`},
      {label:'Back-to-Back Champs',value:String(repeats.length),detail:[...repeats].sort((a,b)=>a.from-b.from).map(r=>`${r.owner} '${String(r.from).slice(2)}–'${String(r.to).slice(2)}`).join(' · ')},
      {label:'Best Champion Record',value:best.record,detail:bestRecord},
      {label:'Biggest Title-Game Win',value:`+${num(biggest.margin)}`,detail:`${ownerOf(biggest.year).owner}, ${biggest.year} (${num(biggest.scores[0])}–${num(biggest.scores[1])})`},
      {label:'Closest Title Game',value:`+${num(closest.margin)}`,detail:`${ownerOf(closest.year).owner}, ${closest.year} (${num(closest.scores[0])}–${num(closest.scores[1])})`},
      {label:'Lowest Seed to Win',value:`#${underdog.seed}`,detail:`${ownerOf(underdog.year).owner}, ${underdog.year}`},
      {label:'Best Champion Differential',value:`+${num(diffMax.diff)}`,detail:`${diffMax.owner}, ${diffMax.year}`},
      {label:'Best Career Win %',value:topCareerPct.length?`${(topCareerPct[0].pct*100).toFixed(1)}%`:'—',detail:topCareerPct.map(c=>`${c.owner} · ${c.line} career`).join(' · ')},
      {label:'Most Playoff Trips',value:topAppearances.length?String(topAppearances[0].count):'—',detail:topAppearances.map(a=>`${a.owner} · ${a.count} of ${playoffs.length}`).join(' · ')},
      {label:'Still Chasing #1',value:String(chasing.length),detail:chasing.join(' · ')||'Everyone has tasted glory'},
      {label:'Biggest Fall',value:biggestFall?`#1 → #${biggestFall.finish}`:'—',detail:biggestFall?`${biggestFall.owner}, '${String(biggestFall.from).slice(2)} → '${String(biggestFall.to).slice(2)}`:''}
    ];
  }

  async function loadTrophyRoom(){
    const trophy=history.querySelector('[data-trophy-room]');
    if(!trophy)return;
    try{
      const [seasonRes,playoffRes,membersRes]=await Promise.all([
        fetch('data/seasons.json',{cache:'no-store'}),
        fetch('data/playoffs.json',{cache:'no-store'}),
        fetch('data/members.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null)
      ]);
      if(!seasonRes.ok)throw new Error(`seasons.json returned HTTP ${seasonRes.status}`);
      if(!playoffRes.ok)throw new Error(`playoffs.json returned HTTP ${playoffRes.status}`);
      const seasons=(await seasonRes.json()).seasons||[];
      const playoffs=(await playoffRes.json()).seasons||[];
      const memberNames=((membersRes&&Array.isArray(membersRes.members))?membersRes.members:[]).map(m=>m&&m.name).filter(Boolean);
      const years=seasons.map(s=>Number(s[0])).filter(Number.isFinite);
      trophy.innerHTML=`<div class="trophy-room-head"><span>TROPHY ROOM</span><small>Championship stats · ${Math.min(...years)}–${Math.max(...years)}</small></div><div class="trophy-grid">${trophyStats(seasons,playoffs,memberNames).map(card=>`<div class="trophy-card"><span>${esc(card.label)}</span><strong>${esc(card.value)}</strong><small>${esc(card.detail)}</small></div>`).join('')}</div>`;
    }catch(error){
      console.error('Unable to load trophy room:',error);
      trophy.innerHTML='<div class="history-loading">Trophy room could not be loaded.</div>';
    }
  }

  loadArchiveOverview();loadSeasonArchive();loadMatchups();loadTrophyRoom();
  let shameAttempts=0;
  function placeShameTimeline(){
    const shameTimeline=document.getElementById('shameTimeline');
    if(shameTimeline){if(shameTimeline.parentElement!==shamePanel)shamePanel.appendChild(shameTimeline);return}
    if(++shameAttempts<20)setTimeout(placeShameTimeline,100);
  }
  placeShameTimeline();
})();
