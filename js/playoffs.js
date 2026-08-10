(function(){
  const {escapeHtml:esc}=window.gateShared;
  const score=v=>v===null||v===undefined||v===''?'—':Number(v).toLocaleString(undefined,{maximumFractionDigits:2});

  const tabs=document.getElementById('tabs');
  if(!tabs)return;
  let btn=tabs.querySelector('[data-view="playoffs"]');
  if(!btn){
    const historyBtn=tabs.querySelector('[data-view="history"]');
    btn=document.createElement('button');btn.dataset.view='playoffs';btn.textContent='Playoffs';
    historyBtn?.insertAdjacentElement('afterend',btn);
  }

  let section=document.getElementById('playoffs');
  if(!section){
    section=document.createElement('section');section.className='view';section.id='playoffs';
    section.innerHTML=`<div class="section-title"><h2>Playoffs</h2><span class="see-all">Winners & consolation bracket history</span></div><div class="playoff-toolbar panel"><div><label for="playoffYear">Season</label><select id="playoffYear"></select></div><div class="playoff-season-status" id="playoffSeasonStatus"></div></div><div id="playoffPublicContent"><div class="panel community-empty">Playoff history is being loaded…</div></div>`;
    document.querySelector('main')?.appendChild(section);
  }
  const select=document.getElementById('playoffYear');
  const host=document.getElementById('playoffPublicContent');
  const status=document.getElementById('playoffSeasonStatus');
  let supabase=window.gateSupabase||null;
  let archive=[];
  let liveSeasons=[];

  function archiveMatchupCard(g){
    const [week,bracket,roundLabel,isBye,seed1,team1,owner1,pts1,seed2,team2,owner2,pts2,winner]=g;
    const side=(seed,name,owner,pts,win)=>`<div class="bracket-team ${win?'winner':''}"><div class="bracket-team-main"><span class="bracket-seed">${seed??'—'}</span><div><strong>${esc(name||'BYE')}</strong>${owner?`<small>${esc(owner)}</small>`:''}</div></div><span class="bracket-score">${score(pts)}</span></div>`;
    return `<div class="bracket-matchup"><div class="bracket-matchup-label">${esc(roundLabel)} · Week ${week}</div>${side(seed1,team1,owner1,pts1,winner===1)}${side(seed2,team2,owner2,pts2,winner===2)}${isBye?'<div class="bracket-note">First-round bye</div>':''}</div>`;
  }

  function renderArchiveSection(games,type,title,subtitle){
    const rows=games.filter(g=>g[1]===type);
    if(!rows.length)return '';
    const rounds=[...new Set(rows.map(g=>g[2]))];
    return `<div class="playoff-bracket-section"><div class="playoff-bracket-head"><div><h3>${esc(title)}</h3><span>${esc(subtitle)}</span></div><span>${rows.length} games</span></div><div class="bracket-scroll"><div class="bracket-grid" style="--round-count:${Math.max(1,rounds.length)}">${rounds.map(label=>`<div class="bracket-round"><div class="bracket-round-title">${esc(label)}</div><div class="bracket-round-games">${rows.filter(g=>g[2]===label).map(archiveMatchupCard).join('')}</div></div>`).join('')}</div></div></div>`;
  }

  function renderArchiveSeason(season){
    const [year,champion,championTeam,runnerUp,runnerUpTeam,seeds,games]=season;
    status.textContent=`${year} PLAYOFFS`;
    const seedCards=(seeds||[]).map(s=>`<div class="playoff-seed-card"><span>#${s[0]}</span><strong>${esc(s[1])}</strong><small>${esc(s[2])}</small></div>`).join('');
    const legacy=games.some(g=>g[1]==='legacy');
    host.innerHTML=`<div class="playoff-season-summary panel"><div class="playoff-year-badge">${year}</div><div><div class="eyebrow">LEAGUE CHAMPION</div><h3 class="playoff-champion-name">🏆 ${esc(champion)} · ${esc(championTeam)}</h3><div class="playoff-runner-up">Runner-up: <strong>${esc(runnerUp)}</strong> · ${esc(runnerUpTeam)}</div><div class="playoff-summary-note">${legacy?'2017 is shown as ESPN postseason placement games because the legacy archive does not label winners/consolation brackets separately.':'Historical results reconstructed from the ESPN game archive.'}</div></div></div><div class="playoff-field panel"><div class="playoff-bracket-head"><div><h3>Playoff Field</h3><span>Regular-season seeds</span></div></div><div class="playoff-seed-grid">${seedCards}</div></div>${legacy?renderArchiveSection(games,'legacy','Postseason Placement Games','Legacy ESPN postseason archive'):renderArchiveSection(games,'championship','Winners Bracket','Championship path')}${renderArchiveSection(games,'placement','Playoff Placement Games','3rd / 5th-place path')}${renderArchiveSection(games,'consolation','Consolation Bracket','Bottom-six postseason ladder')}`;
  }

  function liveMatchupCard(m){
    const w1=Number(m.winner_slot)===1,w2=Number(m.winner_slot)===2;
    const side=(seed,name,owner,pts,win)=>`<div class="bracket-team ${win?'winner':''}"><div class="bracket-team-main"><span class="bracket-seed">${seed??'—'}</span><div><strong>${esc(name||'BYE')}</strong>${owner?`<small>${esc(owner)}</small>`:''}</div></div><span class="bracket-score">${score(pts)}</span></div>`;
    return `<div class="bracket-matchup"><div class="bracket-matchup-label">${esc(m.placement_label||`Game ${m.matchup_order}`)}</div>${side(m.team1_seed,m.team1_name,m.team1_owner,m.team1_score,w1)}${side(m.team2_seed,m.team2_name,m.team2_owner,m.team2_score,w2)}${m.note?`<div class="bracket-note">${esc(m.note)}</div>`:''}</div>`;
  }

  function renderLiveBracket(matchups,type,title,subtitle){
    const rows=matchups.filter(m=>m.bracket_type===type);
    if(!rows.length)return '';
    const rounds=[...new Map(rows.sort((a,b)=>a.round_order-b.round_order||a.matchup_order-b.matchup_order).map(m=>[m.round_key,{key:m.round_key,label:m.round_label}])).values()];
    return `<div class="playoff-bracket-section"><div class="playoff-bracket-head"><div><h3>${title}</h3><span>${subtitle}</span></div><span>${rows.length} games</span></div><div class="bracket-scroll"><div class="bracket-grid" style="--round-count:${Math.max(1,rounds.length)}">${rounds.map(r=>`<div class="bracket-round"><div class="bracket-round-title">${esc(r.label)}</div><div class="bracket-round-games">${rows.filter(m=>m.round_key===r.key).map(liveMatchupCard).join('')}</div></div>`).join('')}</div></div></div>`;
  }

  async function renderLiveSeason(year){
    if(!supabase)return;
    const season=liveSeasons.find(s=>s.season_year===Number(year));
    if(!season)return;
    status.textContent=`${season.season_year} PLAYOFFS`;
    const {data,error}=await supabase.from('playoff_matchups').select('*').eq('season_id',season.id).order('bracket_type').order('round_order').order('matchup_order');
    if(error){host.innerHTML=`<div class="panel community-error">${esc(error.message)}</div>`;return}
    const matchups=data||[];
    host.innerHTML=`<div class="playoff-season-summary panel playoff-season-summary-simple"><div class="playoff-year-badge">${season.season_year}</div><div><div class="eyebrow">LEAGUE CHAMPION</div><h3 class="playoff-champion-name">🏆 ${esc(season.champion||'Champion not entered')}</h3>${season.summary_note?`<div class="playoff-summary-note">${esc(season.summary_note)}</div>`:''}</div></div>${renderLiveBracket(matchups,'championship','Winners Bracket','Current/manual bracket')}${renderLiveBracket(matchups,'consolation','Consolation Bracket','Current/manual bracket')}`;
  }

  async function loadSources(preferred){
    try{
      const response=await fetch('data/playoffs.json',{cache:'no-store'});
      if(!response.ok)throw new Error(`playoffs.json returned HTTP ${response.status}`);
      const data=await response.json();
      archive=Array.isArray(data.seasons)?data.seasons:[];
    }catch(error){
      console.error('Unable to load historical playoff archive:',error);
      archive=[];
    }

    if(supabase){
      try{
        const {data}=await supabase.from('playoff_seasons').select('*').order('season_year',{ascending:false});
        liveSeasons=data||[];
      }catch(error){liveSeasons=[]}
    }

    const archiveYears=new Set(archive.map(s=>Number(s[0])));
    const choices=[
      ...liveSeasons.filter(s=>!archiveYears.has(Number(s.season_year))).map(s=>({value:`live:${s.season_year}`,year:Number(s.season_year),label:`${s.season_year} · Current`})),
      ...archive.map(s=>({value:`archive:${s[0]}`,year:Number(s[0]),label:String(s[0])}))
    ].sort((a,b)=>b.year-a.year);

    if(!choices.length){
      select.innerHTML='<option>No seasons yet</option>';select.disabled=true;
      host.innerHTML='<div class="panel community-empty">No playoff seasons are available yet.</div>';return;
    }

    select.disabled=false;
    select.innerHTML=choices.map(c=>`<option value="${c.value}">${esc(c.label)}</option>`).join('');
    const target=preferred&&choices.some(c=>c.value===preferred)?preferred:choices[0].value;
    select.value=target;
    await loadChoice(target);
  }

  async function loadChoice(value){
    const [source,yearText]=String(value).split(':');
    const year=Number(yearText);
    if(source==='live')return renderLiveSeason(year);
    const season=archive.find(s=>Number(s[0])===year);
    if(season)renderArchiveSeason(season);
  }

  select.addEventListener('change',e=>loadChoice(e.target.value));
  window.refreshPlayoffs=()=>loadSources(select?.value);
  loadSources();
  window.gateSupabaseReady?.then(client=>{
    if(!client||supabase===client)return;
    supabase=client;
    loadSources(select?.value);
  });
})();
