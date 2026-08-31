(async function(){
  try{
    const response = await fetch('data/site.json', {cache:'no-store'});
    if(!response.ok) throw new Error(`site.json returned HTTP ${response.status}`);
    const config = await response.json();
    if(!Number.isInteger(config.seasonYear) || !Number.isInteger(config.seasonNumber)){
      throw new Error('site.json is missing a valid season year or season number.');
    }

    const roman = String(config.seasonRoman || config.seasonNumber);
    const leagueName = String(config.leagueName || '1048 Gate');
    const phase = String(config.phase || 'Pre-Season');
    const brand = `${leagueName.toUpperCase()} SZN ${roman}`;

    document.title = `${leagueName} Szn ${config.seasonNumber}`;
    document.querySelectorAll('[data-site-brand]').forEach(element => {element.textContent = brand});
    document.querySelectorAll('[data-site-edition]').forEach(element => {element.textContent = `SZN ${roman}`});
    document.querySelectorAll('[data-site-year]').forEach(element => {element.textContent = String(config.seasonYear)});
    document.querySelectorAll('[data-site-season-label]').forEach(element => {element.textContent = `Season ${config.seasonNumber}`});
    document.querySelectorAll('[data-site-phase]').forEach(element => {element.textContent = phase});
    document.querySelectorAll('[data-site-season]').forEach(element => {element.textContent = `${config.seasonYear} SEASON \u00b7 ${phase.toUpperCase()}`});
    document.querySelectorAll('[data-site-footer]').forEach(element => {element.textContent = `${leagueName} Szn ${config.seasonNumber}`});
    document.querySelectorAll('[data-site-season-number]').forEach(element => {element.textContent = String(config.seasonNumber)});
    document.querySelectorAll('meta[name="description"],meta[property="og:description"],meta[name="twitter:description"]').forEach(element => {
      element.setAttribute('content', `${element.getAttribute('content').replace(/\s*Now in its \d+(st|nd|rd|th) season\.?\s*$/,'')} Now in its ${config.seasonNumber}${['th','st','nd','rd'][config.seasonNumber%10>3||Math.floor(config.seasonNumber/10)%10===1?0:config.seasonNumber%10] || 'th'} season.`);
    });
    if(Array.isArray(config.transactionRange) && config.transactionRange.length===2){
      const range=`${config.transactionRange[0]}–${config.transactionRange[1]}`;
      document.querySelectorAll('[data-archive-years]').forEach(element => {element.textContent = range});
    }

    renderDraftOrder(config);
    renderFutures(config);
    renderLiveStats();
    window.gateSiteConfig = config;
    document.dispatchEvent(new CustomEvent('gate:site-ready', {detail:config}));
  }catch(error){
    console.warn('Unable to load site season settings; keeping the HTML fallback labels.', error);
  }
})();

function renderFutures(config){
  const target = document.querySelector('[data-futures]');
  if(!target) return;
  const futures = Array.isArray(config.futures) ? config.futures : [];
  if(!futures.length){
    target.innerHTML = '<div class="futures-empty">Odds will be posted before the season starts.</div>';
    return;
  }
  const escapeHtml = window.gateShared?.escapeHtml || (value => String(value ?? ''));
  target.innerHTML = futures.map((entry, index) => `
    <div class="futures-row${index === 0 ? ' is-favorite' : ''}">
      <span class="futures-odds">${escapeHtml(entry.odds || '')}</span>
      <div class="futures-body">
        <strong>${escapeHtml(entry.name || '')}</strong>
        <p>${escapeHtml(entry.case || '')}</p>
      </div>
    </div>`).join('');
}

async function renderLiveStats(){
  const set=(selector,value)=>document.querySelectorAll(selector).forEach(el=>{el.textContent=value});
  try{
    const [seasonRes,matchupRes,memberRes]=await Promise.all([
      fetch('data/seasons.json',{cache:'no-store'}),
      fetch('data/matchups.json',{cache:'no-store'}),
      fetch('data/members.json',{cache:'no-store'})
    ]);
    const seasons=seasonRes.ok?(await seasonRes.json()).seasons||[]:[];
    const matchups=matchupRes.ok?await matchupRes.json():{};
    const members=memberRes.ok?(await memberRes.json()).members||[]:[];
    const years=seasons.map(s=>Number(s[0])).filter(Number.isFinite);
    if(years.length){
      set('[data-stat-seasons]', String(years.length));
      set('[data-stat-established]', String(Math.min(...years)));
    }
    if(Number.isFinite(Number(matchups.gameCount))) set('[data-stat-games]', Number(matchups.gameCount).toLocaleString('en-US'));
    if(members.length) set('[data-stat-managers]', String(members.length));
  }catch(error){
    console.warn('Unable to refresh live league stats; keeping HTML fallback values.', error);
  }
}

function renderDraftOrder(config){
  const target = document.querySelector('[data-draft-order]');
  if(!target) return;
  const order = Array.isArray(config.draftOrder) ? config.draftOrder : [];
  if(!order.length){
    target.innerHTML = '<div class="draft-order-empty">Draft order will be announced before the draft.</div>';
    return;
  }
  const shared = window.gateShared || {};
  const escapeHtml = shared.escapeHtml || (value => String(value ?? ''));
  const names = order.map(entry => String(entry.name ?? '')).filter(Boolean);
  shared.memberPresentation?.setRoster?.(names);
  const initialsFor = shared.memberPresentation?.initialsFor || (() => '—');
  const currentPick = Number(config.draftNight?.currentPick) || 1;
  target.innerHTML = order.map(entry => {
    const pick = Number(entry.pick);
    const name = String(entry.name ?? '');
    const onClock = pick === currentPick;
    return `<div class="draft-pick-card${onClock ? ' is-on-clock' : ''}${pick === 1 ? ' is-first' : ''}" data-draft-pick="${escapeHtml(pick || '')}">
      <span class="draft-pick-num" aria-hidden="true">${escapeHtml(pick || '')}</span>
      <span class="member-avatar draft-pick-avatar"><span class="member-initials">${escapeHtml(initialsFor(name))}</span></span>
      <div class="draft-pick-meta"><strong>${escapeHtml(name)}</strong><span>Pick ${escapeHtml(pick || '')}${onClock ? ' \u00b7 On the clock' : ''}</span></div>
      ${onClock ? '<span class="draft-clock-badge">On the clock</span>' : ''}
    </div>`;
  }).join('');
  window.gateDraftNight?.paintBoard?.();
}
