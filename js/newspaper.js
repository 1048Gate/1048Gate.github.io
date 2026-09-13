(function initializeNewspaperModule(){
  'use strict';

  const {escapeHtml: esc} = window.gateShared;
  const WEEKLY_INDEX_PATH = 'data/newspaper_editions/index.json';
  const HISTORICAL_PATH = 'data/newspaper_editions/historical_2023.json';

  const editionConfig = Object.freeze({
    historical: {
      path: HISTORICAL_PATH,
      label: 'Historical Edition',
      route: 'newspaper',
      status: 'historical archive data'
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
      .filter(entry => entry.validation_status === 'valid' && entry.source_status === 'verified_final')
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

    if(editionKey === 'historical' && data.stories.length !== 9){
      throw new Error(`Historical edition expected 9 verified stories; found ${data.stories.length}.`);
    }
    if(editionKey === 'weekly'){
      if(!Number.isInteger(data.week)) throw new Error('Weekly edition is missing a week number.');
      if(data.validation_status && data.validation_status !== 'valid'){
        throw new Error('Weekly edition is not marked valid.');
      }
      if(data.source_status && data.source_status !== 'verified_final'){
        throw new Error('Weekly edition is not a verified final recap.');
      }
    }
    return data;
  }

  function renderEmptyWeekly(){
    return `
      <div class="edition-empty" role="status">
        <span class="edition-kicker">1048 Gate Weekly Press</span>
        <h2>No weekly edition has been published yet</h2>
        <p>The 2026 newspaper publishes after a fantasy week is final. Live or incomplete slates are not printed as recaps. The 2023 demonstration file is not current coverage.</p>
      </div>`;
  }

  function renderEditionMarkup(data, editionKey){
    const historical = editionKey === 'historical';
    const title = historical
      ? `${data.league_name || '1048 Gate'} \u2014 ${data.season} Season Historical Edition`
      : `${data.league_name || '1048 Gate'} \u2014 ${data.season} Week ${data.week} Edition`;
    const notice = historical
      ? 'A retrospective edition built from the verified league archive.'
      : 'Verified weekly recap built from the finalized 2026 league board.';
    const status = historical
      ? editionConfig.historical.status
      : (data.source_status === 'verified_final' ? 'verified 2026 weekly edition' : editionConfig.weekly.status);

    const stories = data.stories.map((story, index) => `
      <article class="story-item${index === 0 ? ' story-lead' : ''}">
        <div class="story-meta">
          <span>${esc(formatStoryType(story.story_type))}</span>
          <span>Story ${String(index + 1).padStart(2, '0')}</span>
        </div>
        <h3 class="story-title">${esc(story.title)}</h3>
        <p class="story-body">${esc(story.body)}</p>
        <p class="story-source">Source: ${esc(formatSourceTrace(story.source))}</p>
      </article>`).join('');

    const weekMeta = Number.isInteger(data.week) ? `<span>Week ${esc(data.week)}</span>` : '';
    return `
      <header class="edition-header">
        <span class="edition-kicker">${historical ? '1048 Gate Newspaper Archive' : '1048 Gate Weekly Newspaper'}</span>
        <h2>${esc(title)}</h2>
        <p>${esc(notice)}</p>
        <div class="edition-meta">
          <span>Season ${esc(data.season)}</span>
          <span>Edition ${esc(data.edition_year)}</span>
          ${weekMeta}
        </div>
      </header>
      <div class="edition-status" aria-label="Source status: ${esc(status)}"><span class="status-dot"></span>${esc(status)}</div>
      <div class="edition-stories">${stories}</div>
      <footer class="edition-footer"><small>Deterministic edition \u00b7 claims limited to checked-in sources</small></footer>`;
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
          closeSources();
          currentEditionKey = 'weekly';
          return;
        }
        const data = validateEdition(await fetchJson(selected.path), 'weekly');
        if(sequence !== loadSequence) return;
        currentEditionKey = 'weekly';
        container.innerHTML = renderEditionMarkup(data, 'weekly');
        renderSourceList(data);
        return;
      }

      const data = validateEdition(await fetchJson(config.path), editionKey);
      if(sequence !== loadSequence) return;
      currentEditionKey = editionKey;
      container.innerHTML = renderEditionMarkup(data, editionKey);
      renderSourceList(data);
    }catch(error){
      if(sequence !== loadSequence) return;
      console.error(`Failed to load ${config.label}:`, error);
      showEditionError(config, error);
    }
  }

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
