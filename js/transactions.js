(function(){
  const section = document.getElementById('transactions');
  if(!section) return;

  const {escapeHtml:esc} = window.gateShared;
  const PAGE_SIZE = 35;
  const TYPE_LABELS = Object.freeze({
    FREEAGENT:'Add / drop',
    WAIVER:'Successful waiver',
    TRADE_ACCEPT:'Accepted trade'
  });

  let supabase = null;
  let loaded = false;
  let loading = false;
  let page = 1;
  let activeCategory = 'TRADE_ACCEPT';
  let searchTimer = null;
  let summaryCounts = null;
  let currentArchive = null;

  const controls = {
    search:document.getElementById('transactionSearch'),
    season:document.getElementById('transactionSeason'),
    sort:document.getElementById('transactionSort'),
    reset:document.getElementById('transactionReset')
  };

  const clean = value => String(value ?? '').trim().replace(/\s+/g, ' ');
  const number = value => Number(value || 0).toLocaleString();
  const slug = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';
  const labelType = value => TYPE_LABELS[value] || clean(value).toLowerCase().replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase());

  function setControlsDisabled(disabled){
    Object.values(controls).forEach(control => {if(control) control.disabled = disabled;});
  }

  function setSync(state, text){
    const sync = document.getElementById('transactionSync');
    if(!sync) return;
    sync.classList.remove('is-live','is-error');
    if(state) sync.classList.add(state);
    sync.innerHTML = `<span></span>${esc(text)}`;
  }

  function rpcArgs(category = activeCategory, requestedPage = page, requestedPageSize = PAGE_SIZE){
    return {
      p_page:requestedPage,
      p_page_size:requestedPageSize,
      p_season_year:controls.season.value === 'all' ? null : Number(controls.season.value),
      p_category:category,
      p_search:clean(controls.search.value) || null,
      p_sort:controls.sort.value
    };
  }

  async function fetchArchive(category = activeCategory, requestedPage = page, requestedPageSize = PAGE_SIZE){
    const {data, error} = await supabase.rpc('get_transaction_archive', rpcArgs(category, requestedPage, requestedPageSize));
    if(error) throw error;
    return data || {page:requestedPage, page_size:requestedPageSize, total_count:0, items:[]};
  }

  async function populateSeasons(){
    const {data, error} = await supabase.rpc('get_transaction_archive_seasons');
    if(error) throw error;
    const years = (data || []).map(row => Number(row.season_year)).filter(Number.isFinite).sort((a,b) => b-a);
    controls.season.innerHTML = '<option value="all">All seasons</option>' + years.map(year => `<option value="${year}">${year}</option>`).join('');
  }

  async function loadSummary(){
    const categories = ['all','FREEAGENT','WAIVER','TRADE_ACCEPT'];
    const entries = await Promise.all(categories.map(async category => [category, await fetchArchive(category, 1, 1)]));
    summaryCounts = Object.fromEntries(entries.map(([category, payload]) => [category, Number(payload.total_count || 0)]));
  }

  function renderSummary(){
    const totals = summaryCounts || {};
    const entries = [
      ['all','All activity',totals.all,'Every completed move'],
      ['FREEAGENT','Adds & drops',totals.FREEAGENT,'Completed free-agent moves'],
      ['WAIVER','Successful waivers',totals.WAIVER,'Completed claims only'],
      ['TRADE_ACCEPT','Accepted trades',totals.TRADE_ACCEPT,'Canonicalized deal archive']
    ];
    document.getElementById('transactionSummary').innerHTML = entries.map(([key,label,value,note]) => `<button class="transaction-summary-card ${activeCategory === key ? 'active' : ''}" type="button" data-transaction-category="${key}" aria-pressed="${activeCategory === key}"><span>${label}</span><strong>${value === undefined ? '—' : number(value)}</strong><small>${note}</small></button>`).join('');
  }

  function renderItem(item){
    const type = item.item_type;
    const player = item.player_name || 'Player unavailable';
    const from = item.from_team_name;
    const to = item.to_team_name;
    let verb = 'Moved';
    let movement = `${from || 'Previous team'} → ${to || 'New team'}`;
    if(type === 'ADD'){
      verb = 'Added';
      movement = `to ${to || 'the roster'}`;
    }
    if(type === 'DROP'){
      verb = 'Dropped';
      movement = `from ${from || 'the roster'}`;
    }
    if(type === 'TRADE') verb = 'Traded';
    return `<li class="transaction-item transaction-item-${slug(type)}"><span class="transaction-item-verb">${esc(verb)}</span><strong>${esc(player)}</strong><span class="transaction-item-route">${esc(movement)}</span></li>`;
  }

  function dateKey(row){
    if(!row.transaction_date_ms) return 'unknown';
    const date = new Date(Number(row.transaction_date_ms));
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }

  function formatDay(row){
    if(!row.transaction_date_ms) return 'Date unavailable';
    return new Intl.DateTimeFormat(undefined, {weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(new Date(Number(row.transaction_date_ms)));
  }

  function formatTime(row){
    if(!row.transaction_date_ms) return 'Time unavailable';
    return new Intl.DateTimeFormat(undefined, {hour:'numeric',minute:'2-digit'}).format(new Date(Number(row.transaction_date_ms)));
  }

  function detailNote(row){
    if(row.transaction_type !== 'TRADE_ACCEPT') return '';
    if(row.source_detail_status === 'proposal_derived') return '<span class="transaction-detail-status">Player movement reconstructed from the recorded proposal</span>';
    if(row.source_detail_status === 'verified') return '';
    const related = Array.isArray(row.items) ? row.items : [];
    if(related.length) return '';
    return '<div class="transaction-no-items">ESPN recorded this accepted deal, but its player details are missing from the source archive.</div>';
  }

  function renderLedgerRow(row){
    const related = Array.isArray(row.items) ? row.items : [];
    const bid = Number(row.bid_amount || 0);
    const typeLabel = labelType(row.transaction_type);
    return `<article class="transaction-ledger-row" data-type="${slug(row.transaction_type)}"><span class="transaction-ledger-marker" aria-hidden="true"></span><div class="transaction-ledger-main"><div class="transaction-ledger-heading"><strong>${esc(row.team_name || 'League transaction')}</strong><span class="transaction-type transaction-type-${slug(row.transaction_type)}">${esc(typeLabel)}</span></div>${related.length ? `<ul class="transaction-items">${related.map(renderItem).join('')}</ul>` : ''}${detailNote(row)}</div><div class="transaction-ledger-meta"><time datetime="${esc(row.transaction_date || '')}">${esc(formatTime(row))}</time><span>${esc(row.season_year)}${row.scoring_period ? ` · Week ${esc(row.scoring_period)}` : ''}</span>${bid > 0 ? `<strong>$${number(bid)} FAAB</strong>` : ''}</div></article>`;
  }

  function renderDayGroup(rows){
    const first = rows[0];
    return `<section class="transaction-day"><header class="transaction-day-head"><time datetime="${dateKey(first)}">${esc(formatDay(first))}</time><span>${rows.length} event${rows.length === 1 ? '' : 's'}</span></header><div class="transaction-ledger">${rows.map(renderLedgerRow).join('')}</div></section>`;
  }

  function renderPagination(totalCount){
    const host = document.getElementById('transactionPagination');
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    if(totalPages <= 1){host.innerHTML=''; return;}
    host.innerHTML = `<button type="button" data-page="${page-1}" ${page === 1 ? 'disabled' : ''}>← Previous</button><span>Page <strong>${page}</strong> of ${totalPages}</span><button type="button" data-page="${page+1}" ${page === totalPages ? 'disabled' : ''}>Next →</button>`;
  }

  function render(){
    const payload = currentArchive || {total_count:0, items:[]};
    const rows = Array.isArray(payload.items) ? payload.items : [];
    document.getElementById('transactionResultCount').textContent = `${number(payload.total_count)} matching activit${Number(payload.total_count) === 1 ? 'y' : 'ies'}`;
    const start = rows.length ? (page - 1) * PAGE_SIZE + 1 : 0;
    document.getElementById('transactionResultRange').textContent = rows.length ? `Showing ${number(start)}–${number(start + rows.length - 1)}` : 'Adjust the filters to widen your search.';
    const groups = [];
    for(const row of rows){
      const key = dateKey(row);
      const latest = groups.at(-1);
      if(latest?.key === key) latest.rows.push(row);
      else groups.push({key, rows:[row]});
    }
    document.getElementById('transactionFeed').innerHTML = rows.length ? groups.map(group => renderDayGroup(group.rows)).join('') : '<div class="panel transaction-empty"><strong>No transactions match those filters.</strong><span>Try another player, team, season, or activity category.</span></div>';
    renderPagination(Number(payload.total_count || 0));
  }

  async function loadArchive({refreshSummary = false} = {}){
    if(loading) return;
    loading = true;
    setControlsDisabled(true);
    setSync(null, loaded ? 'Updating archive…' : 'Loading archive…');
    try{
      supabase = window.gateSupabase || await (window.gateSupabaseReady || Promise.resolve(null));
      if(!supabase) throw new Error('The league database connection is unavailable.');
      if(!loaded){
        await populateSeasons();
        refreshSummary = true;
      }
      if(refreshSummary || !summaryCounts){
        await loadSummary();
        renderSummary();
      }
      currentArchive = await fetchArchive();
      loaded = true;
      render();
      setSync('is-live', 'Archive loaded');
    }catch(error){
      console.error('Unable to load transaction archive:', error);
      setSync('is-error', 'Sync unavailable');
      document.getElementById('transactionFeed').innerHTML = `<div class="panel transaction-empty transaction-error"><strong>Transaction history could not load.</strong><span>${esc(error.message || 'Please try again shortly.')}</span><button class="btn btn-primary" id="transactionRetry" type="button">Retry</button></div>`;
      document.getElementById('transactionRetry')?.addEventListener('click', () => loadArchive({refreshSummary:true}), {once:true});
    }finally{
      loading = false;
      setControlsDisabled(false);
    }
  }

  for(const control of [controls.season, controls.sort]){
    control.addEventListener('change', () => {page = 1; loadArchive({refreshSummary:control === controls.season});});
  }
  controls.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {page = 1; loadArchive();}, 250);
  });
  controls.reset.addEventListener('click', () => {
    controls.search.value = '';
    controls.season.value = 'all';
    controls.sort.value = 'newest';
    activeCategory = 'TRADE_ACCEPT';
    page = 1;
    loadArchive({refreshSummary:true});
    controls.search.focus();
  });
  document.getElementById('transactionJumpTrades')?.addEventListener('click', () => {
    activeCategory = 'TRADE_ACCEPT';
    page = 1;
    renderSummary();
    loadArchive();
    document.querySelector('.transaction-results-head')?.scrollIntoView({behavior:'smooth', block:'start'});
  });
  document.getElementById('transactionPagination').addEventListener('click', event => {
    const button = event.target.closest('button[data-page]');
    if(!button || button.disabled) return;
    page = Number(button.dataset.page);
    loadArchive();
    document.querySelector('.transaction-results-head')?.scrollIntoView({behavior:'smooth', block:'start'});
  });
  document.getElementById('transactionSummary').addEventListener('click', event => {
    const button = event.target.closest('[data-transaction-category]');
    if(!button) return;
    activeCategory = button.dataset.transactionCategory;
    page = 1;
    renderSummary();
    loadArchive();
  });

  document.addEventListener('gate:viewchange', event => {
    if(event.detail?.name === 'transactions') loadArchive();
  });
  if(section.classList.contains('active')) loadArchive();
  else setControlsDisabled(true);
})();
