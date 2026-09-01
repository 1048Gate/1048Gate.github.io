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
      render(
        teams.map(t => ({name:String(t.name), rating:Number(t.rating)})),
        Number(payload.generatedForSeason) || '',
        String(payload.basis || 'career')
      );
    }catch(error){
      console.warn('Title projection unavailable:', error);
      host.classList.add('hidden');
    }
  }

  function pWin(a, b){
    return 1 / (1 + Math.pow(10, -(a.rating - b.rating) / RATING_SCALE));
  }

  function shuffled(values){
    const copy = [...values];
    for(let index = copy.length - 1; index > 0; index--){
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  function buildSchedule(teamCount){
    const rotation = shuffled(Array.from({length:teamCount}, (_, index) => index));
    const rounds = [];
    for(let round = 0; round < teamCount - 1; round++){
      const matchups = [];
      for(let index = 0; index < teamCount / 2; index++){
        matchups.push([rotation[index], rotation[teamCount - 1 - index]]);
      }
      rounds.push(matchups);
      rotation.splice(1, 0, rotation.pop());
    }
    const rematchRounds = shuffled(rounds.map((_, index) => index))
      .slice(0, GAMES_PER_SEASON - (teamCount - 1));
    return [...rounds, ...rematchRounds.map(index => rounds[index])].flat();
  }

  function simulate(teams){
    const made = teams.map(() => 0);
    const bye = teams.map(() => 0);
    const title = teams.map(() => 0);
    const n = teams.length;
    const play = (i, j) => Math.random() < pWin(teams[i], teams[j]) ? i : j;
    for(let sim = 0; sim < SIMULATIONS; sim++){
      const wins = teams.map(() => 0);
      for(const [home, away] of buildSchedule(n)){
        wins[play(home, away)]++;
      }
      const order = teams.map((_, i) => i).sort((a, b) => wins[b] - wins[a] || (Math.random() - 0.5));
      const field = order.slice(0, PLAYOFF_TEAMS);
      field.forEach(i => made[i]++);
      bye[field[0]]++; bye[field[1]]++;
      const qf1 = play(field[2], field[5]);
      const qf2 = play(field[3], field[4]);
      const sf1 = play(field[0], qf1);
      const sf2 = play(field[1], qf2);
      title[play(sf1, sf2)]++;
    }
    return {made, bye, title};
  }

  function render(teams, seasonNumber, basis){
    const {made, bye, title} = simulate(teams);
    const pct = value => `${Math.round(value * 100)}%`;
    const rows = teams
      .map((t, i) => ({name:t.name, madePct:made[i]/SIMULATIONS, byePct:bye[i]/SIMULATIONS, titlePct:title[i]/SIMULATIONS}))
      .sort((a, b) => b.titlePct - a.titlePct || b.madePct - a.madePct);
    const maxTitle = Math.max(...rows.map(r => r.titlePct)) || 1;
    const escapeHtml = window.gateShared?.escapeHtml || (value => String(value ?? ''));
    const postDraft = basis === 'post-draft';
    const kicker = postDraft ? `SZN ${seasonNumber} POST-DRAFT BOARD` : `SZN ${seasonNumber} PRE-DRAFT BOARD`;
    const sub = postDraft
      ? `${SIMULATIONS.toLocaleString('en-US')} simulated seasons · 2026 roster ranks blended with career form`
      : `${SIMULATIONS.toLocaleString('en-US')} simulated seasons · career power ratings, not 2026 rosters`;
    const note = postDraft
      ? `Post-draft projection. These percentages blend ESPN PPR ranks from the Szn 10 draft with career power ratings and a random ${GAMES_PER_SEASON}-game schedule. Top six make the bracket; top two get first-round byes. They are not the same as the league-office futures on Home.`
      : `Pre-draft projection only. These percentages come from career power ratings and a random ${GAMES_PER_SEASON}-game schedule — not keepers, the 2026 draft, or current rosters. Top six make the bracket; top two get first-round byes. They are not the same as the league-office futures on Home.`;
    host.innerHTML = `<div class="history-section-head"><div><span>${kicker}</span><h3>Playoff Probability Board</h3></div><small>${sub}</small></div><div class="title-odds-grid">${rows.map(r => `
      <div class="title-odds-card${r.titlePct === maxTitle ? ' is-favorite' : ''}">
        <div class="title-odds-name"><strong>${escapeHtml(r.name)}</strong>${r.titlePct === maxTitle ? '<em>Favorite</em>' : ''}</div>
        <div class="title-odds-bars">
          <div class="title-odds-bar" title="Chance to make the six-team bracket"><span>Playoff</span><div style="--w:${Math.round(r.madePct * 100)}%"><i></i></div><b>${pct(r.madePct)}</b></div>
          <div class="title-odds-bar" title="Chance at a top-two seed and first-round bye"><span>Bye</span><div style="--w:${Math.round(r.byePct * 100)}%"><i></i></div><b>${pct(r.byePct)}</b></div>
          <div class="title-odds-bar is-title" title="Chance to win the title"><span>Title</span><div style="--w:${Math.max(Math.round(r.titlePct * 1000) / 10, 1.5)}%"><i></i></div><b>${r.titlePct < 0.0005 ? '<0.1%' : pct(r.titlePct)}</b></div>
        </div>
      </div>`).join('')}</div><p class="title-odds-note">${note}</p>`;
  }

  load();
})();
