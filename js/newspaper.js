(function initializeNewspaperModule(){
  'use strict';

  const {escapeHtml: esc} = window.gateShared;
  const editionConfig = Object.freeze({
    historical: {
      path: 'data/newspaper_editions/historical_2023.json',
      label: 'Historical Edition',
      route: 'newspaper',
      status: 'historical archive data'
    },
    weekly_fallback: {
      path: 'data/newspaper_editions/weekly_fallback_2023.json',
      label: 'Weekly Archive Demonstration',
      route: 'weekly',
      status: 'cached demonstration data'
    }
  });

  let currentEditionKey = null;
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
    return [dataset, locator, detail].filter(Boolean).join(' — ');
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
    return data;
  }

  function renderEditionMarkup(data, editionKey){
    const historical = editionKey === 'historical';
    const title = historical
      ? `${data.league_name || '1048 Gate'} — ${data.season} Season Historical Edition`
      : `${data.league_name || '1048 Gate'} — Weekly Archive Demonstration`;
    const notice = historical
      ? 'A retrospective edition built from the verified league archive.'
      : 'Demonstration only — this is not current-season ESPN coverage.';
    const status = editionConfig[editionKey].status;

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

    return `
      <header class="edition-header">
        <span class="edition-kicker">1048 Gate Newspaper Archive</span>
        <h2>${esc(title)}</h2>
        <p>${esc(notice)}</p>
        <div class="edition-meta">
          <span>Season ${esc(data.season)}</span>
          <span>Edition ${esc(data.edition_year)}</span>
          ${Number.isInteger(data.week) ? `<span>Week ${esc(data.week)}</span>` : ''}
        </div>
      </header>
      <div class="edition-status" aria-label="Source status: ${esc(status)}"><span class="status-dot"></span>${esc(status)}</div>
      <div class="edition-stories">${stories}</div>
      <footer class="edition-footer"><small>Deterministic edition · no generated or paid-AI claims</small></footer>`;
  }

  function renderSourceList(data){
    const list = document.getElementById('editionSourcesList');
    const toggle = document.getElementById('editionSourcesToggle');
    if(!list || !toggle) return;

    const entries = [];
    if(data.source_trace) entries.push(`Edition: ${formatSourceTrace(data.source_trace)}`);
    data.stories.forEach((story, index) => {
      entries.push(`${String(index + 1).padStart(2, '0')} · ${story.title}: ${formatSourceTrace(story.source)}`);
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

  async function loadEdition(editionKey){
    const config = editionConfig[editionKey];
    if(!config) throw new Error(`Unknown edition: ${editionKey}`);
    const sequence = ++loadSequence;
    const container = document.getElementById('editionContent');
    if(!container) return;

    setActiveTab(editionKey);
    container.innerHTML = `<div class="edition-loading"><span>Loading ${esc(config.label)}…</span></div>`;

    try {
      const response = await fetch(config.path, {cache:'no-store'});
      if(!response.ok) throw new Error(`edition file returned HTTP ${response.status}`);
      const data = validateEdition(await response.json(), editionKey);
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
    return window.location.hash === '#weekly' ? 'weekly_fallback' : 'historical';
  }

  function selectEdition(editionKey, {updateHistory = true} = {}){
    const route = routeForEdition(editionKey);
    if(updateHistory && window.location.hash !== `#${route}`){
      history.pushState({view:'newspaper', edition:editionKey}, '', `#${route}`);
    }
    closeSources();
    return loadEdition(editionKey);
  }

  document.getElementById('editionTabs')?.addEventListener('click', event => {
    const tab = event.target.closest('.edition-tab[data-edition]');
    if(tab) selectEdition(tab.dataset.edition);
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
    formatSourceTrace,
    loadEdition,
    selectEdition
  });
})();
