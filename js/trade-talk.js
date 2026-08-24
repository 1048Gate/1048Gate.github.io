// 1048 Gate Trade Talk — season-by-season archive of accepted trades.
(function(){
  const section = document.getElementById('trades');
  if(!section) return;

  const {escapeHtml:esc, buildAcceptedTradeArchive} = window.gateShared;
  const CHUNK_SIZE = 1000;
  let currentSeasonYear = null;

  let supabase = null;
  let loadPromise = null;
  let tradesByYear = new Map();
  let activeYear = null;

  function setSync(state, text){
    const sync = document.getElementById('tradeSync');
    if(!sync) return;
    sync.classList.remove('is-live','is-error');
    if(state) sync.classList.add(state);
    sync.innerHTML = `<span></span>${esc(text)}`;
  }

  async function fetchAll(table, columns, filter){
    const rows = [];
    for(let start = 0; ; start += CHUNK_SIZE){
      let query = supabase.from(table)
        .select(columns)
        .order('season_year', {ascending:false})
        .order('id', {ascending:true});
      if(filter) query = query.in(filter.column, filter.values);
      const {data, error} = await query.range(start, start + CHUNK_SIZE - 1);
      if(error) throw error;
      rows.push(...(data || []));
      if(!data || data.length < CHUNK_SIZE) return rows;
    }
  }

  function buildArchive(transactions, items){
    tradesByYear = new Map();
    for(const canonicalTrade of buildAcceptedTradeArchive(transactions, items)){
      const trade = {
        ...canonicalTrade,
        dateMs:canonicalTrade.transaction_date_ms,
        week:canonicalTrade.scoring_period
      };
      const year = Number(trade.season_year);
      if(!tradesByYear.has(year)) tradesByYear.set(year, []);
      tradesByYear.get(year).push(trade);
    }

    for(const list of tradesByYear.values()) list.sort((a,b) => b.dateMs - a.dateMs);
  }

  function formatDay(ms){
    return new Intl.DateTimeFormat(undefined, {weekday:'long', month:'long', day:'numeric', year:'numeric'}).format(new Date(ms));
  }
  function formatTime(ms){
    return new Intl.DateTimeFormat(undefined, {hour:'numeric', minute:'2-digit'}).format(new Date(ms));
  }
  const listNames = names => names.length ? names.map(name => `<strong>${esc(name)}</strong>`).join(', ') : '<em>future considerations</em>';

  function renderTradeCard(trade){
    const sideBlocks = trade.incomplete
      ? `<div class="trade-details-unavailable"><strong>Trade accepted</strong><span>ESPN did not retain the player details for this deal in the imported archive.</span></div>`
      : trade.teams.map(team => {
      const side = trade.sides.get(team);
      return `<div class="trade-side">
        <span class="trade-team">${esc(team)}</span>
        <div class="trade-gives"><small>Sends</small><p>${listNames(side.gives)}</p></div>
        <div class="trade-receives"><small>Receives</small><p>${listNames(side.receives)}</p></div>
      </div>`;
      }).join(`<span class="trade-swap" aria-hidden="true">⇄</span>`);

    return `<article class="panel trade-card">
      <header class="trade-card-head">
        <time datetime="${new Date(trade.dateMs).toISOString()}">${esc(formatDay(trade.dateMs))}</time>
        <span>${esc(formatTime(trade.dateMs))}${trade.week ? ` · Week ${trade.week}` : ''}</span>
      </header>
      <div class="trade-card-body">${sideBlocks}</div>
    </article>`;
  }

  function renderYear(year){
    activeYear = year;
    const nav = document.getElementById('tradeYearNav');
    nav.querySelectorAll('button').forEach(btn => btn.classList.toggle('active', Number(btn.dataset.tradeYear) === Number(year)));
    const meta = document.getElementById('tradeSeasonMeta');
    const feed = document.getElementById('tradeFeed');
    const trades = tradesByYear.get(Number(year)) || [];
    const playersMoved = new Set(trades.flatMap(t => [...t.teams.flatMap(team => t.sides.get(team).gives)])).size;
    const incompleteTrades = trades.filter(trade => trade.incomplete).length;
    meta.textContent = trades.length
      ? `${trades.length} accepted deal${trades.length === 1 ? '' : 's'} · ${playersMoved} player${playersMoved === 1 ? '' : 's'} changed teams${incompleteTrades ? ` · ${incompleteTrades} source gap${incompleteTrades === 1 ? '' : 's'}` : ''}`
      : '';
    feed.innerHTML = trades.length
      ? trades.map(renderTradeCard).join('')
      : `<div class="panel transaction-empty"><strong>No accepted trades in ${esc(year)}.</strong><span>${Number(year) === currentSeasonYear ? 'Deals will appear here as they are accepted.' : 'A quiet deadline season, apparently.'}</span></div>`;
  }

  function renderNav(){
    const nav = document.getElementById('tradeYearNav');
    const years = [...tradesByYear.keys()].sort((a,b) => b-a);
    if(currentSeasonYear && !years.includes(currentSeasonYear)) years.unshift(currentSeasonYear);
    nav.innerHTML = years.map(year => {
      const label = year === currentSeasonYear ? `${year} · Current` : String(year);
      const count = (tradesByYear.get(year) || []).length;
      return `<button type="button" data-trade-year="${year}" class="${Number(activeYear) === Number(year) ? 'active' : ''}">${esc(label)}${count ? ` <i>${count}</i>` : ''}</button>`;
    }).join('');
  }

  function render(){
    renderNav();
    renderYear(activeYear !== null ? activeYear : ([...tradesByYear.keys()].sort((a,b) => b-a)[0] || currentSeasonYear));
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
        const [transactions, items] = await Promise.all([
          fetchAll('league_transactions', 'id,season_year,espn_transaction_id,related_transaction_id,scoring_period,transaction_type,status,team_name,transaction_date_ms,transaction_date', {column:'transaction_type', values:['TRADE_ACCEPT']}),
          fetchAll('league_transaction_archive_items', 'id,season_year,espn_transaction_id,item_index,item_type,player_id,player_name,from_team_id,from_team_name,to_team_id,to_team_name', {column:'item_type', values:['TRADE']})
        ]);
        buildArchive(transactions, items);
        setSync('is-live', 'Archive loaded');
        render();
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
