(async function(){
  const supabase = window.gateSupabase || await window.gateSupabaseReady;
  if(!supabase) return;
  const {escapeHtml:esc} = window.gateShared;

  async function loadHistory(){
    const history = document.getElementById('history');
    if(!history) return;
    const [{data:champions}, {data:records}, {data:shame}] = await Promise.all([
      supabase.from('league_champions').select('*').order('season_year', {ascending:false}),
      supabase.from('league_records').select('*').order('sort_order'),
      supabase.from('wall_of_shame').select('*').order('season_year', {ascending:false, nullsFirst:false}).order('created_at', {ascending:false})
    ]);

    if(champions?.length){
      const timeline = history.querySelector('.timeline');
      if(timeline){
        timeline.classList.add('champions-timeline');
        timeline.innerHTML = champions.map((champion, index) => {
          const result = [champion.runner_up ? `Defeated ${champion.runner_up}` : '', champion.championship_score].filter(Boolean).join(' · ');
          return `<article class="champion-entry ${index === 0 ? 'latest-champion' : ''}"><div class="champion-year">${champion.season_year}</div><div class="champion-main"><div class="champion-kicker">${index === 0 ? 'Defending Champion' : 'League Champion'}</div><h3>${esc(champion.champion || '')}</h3>${champion.champion_team ? `<div class="champion-team">${esc(champion.champion_team)}</div>` : ''}${result ? `<div class="champion-result">${esc(result)}</div>` : ''}${champion.note ? `<p>${esc(champion.note)}</p>` : ''}</div><div class="champion-trophy">🏆</div></article>`;
        }).join('');
      }
    }

    if(records?.length){
      const grid = history.querySelector('.record-grid');
      if(grid){
        grid.classList.add('public-record-grid');
        grid.innerHTML = records.map((record, index) => {
          const detail = [record.holder || record.detail, record.season_context].filter(Boolean).join(' · ');
          return `<article class="record-card public-record-card"><div class="record-rank">${String(index + 1).padStart(2, '0')}</div><div class="label">${esc(record.label)}</div><div class="val">${esc(record.value)}</div><div class="sub">${esc(detail)}</div></article>`;
        }).join('');
      }
    }

    const existingShame = history.querySelector('.shame');
    if(existingShame && shame?.length){
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
  }

  window.refreshLeagueContent = loadHistory;
  loadHistory();
  supabase.channel('1048-league-content')
    .on('postgres_changes', {event:'*', schema:'public', table:'league_champions'}, loadHistory)
    .on('postgres_changes', {event:'*', schema:'public', table:'league_records'}, loadHistory)
    .on('postgres_changes', {event:'*', schema:'public', table:'wall_of_shame'}, loadHistory)
    .subscribe();
})();
