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
    return games.some(game => game.state === 'live') ? 'live' : 'upcoming';
  }

  function render(){
    const home = document.getElementById('home');
    const now = home?.querySelector('.home-band-now');
    const story = home?.querySelector('.home-band-story');
    const archive = home?.querySelector('.home-band-archive');
    if(!now || !story || !archive) return;
    const config = window.gateSiteConfig;
    const board = window.gateHomeBoard;
    const state = stateFor(config, board, window.gateHomeEdition);
    const feature = document.getElementById('homeWeeklyFeature');
    const prep = document.getElementById('homeSeasonPrep');
    const scoreboard = document.getElementById('weekBoard');
    const pulse = home.querySelector('.league-pulse');
    const odds = document.getElementById('championshipOdds');
    const dashboard = home.querySelector('.home-dashboard');
    const orientation = archive.querySelector('.orientation-panel');
    const heading = now.querySelector('.home-band-head');
    function place(nodes, anchor){
      let previous = anchor;
      for(const node of nodes.filter(Boolean)){
        if(node !== previous?.nextElementSibling) previous?.after(node);
        previous = node;
      }
    }
    const lead = state === 'recap' ? feature : state === 'offseason' ? prep : null;
    place([lead, state !== 'offseason' ? scoreboard : null], heading);
    if(prep) prep.hidden=state!=='offseason';
    /* desk order handled above */
    place([orientation,dashboard],archive.querySelector('.home-band-head'));
    if(state === 'offseason' && scoreboard && story.lastElementChild !== scoreboard) story.append(scoreboard);
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
    const lede = home.querySelector('[data-home-lede], .hero-copy > p:not(.hero-tagline)');
    /* site-ui.js owns the live/upcoming lede from board + odds; only fill the states it skips. */
    if(lede && state === 'offseason') lede.textContent = 'Offseason desk: keepers, the draft board, and the archive.';
    if(lede && ['recap','final'].includes(state)) lede.textContent = `${board.phase || `Week ${board.week}`} is final. ${state === 'recap' ? 'Weekly edition below, then the results and standings.' : 'Results and standings are posted; the weekly recap is still being prepared.'}`;

    /* Keep the numbered desk sections in order under the Story band. */
    const storyHead = story.querySelector('.home-band-head');
    const deskIds = ['deskStandings','deskLeaders','deskPlayoff','deskTransactions','deskHistory'];
    const deskNodes = deskIds.map(id => document.getElementById(id)).filter(Boolean);
    place([...deskNodes, odds, state !== 'recap' ? feature : null, pulse], storyHead);
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
    window.gateHistory?.show?.('seasons');
    document.querySelector('[data-history-tab="seasons"]')?.focus?.({preventScroll:true});
    return 'seasons';
  }
  window.gateHomeLayout = Object.freeze({stateFor, render, openDraftArchive});
  ['gate:site-ready', 'gate:home-board-ready', 'gate:home-edition-ready'].forEach(name => document.addEventListener(name, render));
  document.querySelector('[data-home-draft]')?.addEventListener('click', openDraftArchive);
  render();
})();
