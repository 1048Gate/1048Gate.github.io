/* Homepage hierarchy only: reuse the existing board, edition, and season data. */
(function(){
  function stateFor(config, board, edition){
    const offseason = /pre[ -]?season|off[ -]?season|draft|keeper/i.test(config?.phase || '');
    if(offseason) return 'offseason';
    if(!board || Number(board.season) !== Number(config?.seasonYear)) return 'unknown';
    const games = Array.isArray(board.matchups) ? board.matchups : [];
    if(!games.length) return 'upcoming';
    if(games.every(game => game.state === 'final')){
      const recap = edition?.source_status === 'verified_final'
        && edition?.validation_status === 'valid'
        && Number(edition.season) === Number(board.season)
        && Number(edition.week) === Number(board.week);
      return recap ? 'recap' : 'final';
    }
    return games.some(game => ['live', 'final'].includes(game.state)) ? 'live' : 'upcoming';
  }

  function render(){
    const home = document.getElementById('home');
    const now = home?.querySelector('.home-band-now');
    const story = home?.querySelector('.home-band-story');
    if(!now || !story) return;
    const config = window.gateSiteConfig;
    const board = window.gateHomeBoard;
    const state = stateFor(config, board, window.gateHomeEdition);
    const feature = document.getElementById('homeWeeklyFeature');
    const prep = document.getElementById('homeSeasonPrep');
    const scoreboard = document.getElementById('weekBoard');
    const pulse = home.querySelector('.home-pulse');
    const odds = document.getElementById('championshipOdds');
    const heading = now.querySelector('.home-band-head');
    // Move actual nodes so reading and keyboard order match the visual order.
    // Repeated events leave an already-correct layout alone (including focus).
    function place(nodes, anchor){
      let previous = anchor;
      for(const node of nodes.filter(Boolean)){
        if(node !== previous?.nextElementSibling) previous?.after(node);
        previous = node;
      }
    }
    const lead = state === 'recap' ? feature : state === 'offseason' ? prep : null;
    place([lead, state !== 'offseason' ? scoreboard : null], heading);
    place([state !== 'recap' ? feature : null, odds, pulse, state !== 'offseason' ? prep : null], story.querySelector('.home-band-head'));
    // Keep last season's scoreboard out of the offseason lead without deleting it.
    if(state === 'offseason' && scoreboard && story.lastElementChild !== scoreboard) story.append(scoreboard);
    if(pulse) pulse.hidden = state === 'offseason';
    home.dataset.homeState = state;
    const title = document.getElementById('homeNowTitle');
    if(title) title.textContent = state === 'offseason' ? 'Draft & Keepers' : state === 'recap' ? 'The Week in Review' : 'This Week';
    const context = home.querySelector('[data-home-context]');
    if(context) context.textContent = ({live:'Week in progress · Scores and standings', final:'Final scores · Recap to follow', recap:'Final scores and the weekly story', offseason:'Get ready for the season', upcoming:'Upcoming matchups and standings', unknown:'Scores and standings'})[state];
    const primary = home.querySelector('[data-home-primary]');
    if(primary){
      primary.dataset.scrollTo = state === 'recap' ? 'homeWeeklyFeature' : state === 'offseason' ? 'homeSeasonPrep' : 'weekBoard';
      primary.textContent = state === 'recap' ? 'Read This Week' : state === 'offseason' ? 'Draft & Keepers' : state === 'final' ? 'See Final Scores' : 'See This Week';
    }
    const lede = home.querySelector('.hero-copy > p:not(.hero-tagline)');
    if(lede && ['live','upcoming'].includes(state)) lede.textContent = `${board.phase || `Week ${board.week}`} ${state === 'live' ? 'is in progress' : 'is on the board'}. Follow the matchups, standings, and championship odds.`;
    if(lede && state === 'offseason') lede.textContent = 'Prepare for the next season: keepers, the draft board, and the league story.';
    if(lede && ['recap','final'].includes(state)) lede.textContent = `${board.phase || `Week ${board.week}`} is final. ${state === 'recap' ? 'Catch up on the weekly edition, then see the results and standings.' : 'See the results and standings while the weekly recap is prepared.'}`;
  }
  function openDraftArchive(){
    window.switchView?.('history', {scroll:false});
    const draftTab = document.querySelector('[data-history-tab="drafts"]');
    if(draftTab){
      window.gateHistory?.show?.('drafts');
      draftTab.focus?.({preventScroll:true});
      draftTab.scrollIntoView?.({block:'nearest', inline:'nearest'});
      return 'drafts';
    }
    // The Season Vault contains a draft recap for every archived season, so it is
    // a safe fallback if the richer Drafts module did not initialize.
    window.gateHistory?.show?.('seasons');
    document.querySelector('[data-history-tab="seasons"]')?.focus?.({preventScroll:true});
    return 'seasons';
  }
  window.gateHomeLayout = Object.freeze({stateFor, render, openDraftArchive});
  ['gate:site-ready', 'gate:home-board-ready', 'gate:home-edition-ready'].forEach(name => document.addEventListener(name, render));
  document.querySelector('[data-home-draft]')?.addEventListener('click', openDraftArchive);
  render();
})();
