(function initializeNewspaperModule(){
  'use strict';

  const {escapeHtml: esc} = window.gateShared;
  const WEEKLY_INDEX_PATH = 'data/newspaper_editions/index.json';
  const HISTORICAL_PATH = 'data/newspaper_editions/historical_archive.json';

  const editionConfig = Object.freeze({
    historical: {
      path: HISTORICAL_PATH,
      label: 'League History',
      route: 'newspaper',
      status: 'verified all-season archive'
    },
    weekly: {
      path: WEEKLY_INDEX_PATH,
      label: '2026 Weekly Edition',
      route: 'weekly',
      status: 'verified 2026 weekly edition'
    }
  });

  let currentEditionKey = null;
  let weeklyIndex = null;
  let loadSequence = 0;
  let returnFocus = null;
  let currentWeeklyEdition = null;

  function setExportAvailability(data){
    currentWeeklyEdition = data || null;
    const actions = document.getElementById('weeklyEditionActions');
    const status = document.getElementById('editionExportStatus');
    if(actions) actions.hidden = !currentWeeklyEdition;
    if(status) status.textContent = '';
  }

  function formatStoryType(value){
    return String(value || 'league story')
      .replaceAll('_', ' ')
      .replace(/\b\w/g, letter => letter.toUpperCase());
  }

  function formatSourceTrace(source){
    if(typeof source === 'string') return source;
    if(!source || typeof source !== 'object') return 'Source unavailable';
    const dataset = source.dataset || source.source || '1048 Gate archive';
    const locator = source.locator || source.source_id || source.id || '';
    const detail = source.description || '';
    return [dataset, locator, detail].filter(Boolean).join(' \u2014 ');
  }

  function weeklyEntries(index){
    const editions = Array.isArray(index?.editions) ? index.editions : [];
    return editions
      .filter(entry => entry && entry.mode !== 'historical' && Number.isInteger(entry.season) && Number.isInteger(entry.week))
      .filter(entry => entry.validation_status === 'valid' && ['verified_live','verified_final'].includes(entry.source_status))
      .slice()
      .sort((left, right) => (right.season - left.season) || (right.week - left.week));
  }

  function latestWeeklyEntry(index){
    return weeklyEntries(index)[0] || null;
  }

  function validateEdition(data, editionKey){
    if(!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Edition payload is not an object.');
    if(!Number.isInteger(data.season)) throw new Error('Edition season is missing or invalid.');
    if(!Number.isInteger(data.edition_year)) throw new Error('Edition year is missing or invalid.');
    if(!Array.isArray(data.stories) || data.stories.length === 0) throw new Error('Edition contains no verified stories.');

    data.stories.forEach((story, index) => {
      if(!story || typeof story !== 'object') throw new Error(`Story ${index + 1} is invalid.`);
      if(typeof story.title !== 'string' || !story.title.trim()) throw new Error(`Story ${index + 1} has no title.`);
      if(typeof story.body !== 'string' || !story.body.trim()) throw new Error(`Story ${index + 1} has no body.`);
      if(!story.source) throw new Error(`Story ${index + 1} has no source trace.`);
    });

    if(editionKey === 'historical'){
      if(!Number.isInteger(data.season_start) || !Number.isInteger(data.season_end) || data.season_end < data.season_start){
        throw new Error('Historical edition season range is missing or invalid.');
      }
      const expectedSeasons = Array.from(
        {length:data.season_end - data.season_start + 1},
        (_, index) => data.season_start + index
      );
      const storySeasons = data.stories.map(story => story.season);
      if(storySeasons.some(season => !Number.isInteger(season)) || new Set(storySeasons).size !== storySeasons.length){
        throw new Error('Historical edition contains a missing or duplicate season.');
      }
      if(expectedSeasons.some(season => !storySeasons.includes(season))){
        throw new Error(`Historical edition does not cover every season from ${data.season_start} through ${data.season_end}.`);
      }
    }
    if(editionKey === 'weekly'){
      if(!Number.isInteger(data.week)) throw new Error('Weekly edition is missing a week number.');
      if(data.validation_status && data.validation_status !== 'valid'){
        throw new Error('Weekly edition is not marked valid.');
      }
      if(data.source_status && !['verified_live','verified_final'].includes(data.source_status)){
        throw new Error('Weekly edition is not a verified live or final recap.');
      }
    }
    return data;
  }

  function renderEmptyWeekly(){
    return `
      <div class="edition-empty" role="status">
        <span class="edition-kicker">1048 Gate Weekly Press</span>
        <h2>No weekly edition has been published yet</h2>
        <p>The 2026 newspaper can publish a verified live issue while games are underway, then locks that same week as a final recap after the slate ends. The league-history archive is separate from current coverage.</p>
      </div>`;
  }

  function renderWeeklyEditorial(data){
    if(!data.headline && !data.lead && !data.matchup) return '';
    const lead=data.lead||{};
    const matchup=data.matchup||{};
    const pressure=data.pressure||{};
    const surprise=data.surprise||{};
    const record=data.recordWatch||{};
    const archive=data.archiveComparison||{};
    const notes=Array.isArray(data.tableNotes)?data.tableNotes:[];
    const power=Array.isArray(data.powerTable)?data.powerTable:[];
    const results=Array.isArray(data.results)?data.results:[];
    const records=Array.isArray(data.recordBook)?data.recordBook:[];
    const nextSlate=Array.isArray(data.nextSlate)?data.nextSlate:[];
    const leadTitle=lead.title&&lead.title.trim()!==String(data.headline||'').trim()?lead.title:'The week in view';
    const table=notes.map(note=>`<li><b>${esc(String(note.rank).padStart(2,'0'))}</b><span><strong>${esc(note.team)}</strong><small>${esc(note.owner)} · ${esc(note.record)} · ${esc(note.pointsFor)} PF</small></span><em>${esc(note.tag)}</em></li>`).join('');
    const matchupSides=[{team:matchup.awayTeam,owner:matchup.awayOwner,score:matchup.awayScore},{team:matchup.homeTeam,owner:matchup.homeOwner,score:matchup.homeScore}].sort((left,right)=>Number(right.score)-Number(left.score));
    const powerMarkup=power.map(row=>`<li><b>${esc(String(row.rank).padStart(2,'0'))}</b><span><strong>${esc(row.team)}</strong><small>${esc(row.owner)} · ${esc(row.record)} · ${esc(row.why)}</small></span><em>${esc(row.rating)}</em></li>`).join('');
    const resultsMarkup=results.map(game=>`<li><span><strong>${esc(game.winnerTeam)} (${esc(game.winnerOwner)})</strong><small>over ${esc(game.loserTeam)} (${esc(game.loserOwner)}) · margin ${esc(game.margin)}</small></span><b>${esc(game.winnerScore)}–${esc(game.loserScore)}</b></li>`).join('');
    const recordMarkup=records.map(row=>`<li><span>${esc(row.label)}</span><strong>${esc(row.value)}</strong></li>`).join('');
    const nextMarkup=nextSlate.map(game=>`<li><strong>${esc(game.awayTeam)} (${esc(game.awayOwner)})</strong><span>vs.</span><strong>${esc(game.homeTeam)} (${esc(game.homeOwner)})</strong></li>`).join('');
    return `<section class="weekly-editorial">
      <header class="weekly-editorial-header"><span class="edition-kicker">THE WEEKLY EDITION · ${esc(data.status==='live'?'LIVE':'FINAL')}</span><h3>${esc(data.headline||'The weekly edition')}</h3><p>${esc(data.standfirst||'')}</p><div class="weekly-editorial-meta"><span>Szn ${esc(data.season - 2016)} · Week ${esc(data.week)}</span><span>Updated ${esc(data.updated_at||data.generated_at||'')}</span></div></header>
      ${lead.body?`<article class="weekly-lead"><span class="weekly-kicker">LEAD STORY</span><h4>${esc(leadTitle)}</h4><p>${esc(lead.body)}</p></article>`:''}
      ${matchup.awayTeam?`<article class="weekly-matchup"><div class="weekly-kicker">MATCHUP OF THE WEEK · WINNER FIRST</div><div class="weekly-matchup-score"><div><strong>${esc(matchupSides[0].team)}</strong><small>${esc(matchupSides[0].owner||'')}</small><b>${esc(matchupSides[0].score??'—')}</b></div><span>over</span><div><strong>${esc(matchupSides[1].team)}</strong><small>${esc(matchupSides[1].owner||'')}</small><b>${esc(matchupSides[1].score??'—')}</b></div></div><p><strong>Why it matters:</strong> ${esc(matchup.whyItMatters||'')}</p><p><strong>Edge:</strong> ${esc(matchup.edge||'')}</p></article>`:''}
      ${table?`<section class="weekly-table"><div class="weekly-kicker">${notes.length===12?'THE FULL TABLE':'TOP OF THE TABLE'}</div><ol>${table}</ol></section>`:''}
      <div class="weekly-editorial-grid">${pressure.body?`<article><span class="weekly-kicker">${esc(pressure.label||'EARLY READ')}</span><h4>${esc(pressure.title||pressure.team||'Early read')}</h4><p>${esc(pressure.body)}</p></article>`:''}${surprise.body?`<article><span class="weekly-kicker">BIGGEST SURPRISE</span><h4>${esc(surprise.title||'A surprise from the board')}</h4><p>${esc(surprise.body)}</p></article>`:''}${record.body?`<article><span class="weekly-kicker">RECORD TO WATCH</span><h4>${esc(record.title||'Record watch')}</h4><p>${esc(record.body)}</p>${recordMarkup?`<ul class="weekly-record-lines">${recordMarkup}</ul>`:''}</article>`:''}${archive.body?`<article><span class="weekly-kicker">FROM THE ARCHIVE</span><h4>${esc(archive.title||'Archive comparison')}</h4><p>${esc(archive.body)}</p></article>`:''}</div>
      ${powerMarkup?`<section class="weekly-table"><div class="weekly-kicker">POWER RANKINGS · COMPLETE 1–12</div><ol>${powerMarkup}</ol></section>`:''}
      ${resultsMarkup?`<section class="weekly-board"><div class="weekly-kicker">WEEK ${esc(data.week)} · COMPLETE BOARD</div><ol>${resultsMarkup}</ol></section>`:''}
      ${data.rivalryFile?.body?`<article class="weekly-lead"><span class="weekly-kicker">RIVALRY FILE</span><h4>${esc(data.rivalryFile.title)}</h4><p>${esc(data.rivalryFile.body)}</p></article>`:''}
      ${nextMarkup?`<section class="weekly-slate"><div class="weekly-kicker">UP NEXT · WEEK ${esc(Number(data.week)+1)}</div><ol>${nextMarkup}</ol></section>`:''}
      <footer class="weekly-editorial-source"><span>DATA STATUS · ${esc(data.source_status==='verified_live'?'Live board':'Final board')}</span><small>${esc(data.editorial_note||'Claims limited to checked-in sources.')} · Source: ESPN · ${esc(data.generated_at||data.updated_at||'')}</small></footer>
    </section>`;
  }

  function renderEditionMarkup(data, editionKey){
    const historical = editionKey === 'historical';
    const title = historical
      ? `${data.league_name || '1048 Gate'} \u2014 ${data.season_start}\u2013${data.season_end} League History`
      : `${data.league_name || '1048 Gate'} \u2014 ${data.season} Week ${data.week} Edition`;
    const notice = historical
      ? 'One verified championship recap from every completed league season.'
      : (data.source_status === 'verified_live' ? 'Live weekly edition built from the current 2026 league board.' : 'Verified weekly recap built from the finalized 2026 league board.');
    const status = historical
      ? editionConfig.historical.status
      : (data.source_status === 'verified_live' ? 'live 2026 weekly edition' : data.source_status === 'verified_final' ? 'verified 2026 weekly edition' : editionConfig.weekly.status);

    const coveredWeeklyTypes = new Set(['matchup_recap','closest_game','scoring_leaders','standings','record_watch','rivalry','power_rankings','preseason_order_watch','next_week']);
    const visibleStories = historical ? data.stories : data.stories.filter(story => !coveredWeeklyTypes.has(story.story_type));
    const stories = visibleStories.map((story, index) => `
      <article class="story-item${index === 0 ? ' story-lead' : ''}">
        <div class="story-meta">
          <span>${historical ? `Season ${esc(story.season)} \u00b7 ` : ''}${esc(formatStoryType(story.story_type))}</span>
          <span>Story ${String(index + 1).padStart(2, '0')}</span>
        </div>
        <h3 class="story-title">${esc(story.title)}</h3>
        <p class="story-body">${esc(story.body)}</p>
        <p class="story-source">Source: ${esc(formatSourceTrace(story.source))}</p>
      </article>`).join('');

    const weekMeta = Number.isInteger(data.week) ? `<span>Week ${esc(data.week)}</span>` : '';
    const seasonMeta = historical
      ? `<span>Seasons ${esc(data.season_start)}\u2013${esc(data.season_end)}</span><span>${esc(data.stories.length)} completed seasons</span>`
      : `<span>Season ${esc(data.season)}</span><span>Edition ${esc(data.edition_year)}</span>`;
    return `
      <header class="edition-header">
        <span class="edition-kicker">${historical ? '1048 Gate Newspaper Archive' : '1048 Gate Weekly Newspaper'}</span>
        <h2>${esc(title)}</h2>
        <p>${esc(notice)}</p>
        <div class="edition-meta">
          ${seasonMeta}
          ${weekMeta}
        </div>
      </header>
      <div class="edition-status" aria-label="Source status: ${esc(status)}"><span class="status-dot"></span>${esc(status)}</div>
      ${historical?'':renderWeeklyEditorial(data)}
      ${historical?'':`<h3 class="edition-more-title">More from Week ${esc(data.week)}</h3>`}
      <div class="edition-stories">${stories}</div>
      <footer class="edition-footer"><small>${historical ? 'Verified league archive' : 'Deterministic edition'} \u00b7 claims limited to checked-in sources</small></footer>`;
  }

  function renderSourceList(data){
    const list = document.getElementById('editionSourcesList');
    const toggle = document.getElementById('editionSourcesToggle');
    if(!list || !toggle) return;

    const entries = [];
    if(data.source_trace) entries.push(`Edition: ${formatSourceTrace(data.source_trace)}`);
    data.stories.forEach((story, index) => {
      entries.push(`${String(index + 1).padStart(2, '0')} \u00b7 ${story.title}: ${formatSourceTrace(story.source)}`);
    });
    list.innerHTML = entries.map(entry => `<li>${esc(entry)}</li>`).join('');
    toggle.hidden = entries.length === 0;
  }

  function setActiveTab(editionKey){
    document.querySelectorAll('#editionTabs .edition-tab').forEach(tab => {
      const active = tab.dataset.edition === editionKey;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    const picker = document.getElementById('weeklyEditionPicker');
    if(picker) picker.hidden = editionKey !== 'weekly';
    if(editionKey !== 'weekly') setExportAvailability(null);
  }

  function fillWeeklySelect(index, selectedPath){
    const select = document.getElementById('weeklyEditionSelect');
    if(!select) return;
    const entries = weeklyEntries(index);
    if(!entries.length){
      select.innerHTML = '<option value="">No weekly editions</option>';
      select.disabled = true;
      return;
    }
    select.disabled = false;
    select.innerHTML = entries.map(entry => {
      const selected = entry.path === selectedPath ? ' selected' : '';
      return `<option value="${esc(entry.path)}"${selected}>${esc(entry.season)} \u00b7 Week ${String(entry.week).padStart(2, '0')}</option>`;
    }).join('');
  }

  function showEditionError(config, error){
    const container = document.getElementById('editionContent');
    const toggle = document.getElementById('editionSourcesToggle');
    if(toggle) toggle.hidden = true;
    setExportAvailability(null);
    closeSources();
    if(!container) return;
    container.innerHTML = `
      <div class="edition-error" role="alert">
        <h2>Edition Unavailable</h2>
        <p>${esc(config.label)} could not be loaded: ${esc(error.message)}</p>
        <p class="error-help">Try refreshing this page. If the problem continues, the published edition file needs repair.</p>
      </div>`;
  }

  async function fetchJson(path){
    const response = await fetch(path, {cache:'no-store'});
    if(!response.ok) throw new Error(`edition file returned HTTP ${response.status}`);
    return response.json();
  }

  async function loadWeeklyIndex(){
    try {
      weeklyIndex = await fetchJson(WEEKLY_INDEX_PATH);
    }catch(error){
      weeklyIndex = weeklyIndex || {editions:[]};
    }
    return weeklyIndex;
  }

  async function loadEdition(editionKey, requestedPath){
    const config = editionConfig[editionKey];
    if(!config) throw new Error(`Unknown edition: ${editionKey}`);
    const sequence = ++loadSequence;
    const container = document.getElementById('editionContent');
    if(!container) return;

    setActiveTab(editionKey);
    container.innerHTML = `<div class="edition-loading"><span>Loading ${esc(config.label)}\u2026</span></div>`;

    try {
      if(editionKey === 'weekly'){
        const index = await loadWeeklyIndex();
        if(sequence !== loadSequence) return;
        const entries = weeklyEntries(index);
        const selected = requestedPath
          ? entries.find(entry => entry.path === requestedPath)
          : latestWeeklyEntry(index);
        fillWeeklySelect(index, selected?.path);
        if(!selected){
          container.innerHTML = renderEmptyWeekly();
          const toggle = document.getElementById('editionSourcesToggle');
          if(toggle) toggle.hidden = true;
          setExportAvailability(null);
          closeSources();
          currentEditionKey = 'weekly';
          return;
        }
        const data = validateEdition(await fetchJson(selected.path), 'weekly');
        if(sequence !== loadSequence) return;
        currentEditionKey = 'weekly';
        container.innerHTML = renderEditionMarkup(data, 'weekly');
        setExportAvailability(data);
        renderSourceList(data);
        return;
      }

      const data = validateEdition(await fetchJson(config.path), editionKey);
      if(sequence !== loadSequence) return;
      currentEditionKey = editionKey;
      container.innerHTML = renderEditionMarkup(data, editionKey);
      setExportAvailability(null);
      renderSourceList(data);
    }catch(error){
      if(sequence !== loadSequence) return;
      console.error(`Failed to load ${config.label}:`, error);
      showEditionError(config, error);
    }
  }

  async function loadHomepageFeature(){
    if(typeof document?.querySelector !== 'function')return;
    const target=document.querySelector('[data-weekly-feature]');
    const status=document.querySelector('[data-weekly-feature-status]');
    if(!target)return;
    try{
      const index=await loadWeeklyIndex();
      const selected=latestWeeklyEntry(index);
      if(!selected){
        target.innerHTML='<div class="weekly-feature-empty"><strong>No edition published yet.</strong><span>The first issue will appear after the opening slate is ready.</span></div>';
        if(status)status.textContent='No issue published';
        return;
      }
      const data=validateEdition(await fetchJson(selected.path),'weekly');
      target.innerHTML=`<div class="weekly-feature-card"><div class="weekly-feature-copy"><span class="weekly-kicker">SZN ${esc(data.season-2016)} · WEEK ${esc(data.week)} · ${esc(data.status==='live'?'LIVE':'FINAL')}</span><h3>${esc(data.headline||'The Weekly Edition')}</h3><p>${esc(data.standfirst||'')}</p><button type="button" class="btn btn-primary" data-weekly-open>Read the edition</button></div><div class="weekly-feature-facts"><div><span>TABLE LEADER</span><strong>${esc(data.tableNotes?.[0]?.team||'—')}</strong><small>${esc(data.tableNotes?.[0]?.record||'')} · ${esc(data.tableNotes?.[0]?.pointsFor||'')} PF</small></div><div><span>UNDER PRESSURE</span><strong>${esc(data.pressure?.owner||'—')}</strong><small>${esc(data.pressure?.record||'')} · ${esc(data.pressure?.team||'')}</small></div><div><span>RECORD WATCH</span><strong>${esc(data.recordWatch?.title||'Archive benchmark')}</strong><small>Source-backed editorial note</small></div></div></div>`;
      if(status) window.gateFreshness?.setTimestamp(status,{iso:data.updated_at||data.generated_at,source:data.status==='live'?'Live edition':'Final edition'});
      window.gateHomeEdition = data;
      document.dispatchEvent(new CustomEvent('gate:home-edition-ready', {detail:data}));
      target.querySelector('[data-weekly-open]')?.addEventListener('click',()=>{
        window.switchView?.('office');
        document.querySelector('[data-office-tab="newspaper"]')?.click();
        window.gateNewspaper?.selectEdition('weekly',{path:selected.path});
      });
    }catch(error){
      console.error('Unable to load homepage weekly edition:',error);
      target.innerHTML=`<div class="weekly-feature-empty state-error"><strong>Weekly edition unavailable.</strong><span>${esc(error.message||'Check your connection, then try again.')}</span><button type="button" class="btn btn-primary" data-weekly-retry>Retry</button></div>`;
      if(status)status.textContent='Unavailable · Retry';
      target.querySelector('[data-weekly-retry]')?.addEventListener('click',loadHomepageFeature,{once:true});
    }
  }

  loadHomepageFeature();

  function openSources(){
    const drawer = document.getElementById('editionSourcesDrawer');
    const backdrop = document.getElementById('editionSourcesBackdrop');
    const toggle = document.getElementById('editionSourcesToggle');
    if(!drawer || !backdrop || !toggle || toggle.hidden) return;
    returnFocus = document.activeElement;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    backdrop.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('edition-sources-open');
    document.getElementById('editionSourcesClose')?.focus();
  }

  function closeSources(){
    const drawer = document.getElementById('editionSourcesDrawer');
    const backdrop = document.getElementById('editionSourcesBackdrop');
    const toggle = document.getElementById('editionSourcesToggle');
    drawer?.classList.remove('open');
    drawer?.setAttribute('aria-hidden', 'true');
    if(backdrop) backdrop.hidden = true;
    toggle?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('edition-sources-open');
    if(returnFocus?.isConnected) returnFocus.focus();
    returnFocus = null;
  }

  function routeForEdition(editionKey){
    return editionConfig[editionKey]?.route || 'newspaper';
  }

  function editionForRoute(){
    return window.location.hash === '#weekly' ? 'weekly' : 'historical';
  }

  function selectEdition(editionKey, {updateHistory = true, path} = {}){
    const route = routeForEdition(editionKey);
    if(updateHistory && window.location.hash !== `#${route}`){
      history.pushState({view:'newspaper', edition:editionKey}, '', `#${route}`);
    }
    closeSources();
    return loadEdition(editionKey, path);
  }

  document.getElementById('editionTabs')?.addEventListener('click', event => {
    const tab = event.target.closest('.edition-tab[data-edition]');
    if(tab) selectEdition(tab.dataset.edition);
  });
  document.getElementById('weeklyEditionSelect')?.addEventListener('change', event => {
    const path = event.target.value;
    if(path) loadEdition('weekly', path);
  });
  async function runExport(button, work, successMessage){
    const status = document.getElementById('editionExportStatus');
    if(!currentWeeklyEdition || !window.gateNewspaperExport) return;
    button.disabled = true;
    if(status) status.textContent = 'Preparing your edition…';
    try{
      const result = await work(currentWeeklyEdition);
      if(status) status.textContent = result === 'shared' ? 'Share sheet opened.' : successMessage;
    }catch(error){
      if(error?.name === 'AbortError'){
        if(status) status.textContent = '';
      }else{
        console.error('Edition export failed:', error);
        if(status) status.textContent = 'Could not create that file. Please try again.';
      }
    }finally{
      button.disabled = false;
    }
  }
  document.getElementById('editionPdfDownload')?.addEventListener('click', event => {
    runExport(event.currentTarget, data => window.gateNewspaperExport.downloadPdf(data), 'PDF downloaded.');
  });
  document.getElementById('editionImageDownload')?.addEventListener('click', event => {
    runExport(event.currentTarget, data => window.gateNewspaperExport.downloadImage(data), 'Page-image ZIP downloaded.');
  });
  document.getElementById('editionShare')?.addEventListener('click', event => {
    runExport(event.currentTarget, data => window.gateNewspaperExport.shareImage(data), 'Image downloaded for sharing.');
  });
  document.getElementById('editionSourcesToggle')?.addEventListener('click', openSources);
  document.getElementById('editionSourcesClose')?.addEventListener('click', closeSources);
  document.getElementById('editionSourcesBackdrop')?.addEventListener('click', closeSources);
  document.addEventListener('keydown', event => {
    if(event.key === 'Escape' && document.getElementById('editionSourcesDrawer')?.classList.contains('open')) closeSources();
  });
  document.addEventListener('gate:viewchange', event => {
    if(event.detail?.name === 'newspaper'){
      const requestedEdition = editionForRoute();
      if(currentEditionKey !== requestedEdition) loadEdition(requestedEdition);
    }else{
      closeSources();
    }
  });
  if(window.location.hash === '#newspaper' || window.location.hash === '#weekly'){
    loadEdition(editionForRoute());
  }

  window.gateNewspaper = Object.freeze({
    validateEdition,
    renderEditionMarkup,
    renderEmptyWeekly,
    formatSourceTrace,
    weeklyEntries,
    latestWeeklyEntry,
    loadEdition,
    selectEdition
  });
})();
