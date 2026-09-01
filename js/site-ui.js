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

    renderPulse(config);
    renderFutures(config);
    renderWeekBoard();
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

function renderPulse(config){
  const favorite = Array.isArray(config.futures) ? config.futures[0] : null;
  const target = document.querySelector('[data-home-favorite]');
  if(target && favorite?.name && favorite?.odds){
    target.textContent = `${favorite.name} ${favorite.odds}`;
  }
}

function recordLine(team){
  const wins = Number(team.wins || 0);
  const losses = Number(team.losses || 0);
  const ties = Number(team.ties || 0);
  return ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

function pointsLine(value){
  if(value == null || value === '') return '\u2014';
  const number = Number(value);
  if(!Number.isFinite(number)) return '\u2014';
  return Number.isInteger(number) ? String(number) : number.toFixed(1).replace(/\.0$/, '');
}

function gameSide(side, className, escapeHtml){
  const score = side?.score == null ? '\u2014' : pointsLine(side.score);
  return `<div class="week-game-side ${className}">
    <strong>${escapeHtml(side?.team || 'Team')}</strong>
    <span>${escapeHtml(side?.owner || '')}</span>
    <b>${escapeHtml(score)}</b>
  </div>`;
}

function renderWeekBoardFrom(payload){
  const escapeHtml = window.gateShared?.escapeHtml || (value => String(value ?? ''));
  const matchupsHost = document.querySelector('[data-week-matchups]');
  const standingsHost = document.querySelector('[data-week-standings]');
  const matchups = Array.isArray(payload.matchups) ? payload.matchups : [];
  const standings = Array.isArray(payload.standings) ? payload.standings : [];
  if(matchupsHost && matchups.length){
    matchupsHost.innerHTML = matchups.map(game => `<article class="week-game">
      ${gameSide(game.away, 'is-away', escapeHtml)}
      <div class="week-game-vs">at</div>
      ${gameSide(game.home, 'is-home', escapeHtml)}
    </article>`).join('');
  }
  if(standingsHost && standings.length){
    standingsHost.innerHTML = `<div class="week-standings-wrap"><table class="week-standings-table"><thead><tr><th>Team</th><th>Mgr</th><th>Rec</th><th>PF</th></tr></thead><tbody>${
      standings.map(team => `<tr>
        <td>${escapeHtml(team.team || 'Team')}</td>
        <td>${escapeHtml(team.owner || '')}</td>
        <td>${escapeHtml(recordLine(team))}</td>
        <td>${escapeHtml(pointsLine(team.pointsFor))}</td>
      </tr>`).join('')
    }</tbody></table></div><p class="week-standings-note">${escapeHtml(payload.note || 'Records stay 0-0 until kickoff.')}</p>`;
  }
}

async function renderWeekBoard(){
  if(!document.querySelector('[data-week-matchups]') && !document.querySelector('[data-week-standings]')) return;
  try{
    const response = await fetch('data/current-season.json', {cache:'no-store'});
    if(!response.ok) throw new Error(`current-season.json returned HTTP ${response.status}`);
    renderWeekBoardFrom(await response.json());
  }catch(error){
    console.warn('Unable to refresh the Week 1 board; keeping the HTML fallback.', error);
  }
}
