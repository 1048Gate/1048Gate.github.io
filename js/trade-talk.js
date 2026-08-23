// 1048 Gate Trade Talk — season-by-season archive of accepted trades.
(function(){
  const section = document.getElementById('trades');
  if(!section) return;

  const {escapeHtml:esc} = window.gateShared;
  const CHUNK_SIZE = 1000;
  let currentSeasonYear = null;

  let supabase = null;
  let loadPromise = null;
  let tradesByYear = new Map();
  let activeYear = null;

  const clean = value => String(value ?? '').trim().replace(/\s+/g, ' ');

  function setSync(state, text){
    const sync = document.getElementById('tradeSync');
    if(!sync) return;
    sync.classList.remove('is-live','is-error');
    if(state) sync.classList.add(state);
    sync.innerHTML = `<span></span>${esc(text)}`;
  }

  async function fetchAll(table, columns){
    const rows = [];
    for(let start = 0; ; start += CHUNK_SIZE){
      const {data, error} = await supabase.from(table)
        .select(columns)
        .order('season_year', {ascending:false})
        .order('id', {ascending:true})
        .range(start, start + CHUNK_SIZE - 1);
      if(error) throw error;
      rows.push(...(data || []));
      if(!data || data.length < CHUNK_SIZE) return rows;
    }
  }

  function buildArchive(transactions, items){
    const itemsByTransaction = new Map();
    for(const item of items){
      const key = `${item.season_year}|${item.espn_transaction_id}`;
      if(!itemsByTransaction.has(key)) itemsByTransaction.set(key, []);
      itemsByTransaction.get(key).push(item);
    }

    tradesByYear = new Map();
    for(const row of transactions){
      const key = `${row.season_year}|${row.espn_transaction_id}`;
      const related = (itemsByTransaction.get(key) || [])
        .map(item => ({
          player:clean(item.player_name),
          from:clean(item.from_team_name),
          to:clean(item.to_team_name)
        }))
        .filter(item => item.player && (item.from || item.to));
      if(!related.length) continue;

      const teams = new Set();
      related.forEach(item => {
        if(item.from) teams.add(item.from);
        if(item.to) teams.add(item.to);
      });

      const dateMs = Number(row.transaction_date_ms || new Date(row.transaction_date).getTime() || 0);
      const trade = {
        id:key,
        dateMs,
        week:Number(row.scoring_period || 0),
        teams:[...teams],
        sides:new Map()
      };
      for(const team of trade.teams) trade.sides.set(team, {gives:[], receives:[]});
      for(const item of related){
        if(item.from && trade.sides.has(item.from)) trade.sides.get(item.from).gives.push(item.player);
        if(item.to && trade.sides.has(item.to)) trade.sides.get(item.to).receives.push(item.player);
      }
      const year = Number(row.season_year);
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
    const sideBlocks = trade.teams.map(team => {
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
    meta.textContent = trades.length
      ? `${trades.length} accepted trade${trades.length === 1 ? '' : 's'} · ${playersMoved} player${playersMoved === 1 ? '' : 's'} changed teams`
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
          fetchAll('league_transactions', 'id,season_year,espn_transaction_id,scoring_period,transaction_type,status,team_name,transaction_date_ms,transaction_date'),
          fetchAll('league_transaction_items', 'id,season_year,espn_transaction_id,item_index,item_type,player_name,from_team_name,to_team_name')
        ]);
        // Legacy ESPN trade imports leave status null; only CANCELED trades are excluded.
        const executed = transactions.filter(row => row.transaction_type === 'TRADE_ACCEPT' && (row.status === null || row.status === 'EXECUTED'));
        const tradeKeys = new Set(executed.map(row => `${row.season_year}|${row.espn_transaction_id}`));
        buildArchive(executed, items.filter(item => tradeKeys.has(`${item.season_year}|${item.espn_transaction_id}`)));
        setSync('is-live', 'Archive synced');
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
