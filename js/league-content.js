(async function(){
  const {escapeHtml:esc} = window.gateShared;
  const clean = value => String(value ?? '').trim().replace(/\s+/g, ' ');
  const supabase = window.gateSupabase || await window.gateSupabaseReady;

  // Shared store so other views (season rundowns) can read champion stories.
  // `ready` resolves once at least one champions render has published notes.
  const championStoryStore = window.gateChampionStories = window.gateChampionStories || {byYear:{}};
  if(!championStoryStore.ready){
    let resolveReady;
    championStoryStore.ready = new Promise(resolve => {resolveReady = resolve});
    championStoryStore._resolveReady = resolveReady;
  }
  function publishChampionStories(champions){
    (champions || []).forEach(champion => {
      const year = Number(champion.season_year);
      if(Number.isFinite(year) && champion.note) championStoryStore.byYear[year] = String(champion.note);
    });
    if(championStoryStore._resolveReady){
      championStoryStore._resolveReady();
      championStoryStore._resolveReady = null;
    }
  }

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

  // Editorial summaries per season, stored in data/champion-notes.json so the
  // copy can be updated without touching JS. Used whenever a Supabase row has
  // no note; database notes still take precedence.
  const narratives = {};
  let narrativesLoaded;
  function loadNarratives(){
    if(narrativesLoaded) return narrativesLoaded;
    narrativesLoaded = (async () => {
      try{
        const response = await fetch('data/champion-notes.json', {cache:'no-store'});
        if(!response.ok) throw new Error(`champion-notes.json returned HTTP ${response.status}`);
        Object.assign(narratives, (await response.json()).notes || {});
      }catch(error){
        console.warn('Unable to load champion notes; falling back to generated summaries.', error);
      }
    })();
    return narrativesLoaded;
  }

  function withNote(champion){
    return Object.assign({}, champion, {
      note: clean(champion.note) || narratives[Number(champion.season_year)] || ''
    });
  }

  function championEntryHTML(champion, index){
    const result = [champion.runner_up ? `Defeated ${champion.runner_up}` : '', champion.championship_score].filter(Boolean).join(' · ');
    const open = index === 0;
    const hasStory = Boolean(result || champion.note);
    const story = hasStory ? `<div class="champion-story" id="champion-story-${index}" aria-hidden="${!open}">${result ? `<div class="champion-result">${esc(result)}</div>` : ''}${champion.note ? `<p>${esc(champion.note)}</p>` : ''}</div>` : '';
    const toggle = hasStory ? `<button class="champion-toggle" type="button" aria-expanded="${open}" aria-controls="champion-story-${index}" data-champion-toggle><span class="chev" aria-hidden="true">▸</span>Story</button>` : '';
    return `<article class="champion-entry ${index === 0 ? 'latest-champion' : ''} ${open ? 'open' : ''}"><div class="champion-year">${champion.season_year}</div><div class="champion-main"><div class="champion-kicker">${index === 0 ? 'Defending Champion' : 'League Champion'}</div><h3>${esc(champion.team)}</h3>${champion.owner ? `<div class="champion-owner">${esc(champion.owner)}</div>` : ''}</div><div class="champion-trophy" aria-hidden="true">🏆</div>${toggle}${story}</article>`;
  }

  function renderChampions(champions){
    const normalized = (champions || []).map(withNote);
    publishChampionStories(normalized);
    const history = document.getElementById('history');
    if(!history) return;
    const timeline = history.querySelector('.timeline');
    if(!timeline || !normalized.length) return;
    timeline.classList.add('champions-timeline');
    timeline.innerHTML = normalized.map(championEntryHTML).join('');
    if(timeline.dataset.championTogglesReady) return;
    timeline.dataset.championTogglesReady = 'true';
    timeline.addEventListener('click', event => {
      const button = event.target.closest('[data-champion-toggle]');
      if(!button) return;
      const entry = button.closest('.champion-entry');
      if(!entry) return;
      const open = entry.classList.toggle('open');
      button.setAttribute('aria-expanded', String(open));
      const story = entry.querySelector('.champion-story');
      if(story) story.setAttribute('aria-hidden', String(!open));
    });
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

  async function loadChampionsFallback(){
    await loadNarratives();
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
            note: narratives[Number(year)] || (row ? `Champion with a ${row[4]} record and a +${row[7]} point differential.` : '')
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


  async function loadShameFallback(){
    const history = document.getElementById('history');
    if(!history) return;
    try{
      const response = await fetch('data/seasons.json', {cache:'no-store'});
      if(!response.ok) throw new Error(`seasons.json returned HTTP ${response.status}`);
      const payload = await response.json();
      const shame = (payload.seasons || []).map(season => {
        const year = Number(season[0]);
        const standings = Array.isArray(season[4]) ? season[4] : [];
        const last = standings.find(row => Number(row[0]) === 12) || standings[standings.length - 1];
        if(!last) return null;
        const team = String(last[2] || '').trim();
        const owner = String(last[3] || '').trim();
        const record = String(last[4] || '').trim();
        return {
          season_year: year,
          member_team: team,
          title: `${team} — Last Place, ${year}`,
          punishment: owner && record ? `${owner} · ${record}` : owner,
          note: year === 2025 ? "Sentenced to this year's punishment. Details TBD by the committee." : '',
          icon: '💩',
          is_active: year === 2025
        };
      }).filter(Boolean).sort((a, b) => b.season_year - a.season_year);
      if(shame.length) renderShame(shame);
    }catch(error){
      console.error('Unable to load shame fallback:', error);
    }
  }

  async function loadHistory(){
    const history = document.getElementById('history');
    if(!history) return;
    if(!supabase){
      window.gateCmsRecords = 'absent';
      loadChampionsFallback();
      loadShameFallback();
      return;
    }
    try{
      const [{data:champions}, {data:records}, {data:shame}] = await Promise.all([
        supabase.from('league_champions').select('*').order('season_year', {ascending:false}),
        supabase.from('league_records').select('*').order('sort_order'),
        supabase.from('wall_of_shame').select('*').order('season_year', {ascending:false, nullsFirst:false}).order('created_at', {ascending:false})
      ]);
      await loadNarratives();

      if(champions?.length){
        renderChampions(champions.map(champion => {
          const identity = championIdentity(champion);
          return {season_year: champion.season_year, team: identity.team, owner: identity.owner, runner_up: champion.runner_up, championship_score: champion.championship_score, note: champion.note};
        }));
      }else{
        loadChampionsFallback();
      }

      window.gateCmsRecords = renderCmsRecords(records) ? 'rendered' : 'absent';

      if(shame?.length) renderShame(shame);
      else loadShameFallback();
    }catch(error){
      console.error('Unable to load league content:', error);
      window.gateCmsRecords = 'absent';
      loadChampionsFallback();
      loadShameFallback();
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
