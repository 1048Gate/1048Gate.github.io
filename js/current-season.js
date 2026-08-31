(function(){
  const {escapeHtml:esc} = window.gateShared || {escapeHtml:value => String(value ?? '')};

  function record(team){
    const wins = Number(team.wins || 0);
    const losses = Number(team.losses || 0);
    const ties = Number(team.ties || 0);
    return ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
  }

  function points(value){
    if(value == null || value === '') return '\u2014';
    return Number(value).toFixed(1).replace(/\.0$/, '');
  }

  function gameLine(game){
    const home = game.home || {};
    const away = game.away || {};
    const homeScore = home.score != null ? points(home.score) : '';
    const awayScore = away.score != null ? points(away.score) : '';
    const decided = home.score != null && away.score != null && Number(home.score) + Number(away.score) > 0;
    return `<article class="season-game${decided ? ' is-final' : ''}">
      <div class="season-game-side"><strong>${esc(away.team_name || 'Away')}</strong><span>${esc(awayScore || '\u2014')}</span></div>
      <div class="season-game-side"><strong>${esc(home.team_name || 'Home')}</strong><span>${esc(homeScore || '\u2014')}</span></div>
    </article>`;
  }

  function weekBlock(block, empty){
    if(!block) return `<div class="season-empty">${esc(empty)}</div>`;
    if(!block.games?.length) return `<div class="season-empty">Week ${esc(block.week)} is not on the board yet.</div>`;
    return `<div class="season-week-grid">${block.games.map(gameLine).join('')}</div>`;
  }

  function renderStandings(teams){
    if(!teams.length) return '<div class="season-empty">Standings will post after Week 1 is official.</div>';
    return `<table class="season-standings-table"><thead><tr><th>Rk</th><th>Team</th><th>W-L</th><th>PF</th></tr></thead><tbody>${
      teams.map((team, index) => `<tr>
        <td>${esc(team.rank || index + 1)}</td>
        <td>${esc(team.team_name || 'Team')}${team.owner_name ? `<small>${esc(team.owner_name)}</small>` : ''}</td>
        <td>${esc(record(team))}</td>
        <td>${esc(points(team.points_for))}</td>
      </tr>`).join('')
    }</tbody></table>`;
  }

  function phaseLabel(data){
    if(data.phase === 'regular' && data.current_week) return `Week ${data.current_week}`;
    if(data.phase === 'week_ready' && data.current_week) return `Week ${data.current_week} slate`;
    return 'Pre-Season';
  }

  function render(root, data, compact){
    const note = data.note || (data.fetched_at ? `Updated ${new Date(data.fetched_at).toLocaleString()}` : 'Waiting on the first official ESPN snapshot.');
    const standings = Array.isArray(data.standings) ? data.standings : [];
    const preview = compact ? standings.slice(0, 6) : standings;
    root.innerHTML = `
      <div class="season-board-meta"><strong>${esc(phaseLabel(data))}</strong><span>${esc(note)}</span></div>
      <div class="season-board-grid${compact ? ' is-compact' : ''}">
        <section class="season-panel">
          <header><span>Live table</span><h3>Standings</h3></header>
          ${renderStandings(preview)}
          ${compact && standings.length > 6 ? '<p class="season-more">Open the Season tab for the full table.</p>' : ''}
        </section>
        <section class="season-panel season-panel-previous">
          <header><span>Last week</span><h3>${data.previous?.week ? `Week ${esc(data.previous.week)}` : 'Previous'}</h3></header>
          ${weekBlock(data.previous, 'No completed week yet. Check back after Monday night.')}
        </section>
        <section class="season-panel">
          <header><span>This week</span><h3>${data.current?.week ? `Week ${esc(data.current.week)}` : 'Now'}</h3></header>
          ${weekBlock(data.current, 'This week slate appears once ESPN posts matchups.')}
        </section>
        <section class="season-panel">
          <header><span>Up next</span><h3>${data.upcoming?.week ? `Week ${esc(data.upcoming.week)}` : 'Upcoming'}</h3></header>
          ${weekBlock(data.upcoming, 'Upcoming games will land here after the draft.')}
        </section>
      </div>`;
  }

  async function load(){
    const hosts = [...document.querySelectorAll('[data-season-board]')];
    if(!hosts.length) return;
    try{
      const response = await fetch('data/current-season.json', {cache:'no-store'});
      if(!response.ok) throw new Error(`Season board HTTP ${response.status}`);
      const data = await response.json();
      hosts.forEach(host => render(host, data, host.dataset.seasonBoard === 'compact'));
    }catch(error){
      console.error('Unable to load current season board:', error);
      hosts.forEach(host => {
        host.innerHTML = '<div class="season-empty">Season board could not load. Draft night still comes first.</div>';
      });
    }
  }

  document.addEventListener('gate:viewchange', event => {
    if(event.detail?.name === 'home' || event.detail?.name === 'season') load();
  });
  load();
})();
