// 1048 Gate Trade Talk — server-paginated canonical accepted-trade archive.
(function(){
  const section = document.getElementById('trades');
  if(!section) return;

  const {escapeHtml:esc} = window.gateShared;
  const PAGE_SIZE = 100;
  let currentSeasonYear = null;
  let supabase = null;
  let loadPromise = null;
  let activeYear = null;
  let seasons = [];
  const tradesByYear = new Map();

  function setSync(state, text){
    const sync = document.getElementById('tradeSync');
    if(!sync) return;
    sync.classList.remove('is-live','is-error');
    if(state) sync.classList.add(state);
    sync.innerHTML = `<span></span>${esc(text)}`;
  }

  function buildTrade(row){
    const items = Array.isArray(row.items) ? row.items : [];
    const teams = [];
    const sides = new Map();
    const addTeam = team => {
      if(!team || sides.has(team)) return;
      teams.push(team);
      sides.set(team, {gives:[], receives:[]});
    };
    for(const item of items){
      addTeam(item.from_team_name);
      addTeam(item.to_team_name);
    }
    for(const item of items){
      if(item.from_team_name) sides.get(item.from_team_name)?.gives.push(item.player_name || 'Player unavailable');
      if(item.to_team_name) sides.get(item.to_team_name)?.receives.push(item.player_name || 'Player unavailable');
    }
    return {...row, items, teams, sides, dateMs:Number(row.transaction_date_ms || new Date(row.transaction_date).getTime() || 0)};
  }

  async function loadSeason(year){
    if(tradesByYear.has(year)) return tradesByYear.get(year);
    const {data, error} = await supabase.rpc('get_transaction_archive', {
      p_page:1,
      p_page_size:PAGE_SIZE,
      p_season_year:Number(year),
      p_category:'TRADE_ACCEPT',
      p_search:null,
      p_sort:'newest'
    });
    if(error) throw error;
    const rows = (data?.items || []).map(buildTrade);
    tradesByYear.set(Number(year), rows);
    return rows;
  }

  function formatDay(ms){
    return new Intl.DateTimeFormat(undefined, {weekday:'long', month:'long', day:'numeric', year:'numeric'}).format(new Date(ms));
  }
  function formatTime(ms){
    return new Intl.DateTimeFormat(undefined, {hour:'numeric', minute:'2-digit'}).format(new Date(ms));
  }
  const listNames = names => names.length ? names.map(name => `<strong>${esc(name)}</strong>`).join(', ') : '<em>future considerations</em>';

  function renderDetailStatus(trade){
    if(trade.source_detail_status === 'verified') return '<span class="transaction-detail-status">Source-verified player movement</span>';
    if(trade.source_detail_status === 'proposal_derived') return '<span class="transaction-detail-status">Player movement reconstructed from the recorded proposal</span>';
    return '<div class="trade-details-unavailable"><strong>Trade accepted</strong><span>ESPN did not retain player details for this deal in the imported archive.</span></div>';
  }

  function renderTradeCard(trade){
    const sideBlocks = trade.items.length
      ? trade.teams.map(team => {
          const side = trade.sides.get(team);
          return `<div class="trade-side"><span class="trade-team">${esc(team)}</span><div class="trade-gives"><small>Sends</small><p>${listNames(side.gives)}</p></div><div class="trade-receives"><small>Receives</small><p>${listNames(side.receives)}</p></div></div>`;
        }).join('<span class="trade-swap" aria-hidden="true">⇄</span>')
      : '';
    return `<article class="panel trade-card"><header class="trade-card-head"><time datetime="${trade.dateMs ? new Date(trade.dateMs).toISOString() : ''}">${esc(trade.dateMs ? formatDay(trade.dateMs) : 'Date unavailable')}</time><span>${esc(trade.dateMs ? formatTime(trade.dateMs) : 'Time unavailable')}${trade.scoring_period ? ` · Week ${esc(trade.scoring_period)}` : ''}</span></header><div class="trade-card-body">${sideBlocks}${renderDetailStatus(trade)}</div></article>`;
  }

  async function renderYear(year){
    activeYear = Number(year);
    const nav = document.getElementById('tradeYearNav');
    nav.querySelectorAll('button').forEach(btn => btn.classList.toggle('active', Number(btn.dataset.tradeYear) === activeYear));
    const meta = document.getElementById('tradeSeasonMeta');
    const feed = document.getElementById('tradeFeed');
    feed.innerHTML = '<div class="panel transaction-empty"><strong>Loading accepted trades…</strong><span>Reading the selected season only.</span></div>';
    try{
      const trades = await loadSeason(activeYear);
      const playersMoved = new Set(trades.flatMap(trade => [...trade.sides.values()].flatMap(side => [...side.gives, ...side.receives]))).size;
      const proposalDerived = trades.filter(trade => trade.source_detail_status === 'proposal_derived').length;
      const missing = trades.filter(trade => trade.source_detail_status === 'missing').length;
      meta.textContent = trades.length ? `${trades.length} accepted deal${trades.length === 1 ? '' : 's'} · ${playersMoved} player${playersMoved === 1 ? '' : 's'} changed teams${proposalDerived ? ` · ${proposalDerived} proposal-derived` : ''}${missing ? ` · ${missing} source gap${missing === 1 ? '' : 's'}` : ''}` : '';
      feed.innerHTML = trades.length ? trades.map(renderTradeCard).join('') : `<div class="panel transaction-empty"><strong>No accepted trades in ${esc(activeYear)}.</strong><span>${activeYear === currentSeasonYear ? 'Deals will appear here as they are accepted.' : 'A quiet deadline season, apparently.'}</span></div>`;
      setSync('is-live', 'Archive loaded');
    }catch(error){
      console.error('Unable to load selected trade season:', error);
      setSync('is-error', 'Sync unavailable');
      feed.innerHTML = `<div class="panel transaction-empty transaction-error"><strong>Trade history could not load.</strong><span>${esc(error.message || 'Please try again shortly.')}</span></div>`;
    }
  }

  function renderNav(){
    const nav = document.getElementById('tradeYearNav');
    const years = seasons.map(entry => Number(entry.season_year)).sort((a,b) => b-a);
    if(currentSeasonYear && !years.includes(currentSeasonYear)) years.unshift(currentSeasonYear);
    nav.innerHTML = years.map(year => {
      const entry = seasons.find(candidate => Number(candidate.season_year) === Number(year));
      const label = year === currentSeasonYear ? `${year} · Current` : String(year);
      const count = Number(entry?.accepted_trade_count || 0);
      return `<button type="button" data-trade-year="${year}" class="${Number(activeYear) === Number(year) ? 'active' : ''}">${esc(label)}${count ? ` <i>${count}</i>` : ''}</button>`;
    }).join('');
  }

  async function loadArchive(){
    if(loadPromise) return loadPromise;
    setSync(null, 'Loading trade archive…');
    loadPromise = (async()=>{
      try{
        if(!currentSeasonYear){
          try{
            const site = await fetch('data/site.json', {cache:'no-store'});
            if(site.ok) currentSeasonYear = Number((await site.json()).seasonYear) || null;
          }catch(_){}
        }
        supabase = window.gateSupabase || await (window.gateSupabaseReady || Promise.resolve(null));
        if(!supabase) throw new Error('The league database connection is unavailable.');
        const {data, error} = await supabase.rpc('get_transaction_archive_seasons');
        if(error) throw error;
        seasons = Array.isArray(data) ? data : [];
        renderNav();
        const firstYear = activeYear ?? seasons.map(entry => Number(entry.season_year)).sort((a,b) => b-a)[0] ?? currentSeasonYear;
        if(firstYear) await renderYear(firstYear);
        else document.getElementById('tradeFeed').innerHTML = '<div class="panel transaction-empty"><strong>No trade archive is available yet.</strong><span>Accepted deals will appear here after they are imported.</span></div>';
      }catch(error){
        console.error('Unable to load trade archive:', error);
        loadPromise = null;
        setSync('is-error', 'Sync unavailable');
        document.getElementById('tradeFeed').innerHTML = `<div class="panel transaction-empty transaction-error"><strong>Trade history could not load.</strong><span>${esc(error.message || 'Please try again shortly.')}</span><button class="btn btn-primary" id="tradeRetry" type="button">Retry</button></div>`;
        document.getElementById('tradeRetry')?.addEventListener('click', loadArchive, {once:true});
      }
    })();
    return loadPromise;
  }

  document.getElementById('tradeYearNav').addEventListener('click', event => {
    const button = event.target.closest('button[data-trade-year]');
    if(!button || Number(button.dataset.tradeYear) === Number(activeYear)) return;
    renderYear(button.dataset.tradeYear);
  });

  document.addEventListener('gate:viewchange', event => {
    if(event.detail?.name === 'trades') loadArchive();
  });
  if(section.classList.contains('active')) loadArchive();
})();
