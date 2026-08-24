// Playoff probability projector for the current season.
// Runs a Monte Carlo over data/power-rankings.json: random 13-game schedules,
// logistic game win probabilities from rating gaps, six-team bracket with
// first-round byes for the top two seeds.
(function(){
  const SIMULATIONS = 4000;
  const GAMES_PER_SEASON = 13;
  const PLAYOFF_TEAMS = 6;
  const RATING_SCALE = 100;

  const toolbar = document.querySelector('#playoffs .playoff-toolbar');
  if(!toolbar) return;
  const host = document.createElement('div');
  host.className = 'panel title-odds-panel';
  host.id = 'titleOdds';
  host.innerHTML = '<div class="history-loading">Simulating seasons…</div>';
  toolbar.insertAdjacentElement('afterend', host);

  async function load(){
    try{
      const response = await fetch('data/power-rankings.json', {cache:'no-store'});
      if(!response.ok) throw new Error(`power-rankings.json returned HTTP ${response.status}`);
      const payload = await response.json();
      const teams = (payload.ratings || []).filter(t => Number.isFinite(Number(t.rating)));
      if(teams.length < 4) throw new Error('Not enough rated teams to project.');
      render(teams.map(t => ({name:String(t.name), rating:Number(t.rating)})), Number(payload.generatedForSeason) || '');
    }catch(error){
      console.warn('Title projection unavailable:', error);
      host.classList.add('hidden');
    }
  }

  function pWin(a, b){
    return 1 / (1 + Math.pow(10, -(a.rating - b.rating) / RATING_SCALE));
  }

  function simulate(teams){
    const made = teams.map(() => 0);
    const bye = teams.map(() => 0);
    const title = teams.map(() => 0);
    const n = teams.length;
    const play = (i, j) => Math.random() < pWin(teams[i], teams[j]) ? i : j;
    for(let sim = 0; sim < SIMULATIONS; sim++){
      const wins = teams.map(() => 0);
      for(let i = 0; i < n; i++){
        for(let g = 0; g < GAMES_PER_SEASON; g++){
          let j = Math.floor(Math.random() * (n - 1));
          if(j >= i) j++;
          if(Math.random() < pWin(teams[i], teams[j])) wins[i]++;
        }
      }
      const order = teams.map((_, i) => i).sort((a, b) => wins[b] - wins[a] || (Math.random() - 0.5));
      const field = order.slice(0, PLAYOFF_TEAMS);
      field.forEach(i => made[i]++);
      bye[field[0]]++; bye[field[1]]++;
      // QF: 3v6 and 4v5; SF: 1 vs w(3v6), 2 vs w(4v5); then the final.
      const qf1 = play(field[2], field[5]);
      const qf2 = play(field[3], field[4]);
      const sf1 = play(field[0], qf1);
      const sf2 = play(field[1], qf2);
      title[play(sf1, sf2)]++;
    }
    return {made, bye, title};
  }

  function render(teams, seasonNumber){
    const {made, bye, title} = simulate(teams);
    const pct = count => `${Math.round(count / SIMULATIONS * 100)}%`;
    const rows = teams
      .map((t, i) => ({name:t.name, madePct:made[i]/SIMULATIONS, byePct:bye[i]/SIMULATIONS, titlePct:title[i]/SIMULATIONS}))
      .sort((a, b) => b.titlePct - a.titlePct || b.madePct - a.madePct);
    const maxTitle = Math.max(...rows.map(r => r.titlePct)) || 1;
    const escapeHtml = window.gateShared?.escapeHtml || (value => String(value ?? ''));
    host.innerHTML = `<div class="history-section-head"><div><span>SZN ${seasonNumber} PROJECTION</span><h3>Playoff Probability Board</h3></div><small>${SIMULATIONS.toLocaleString('en-US')} simulated seasons</small></div><div class="title-odds-grid">${rows.map(r => `
      <div class="title-odds-card${r.titlePct === maxTitle ? ' is-favorite' : ''}">
        <div class="title-odds-name"><strong>${escapeHtml(r.name)}</strong>${r.titlePct === maxTitle ? '<em>Favorite</em>' : ''}</div>
        <div class="title-odds-bars">
          <div class="title-odds-bar" title="Chance to make the six-team bracket"><span>Playoff</span><div style="--w:${Math.round(r.madePct * 100)}%"><i></i></div><b>${pct(r.madePct)}</b></div>
          <div class="title-odds-bar" title="Chance at a top-two seed and first-round bye"><span>Bye</span><div style="--w:${Math.round(r.byePct * 100)}%"><i></i></div><b>${pct(r.byePct)}</b></div>
          <div class="title-odds-bar is-title" title="Chance to win the title"><span>Title</span><div style="--w:${Math.max(Math.round(r.titlePct * 1000) / 10, 1.5)}%"><i></i></div><b>${r.titlePct < 0.0005 ? '&lt;0.1%' : pct(r.titlePct)}</b></div>
        </div>
      </div>`).join('')}</div><p class="title-odds-note">Projected from current power ratings: every simulated season draws a fresh ${GAMES_PER_SEASON}-game schedule, the top six reach the bracket, and the top two earn first-round byes.</p>`;
  }

  load();
})();
