(async function(){
  const {escapeHtml:esc} = window.gateShared;
  const clean = value => String(value ?? '').trim().replace(/\s+/g, ' ');
  const supabase = window.gateSupabase || await window.gateSupabaseReady;

  function championIdentity(champion){
    const raw = clean(champion.champion);
    const explicitTeam = clean(champion.champion_team);
    const parenthetical = raw.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
    const slash = raw.match(/^(.*?)\s*\/\s*([^/]+)$/);
    const parsed = parenthetical || slash;
    return {
      team:explicitTeam || clean(parsed?.[1]) || raw || 'Champion unavailable',
      owner:clean(parsed?.[2])
    };
  }

  function championEntryHTML(champion, index){
    const result = [champion.runner_up ? `Defeated ${champion.runner_up}` : '', champion.championship_score].filter(Boolean).join(' · ');
    return `<article class="champion-entry ${index === 0 ? 'latest-champion' : ''}"><div class="champion-year">${champion.season_year}</div><div class="champion-main"><div class="champion-kicker">${index === 0 ? 'Defending Champion' : 'League Champion'}</div><h3>${esc(champion.team)}</h3>${champion.owner ? `<div class="champion-owner">${esc(champion.owner)}</div>` : ''}${result ? `<div class="champion-result">${esc(result)}</div>` : ''}${champion.note ? `<p>${esc(champion.note)}</p>` : ''}</div><div class="champion-trophy" aria-hidden="true">🏆</div></article>`;
  }

  function renderChampions(champions){
    const history = document.getElementById('history');
    if(!history) return;
    const timeline = history.querySelector('.timeline');
    if(!timeline || !champions?.length) return;
    timeline.classList.add('champions-timeline');
    timeline.innerHTML = champions.map(championEntryHTML).join('');
  }

  function renderCmsRecords(records){
    const panel = document.getElementById('history')?.querySelector('[data-history-panel="records"]');
    if(!panel || !records?.length) return false;
    const grid = document.createElement('div');
    grid.className = 'record-grid public-record-grid';
    grid.dataset.recordBook = 'cms';
    grid.innerHTML = records.map((record, index) => {
      const detail = [record.holder || record.detail, record.season_context].filter(Boolean).join(' · ');
      return `<article class="record-card public-record-card"><div class="record-rank">${String(index + 1).padStart(2, '0')}</div><div class="label">${esc(record.label)}</div><div class="val">${esc(record.value)}</div><div class="sub">${esc(detail)}</div></article>`;
    }).join('');
    panel.querySelectorAll('[data-record-grid="placeholder"]').forEach(node => node.remove());
    panel.querySelectorAll('[data-record-book="cms"]').forEach(node => node.remove());
    const heading = panel.querySelector('.history-section-head');
    if(heading) heading.insertAdjacentElement('afterend', grid);
    else panel.prepend(grid);
    return true;
  }

  const narrativeNotes = {
    2025: "The league's top two teams met for the title, and Tommy capped an 11–3 regular season by beating Collin 129.64–107.88. The Swifties led the league in scoring and delivered Tommy's third 1048 Gate championship.",
    2024: "Jared entered the playoffs as the No. 1 seed and beat George 161.22–135.48 to complete the repeat. The Diddlers' title was Jared's second in a row and third overall.",
    2023: "Jared earned the No. 1 seed, cruised through the semifinal, and edged JD 126.12–121.20 in a 4.92-point championship thriller. Crown The King lived up to the name, giving Jared his second league title.",
    2022: "George came through from the No. 3 seed, dropped 151.98 in the semifinal, and then routed JD 134.28–81.30 in the title game. The 52.98-point win delivered George's first 1048 Gate championship.",
    2021: "Tommy entered as the No. 2 seed, scored 164.66 in the semifinal, and beat Kyle 130.60–109.16 for the title. The win completed the league's first repeat and gave Tommy back-to-back championships."
  };

  async function loadChampionsFallback(){
    try{
      const response = await fetch('data/seasons.json', {cache:'no-store'});
      if(!response.ok) throw new Error(`seasons.json returned HTTP ${response.status}`);
      const payload = await response.json();
      const seasons = Array.isArray(payload.seasons) ? payload.seasons : [];
      const champions = seasons
        .map(([year,,championOwner,championTeam,standings]) => {
          const row = Array.isArray(standings) ? standings.find(team => Number(team[0]) === 1) : null;
          return {
            season_year: Number(year),
            team: clean(championTeam) || 'Champion unavailable',
            owner: clean(championOwner),
            runner_up: '',
            championship_score: '',
            note: narrativeNotes[Number(year)] || (row ? `Champion with a ${row[4]} record and a +${row[7]} point differential.` : '')
          };
        })
        .filter(champion => Number.isFinite(champion.season_year) && champion.season_year >= 2017)
        .sort((a, b) => b.season_year - a.season_year);
      if(champions.length) renderChampions(champions);
      else console.error('No champions available in data/seasons.json.');
    }catch(error){
      console.error('Unable to load champions fallback:', error);
    }
  }

  function renderShame(shame){
    const history = document.getElementById('history');
    if(!history || !shame?.length) return;
    const existingShame = history.querySelector('.shame');
    if(!existingShame) return;
    const container = existingShame.parentElement;
    const active = shame.find(item => item.is_active) || shame[0];
    existingShame.innerHTML = `<div class="txt"><strong>${esc(active.member_team && active.season_year ? `${active.member_team} — Last Place, ${active.season_year}` : active.title)}</strong><span>${esc([active.punishment, active.note && active.note !== active.punishment ? active.note : ''].filter(Boolean).join(' — '))}</span></div><div class="trophy">${esc(active.icon)}</div>`;
    let timeline = history.querySelector('#shameTimeline');
    if(!timeline){
      timeline = document.createElement('div');
      timeline.id = 'shameTimeline';
      timeline.className = 'shame-history';
      container.appendChild(timeline);
    }
    timeline.innerHTML = `<div class="shame-history-head"><h3>Hall of Misfortune</h3><span>Last-place archive</span></div><div class="shame-history-grid">${shame.map(item => `<article class="shame-history-card ${item.is_active ? 'active' : ''}"><div class="shame-history-year">${item.season_year || '—'}</div><div class="shame-history-icon">${esc(item.icon || '💩')}</div><h4>${esc(item.member_team || item.title)}</h4>${item.punishment ? `<strong>${esc(item.punishment)}</strong>` : ''}${item.note && item.note !== item.punishment ? `<p>${esc(item.note)}</p>` : ''}</article>`).join('')}</div>`;
  }

  async function loadHistory(){
    const history = document.getElementById('history');
    if(!history) return;
    if(!supabase){
      window.gateCmsRecords = 'absent';
      loadChampionsFallback();
      return;
    }
    try{
      const [{data:champions}, {data:records}, {data:shame}] = await Promise.all([
        supabase.from('league_champions').select('*').order('season_year', {ascending:false}),
        supabase.from('league_records').select('*').order('sort_order'),
        supabase.from('wall_of_shame').select('*').order('season_year', {ascending:false, nullsFirst:false}).order('created_at', {ascending:false})
      ]);

      if(champions?.length){
        renderChampions(champions.map(champion => {
          const identity = championIdentity(champion);
          return {season_year: champion.season_year, team: identity.team, owner: identity.owner, runner_up: champion.runner_up, championship_score: champion.championship_score, note: champion.note};
        }));
      }else{
        loadChampionsFallback();
      }

      window.gateCmsRecords = renderCmsRecords(records) ? 'rendered' : 'absent';

      renderShame(shame);
    }catch(error){
      console.error('Unable to load league content:', error);
      window.gateCmsRecords = 'absent';
      loadChampionsFallback();
    }
  }

  window.refreshLeagueContent = loadHistory;
  loadHistory();
  if(supabase){
    supabase.channel('1048-league-content')
      .on('postgres_changes', {event:'*', schema:'public', table:'league_champions'}, loadHistory)
      .on('postgres_changes', {event:'*', schema:'public', table:'league_records'}, loadHistory)
      .on('postgres_changes', {event:'*', schema:'public', table:'wall_of_shame'}, loadHistory)
      .subscribe();
  }
})();
