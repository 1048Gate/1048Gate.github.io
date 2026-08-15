(function(){
  const section = document.getElementById('transactions');
  if(!section) return;

  const {escapeHtml:esc} = window.gateShared;
  const PAGE_SIZE = 25;
  const CHUNK_SIZE = 1000;
  const TYPE_LABELS = Object.freeze({
    FREEAGENT:'Free-agent move',
    WAIVER:'Waiver claim',
    FUTURE_ROSTER:'Future lineup',
    ROSTER:'Lineup change',
    TRADE_PROPOSAL:'Trade proposal',
    TRADE_ACCEPT:'Trade accepted',
    TRADE_UPHOLD:'Trade upheld',
    TRADE_DECLINE:'Trade declined',
    TRADE_VETO:'Trade vetoed'
  });
  const STATUS_LABELS = Object.freeze({
    EXECUTED:'Executed',
    CANCELED:'Canceled',
    PENDING:'Pending',
    FAILED_INVALIDPLAYERSOURCE:'Invalid player source',
    FAILED_PLAYERALREADYDROPPED:'Player already dropped',
    FAILED_ROSTERLIMIT:'Roster limit',
    FAILED_POSITIONLIMIT:'Position limit',
    UNKNOWN:'Status unavailable'
  });

  let supabase = null;
  let transactions = [];
  let items = [];
  let itemsByTransaction = new Map();
  let loadPromise = null;
  let loaded = false;
  let page = 1;
  let searchTimer = null;
  const progress = {transactions:0, transactionTotal:null, items:0, itemTotal:null};

  const controls = {
    search:document.getElementById('transactionSearch'),
    season:document.getElementById('transactionSeason'),
    type:document.getElementById('transactionType'),
    status:document.getElementById('transactionStatus'),
    sort:document.getElementById('transactionSort'),
    reset:document.getElementById('transactionReset')
  };

  const clean = value => String(value ?? '').trim().replace(/\s+/g, ' ');
  const number = value => Number(value || 0).toLocaleString();
  const slug = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';
  const labelType = value => TYPE_LABELS[value] || clean(value).toLowerCase().replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase());
  const labelStatus = value => STATUS_LABELS[value || 'UNKNOWN'] || clean(value).toLowerCase().replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase());
  const transactionKey = row => `${row.season_year}|${row.espn_transaction_id}`;

  function setControlsDisabled(disabled){
    Object.values(controls).forEach(control => {if(control) control.disabled = disabled});
  }

  function updateProgress(){
    const details = [
      `${number(progress.transactions)}${progress.transactionTotal === null ? '' : `/${number(progress.transactionTotal)}`} events`,
      `${number(progress.items)}${progress.itemTotal === null ? '' : `/${number(progress.itemTotal)}`} item moves`
    ].join(' · ');
    const progressNode = document.getElementById('transactionLoadProgress');
    const sync = document.getElementById('transactionSync');
    if(progressNode) progressNode.textContent = details;
    if(sync) sync.innerHTML = `<span></span>${esc(details)}`;
  }

  async function fetchAll(table, columns, progressKey, totalKey){
    const loadRange = async (start, includeCount = false) => {
      const query = supabase.from(table)
        .select(columns, includeCount ? {count:'exact'} : undefined)
        .order('season_year', {ascending:false})
        .order('id', {ascending:true})
        .range(start, start + CHUNK_SIZE - 1);
      const {data, error, count} = await query;
      if(error) throw error;
      return {start, rows:data || [], count};
    };

    const first = await loadRange(0, true);
    if(Number.isFinite(first.count)) progress[totalKey] = first.count;
    progress[progressKey] = first.rows.length;
    updateProgress();
    if(first.rows.length < CHUNK_SIZE) return first.rows;

    if(!Number.isFinite(first.count)){
      const rows = [...first.rows];
      for(let start = CHUNK_SIZE; ; start += CHUNK_SIZE){
        const batch = await loadRange(start);
        rows.push(...batch.rows);
        progress[progressKey] = rows.length;
        updateProgress();
        if(batch.rows.length < CHUNK_SIZE) return rows;
      }
    }

    const starts = [];
    for(let start = CHUNK_SIZE; start < first.count; start += CHUNK_SIZE) starts.push(start);
    const batches = [first];
    let cursor = 0;
    const worker = async () => {
      while(cursor < starts.length){
        const start = starts[cursor++];
        const batch = await loadRange(start);
        batches.push(batch);
        progress[progressKey] += batch.rows.length;
        updateProgress();
      }
    };
    await Promise.all(Array.from({length:Math.min(3, starts.length)}, worker));
    return batches.sort((a,b) => a.start - b.start).flatMap(batch => batch.rows);
  }

  function prepareArchive(){
    transactions = transactions.map(row => ({
      ...row,
      season_year:Number(row.season_year),
      scoring_period:Number(row.scoring_period || 0),
      team_name:clean(row.team_name),
      status:row.status || 'UNKNOWN',
      transaction_date_ms:Number(row.transaction_date_ms || new Date(row.transaction_date).getTime() || 0),
      item_count:Number(row.item_count || 0)
    }));
    items = items.map(item => ({
      ...item,
      season_year:Number(item.season_year),
      item_index:Number(item.item_index || 0),
      item_type:item.item_type || 'UNKNOWN',
      player_name:clean(item.player_name),
      from_team_name:clean(item.from_team_name),
      to_team_name:clean(item.to_team_name)
    }));

    itemsByTransaction = new Map();
    for(const item of items){
      const key = transactionKey(item);
      if(!itemsByTransaction.has(key)) itemsByTransaction.set(key, []);
      itemsByTransaction.get(key).push(item);
    }
    for(const group of itemsByTransaction.values()) group.sort((a,b) => a.item_index - b.item_index);

    for(const transaction of transactions){
      const related = itemsByTransaction.get(transactionKey(transaction)) || [];
      transaction.searchText = [
        transaction.team_name,
        transaction.transaction_type,
        transaction.status,
        transaction.espn_transaction_id,
        ...related.flatMap(item => [item.player_name, item.from_team_name, item.to_team_name, item.item_type])
      ].join(' ').toLowerCase();
    }
  }

  function populateFilters(){
    const years = [...new Set(transactions.map(row => row.season_year))].sort((a,b) => b-a);
    const types = [...new Set(transactions.map(row => row.transaction_type).filter(Boolean))]
      .sort((a,b) => labelType(a).localeCompare(labelType(b)));
    const statuses = [...new Set(transactions.map(row => row.status).filter(value => value && value !== 'EXECUTED'))]
      .sort((a,b) => labelStatus(a).localeCompare(labelStatus(b)));
    controls.season.innerHTML = '<option value="all">All seasons</option>' + years.map(year => `<option value="${year}">${year}</option>`).join('');
    controls.type.innerHTML = '<option value="all">All activity</option>' + types.map(type => `<option value="${esc(type)}">${esc(labelType(type))}</option>`).join('');
    controls.status.innerHTML = '<option value="EXECUTED">Executed</option><option value="all">All statuses</option>' + statuses.map(status => `<option value="${esc(status)}">${esc(labelStatus(status))}</option>`).join('');
  }

  function renderSummary(){
    const executed = transactions.filter(row => row.status === 'EXECUTED').length;
    const archiveYears = [...new Set(transactions.map(row => row.season_year))].sort((a,b) => a-b);
    const seasons = archiveYears.length;
    const archiveSpan = seasons ? `${archiveYears[0]} through ${archiveYears.at(-1)}` : 'No archived seasons';
    document.getElementById('transactionSummary').innerHTML = [
      ['Events', number(transactions.length), 'Every ESPN action'],
      ['Player moves', number(items.length), 'Adds, drops, trades & lineups'],
      ['Executed', number(executed), `${transactions.length ? Math.round(executed / transactions.length * 100) : 0}% completed`],
      ['Seasons', number(seasons), archiveSpan]
    ].map(([label,value,note]) => `<div class="transaction-summary-card"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join('');
  }

  function filteredTransactions(){
    const query = clean(controls.search.value).toLowerCase();
    const year = controls.season.value;
    const type = controls.type.value;
    const status = controls.status.value;
    return transactions.filter(row => {
      if(year !== 'all' && row.season_year !== Number(year)) return false;
      if(type !== 'all' && row.transaction_type !== type) return false;
      if(status !== 'all' && row.status !== status) return false;
      return !query || row.searchText.includes(query);
    }).sort((a,b) => controls.sort.value === 'oldest'
      ? a.transaction_date_ms - b.transaction_date_ms
      : b.transaction_date_ms - a.transaction_date_ms);
  }

  function renderItem(item){
    const type = item.item_type;
    const player = item.player_name || (item.player_id ? `Player ${item.player_id}` : 'Roster item');
    const from = item.from_team_name;
    const to = item.to_team_name;
    let movement = 'Roster activity recorded';
    if(type === 'ADD') movement = `${from || 'Free agency'} → ${to || 'Roster'}`;
    if(type === 'DROP') movement = `${from || 'Roster'} → ${to || 'Free agency'}`;
    if(type === 'TRADE') movement = `${from || 'Previous team'} → ${to || 'New team'}`;
    if(type === 'LINEUP') movement = `${to || from || 'Team roster'} lineup adjustment`;
    return `<li class="transaction-item transaction-item-${slug(type)}">
      <span class="transaction-item-mark" aria-hidden="true">${esc(type === 'LINEUP' ? 'L' : type.slice(0,1))}</span>
      <div><strong>${esc(player)}</strong><span>${esc(movement)}</span></div>
      <small>${esc(type === 'UNKNOWN' ? 'ITEM' : type)}</small>
    </li>`;
  }

  function formatDate(row){
    if(!row.transaction_date_ms) return 'Date unavailable';
    return new Intl.DateTimeFormat(undefined, {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(row.transaction_date_ms));
  }

  function renderCard(row){
    const related = itemsByTransaction.get(transactionKey(row)) || [];
    const bid = Number(row.bid_amount || 0);
    const typeLabel = labelType(row.transaction_type);
    const statusLabel = labelStatus(row.status);
    return `<article class="transaction-card" data-status="${slug(row.status)}">
      <header class="transaction-card-head">
        <div class="transaction-card-title">
          <span class="transaction-type transaction-type-${slug(row.transaction_type)}">${esc(typeLabel)}</span>
          <span class="transaction-status status-${slug(row.status)}">${esc(statusLabel)}</span>
        </div>
        <time datetime="${esc(row.transaction_date || '')}">${esc(formatDate(row))}</time>
      </header>
      <div class="transaction-card-body">
        <div class="transaction-actor">
          <span>${row.season_year} season${row.scoring_period ? ` · Week ${row.scoring_period}` : ''}</span>
          <strong>${esc(row.team_name || 'League transaction')}</strong>
          <small>${bid > 0 ? `$${number(bid)} FAAB bid` : `${related.length || row.item_count} item${(related.length || row.item_count) === 1 ? '' : 's'}`}</small>
        </div>
        ${related.length
          ? `<ul class="transaction-items">${related.map(renderItem).join('')}</ul>`
          : '<div class="transaction-no-items">This status event has no player movement attached. It may be a proposal, decline, veto, canceled action, or failed request.</div>'}
      </div>
      <details class="transaction-technical"><summary>Record details</summary><dl>
        <div><dt>ESPN transaction</dt><dd>${esc(row.espn_transaction_id)}</dd></div>
        <div><dt>Team ID</dt><dd>${row.team_id ?? '—'}</dd></div>
        <div><dt>Scoring period</dt><dd>${row.scoring_period || '—'}</dd></div>
        <div><dt>Recorded items</dt><dd>${row.item_count}</dd></div>
      </dl></details>
    </article>`;
  }

  function renderPagination(totalPages){
    const host = document.getElementById('transactionPagination');
    if(totalPages <= 1){host.innerHTML='';return}
    host.innerHTML = `<button type="button" data-page="${page-1}" ${page === 1 ? 'disabled' : ''}>← Previous</button><span>Page <strong>${page}</strong> of ${totalPages}</span><button type="button" data-page="${page+1}" ${page === totalPages ? 'disabled' : ''}>Next →</button>`;
  }

  function render(){
    if(!loaded) return;
    const filtered = filteredTransactions();
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    page = Math.min(page, totalPages);
    const start = (page - 1) * PAGE_SIZE;
    const visible = filtered.slice(start, start + PAGE_SIZE);
    document.getElementById('transactionResultCount').textContent = `${number(filtered.length)} matching event${filtered.length === 1 ? '' : 's'}`;
    document.getElementById('transactionResultRange').textContent = filtered.length ? `Showing ${number(start + 1)}–${number(start + visible.length)}` : 'Adjust the filters to widen your search.';
    document.getElementById('transactionDefaultNote').hidden = controls.status.value !== 'EXECUTED' || controls.search.value || controls.type.value !== 'all' || controls.season.value !== 'all';
    document.getElementById('transactionFeed').innerHTML = visible.length
      ? visible.map(renderCard).join('')
      : '<div class="panel transaction-empty"><strong>No transactions match those filters.</strong><span>Try another player, team, season, activity, or status.</span></div>';
    renderPagination(totalPages);
  }

  async function loadArchive(){
    if(loaded) return;
    if(loadPromise) return loadPromise;
    setControlsDisabled(true);
    loadPromise = (async()=>{
      try{
        supabase = window.gateSupabase || await (window.gateSupabaseReady || Promise.resolve(null));
        if(!supabase) throw new Error('The league database connection is unavailable.');
        [transactions, items] = await Promise.all([
          fetchAll('league_transactions', 'id,season_year,espn_transaction_id,scoring_period,transaction_type,status,team_id,team_name,bid_amount,transaction_date_ms,transaction_date,item_count', 'transactions', 'transactionTotal'),
          fetchAll('league_transaction_items', 'id,season_year,espn_transaction_id,item_index,item_type,player_id,player_name,from_team_id,from_team_name,to_team_id,to_team_name', 'items', 'itemTotal')
        ]);
        prepareArchive();
        populateFilters();
        renderSummary();
        loaded = true;
        setControlsDisabled(false);
        const sync = document.getElementById('transactionSync');
        sync.classList.add('is-live');
        sync.innerHTML = '<span></span>Archive synced';
        render();
      }catch(error){
        console.error('Unable to load transaction archive:', error);
        loadPromise = null;
        const sync = document.getElementById('transactionSync');
        sync.classList.add('is-error');
        sync.innerHTML = '<span></span>Sync unavailable';
        document.getElementById('transactionFeed').innerHTML = `<div class="panel transaction-empty transaction-error"><strong>Transaction history could not load.</strong><span>${esc(error.message || 'Please try again shortly.')}</span><button class="btn btn-primary" id="transactionRetry" type="button">Retry</button></div>`;
        document.getElementById('transactionRetry')?.addEventListener('click', loadArchive, {once:true});
      }
    })();
    return loadPromise;
  }

  for(const control of [controls.season, controls.type, controls.status, controls.sort]){
    control.addEventListener('change', () => {page=1;render()});
  }
  controls.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {page=1;render()}, 120);
  });
  controls.reset.addEventListener('click', () => {
    controls.search.value='';
    controls.season.value='all';
    controls.type.value='all';
    controls.status.value='EXECUTED';
    controls.sort.value='newest';
    page=1;
    render();
    controls.search.focus();
  });
  document.getElementById('transactionPagination').addEventListener('click', event => {
    const button = event.target.closest('button[data-page]');
    if(!button || button.disabled) return;
    page = Number(button.dataset.page);
    render();
    document.querySelector('.transaction-results-head')?.scrollIntoView({behavior:'smooth', block:'start'});
  });

  document.addEventListener('gate:viewchange', event => {
    if(event.detail?.name === 'transactions') loadArchive();
  });
  if(section.classList.contains('active')) loadArchive();
  else setControlsDisabled(true);
})();
