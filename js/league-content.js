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
    const open = index === 0;
    const hasStory = Boolean(result || champion.note);
    const story = hasStory ? `<div class="champion-story" id="champion-story-${index}" aria-hidden="${!open}">${result ? `<div class="champion-result">${esc(result)}</div>` : ''}${champion.note ? `<p>${esc(champion.note)}</p>` : ''}</div>` : '';
    const toggle = hasStory ? `<button class="champion-toggle" type="button" aria-expanded="${open}" aria-controls="champion-story-${index}" data-champion-toggle><span class="chev" aria-hidden="true">▸</span>Story</button>` : '';
    return `<article class="champion-entry ${index === 0 ? 'latest-champion' : ''} ${open ? 'open' : ''}"><div class="champion-year">${champion.season_year}</div><div class="champion-main"><div class="champion-kicker">${index === 0 ? 'Defending Champion' : 'League Champion'}</div><h3>${esc(champion.team)}</h3>${champion.owner ? `<div class="champion-owner">${esc(champion.owner)}</div>` : ''}</div><div class="champion-trophy" aria-hidden="true">🏆</div>${toggle}${story}</article>`;
  }

  function renderChampions(champions){
    const history = document.getElementById('history');
    if(!history) return;
    const timeline = history.querySelector('.timeline');
    if(!timeline || !champions?.length) return;
    timeline.classList.add('champions-timeline');
    timeline.innerHTML = champions.map(championEntryHTML).join('');
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

  const narrativeNotes = {
    2017: "The Flash In The Flex beat George Travis to win the 2017 championship. Jared Hall finished the regular season 10–3 with a +259.8 point differential, earning the league's first 1048 Gate title.",
    2018: "Turn Goff the Lights beat George Travis 167.02–126.08 to win the 2018 championship. Kyle Fowler finished the regular season 9–4 with a +125.64 point differential, earning his first 1048 Gate title.",
    2019: "We're on to Cleveland beat Trevor Hash 156.84–131.2 to win the 2019 championship. JD Daley finished the regular season 8–5 with a +25.62 point differential, earning his first 1048 Gate title.",
    2020: "Has a Nice Ring to it beat German Haro 165.3–107.16 to win the 2020 championship. Thomas Speer finished the regular season 7–6 with a +209.28 point differential, earning his first 1048 Gate title.",
    2021: "Has a Nice Ring to it beat Kyle Fowler 130.6–109.16 to win the 2021 championship. Thomas Speer finished the regular season 9–5 with a +142.56 point differential, completing the league's first repeat and his second straight title.",
    2022: "A, B, Ceedee, **** You beat JD Daley 134.28–81.3 to win the 2022 championship. George Travis finished the regular season 8–6 with a +178.9 point differential, earning his first 1048 Gate title.",
    2023: "Crown The King beat JD Daley 126.12–121.2 to win the 2023 championship. Jared Hall finished the regular season 9–5 with a +150.28 point differential, earning his second 1048 Gate title.",
    2024: "The Diddlers beat George Travis 161.22–135.48 to win the 2024 championship. Jared Hall finished the regular season 11–3 with a +182.4 point differential, completing the repeat and his third 1048 Gate title.",
    2025: "The Swifties beat Collin Krum 129.64–107.88 to win the 2025 championship. Thomas Speer finished the regular season 11–3 with a +389.98 point differential, earning his third 1048 Gate title and tying the all-time league record."
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
