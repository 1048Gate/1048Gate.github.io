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
    const brandName = leagueName.toUpperCase();
    const brandEdition = `SZN ${roman}`;
    const brand = `${brandName} ${brandEdition}`;

    document.title = `${leagueName} Szn ${config.seasonNumber}`;
    document.querySelectorAll('[data-site-brand-name]').forEach(element => {element.textContent = brandName});
    document.querySelectorAll('[data-site-edition]').forEach(element => {element.textContent = brandEdition});
    document.querySelectorAll('[data-site-brand]').forEach(element => {
      if(!element.querySelector('[data-site-brand-name]')) element.textContent = brand;
    });
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

    window.gateSiteConfig = config;
    renderPulse(config);
    renderFutures(config);
    renderWeekBoard();
    renderLiveStats();
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
  const preview = 3;
  target.classList.toggle('is-collapsed', futures.length > preview);
  target.innerHTML = futures.map((entry, index) => `
    <div class="futures-row${index === 0 ? ' is-favorite' : ''}">
      <span class="futures-odds">${escapeHtml(entry.odds || '')}</span>
      <div class="futures-body">
        <strong>${escapeHtml(entry.name || '')}</strong>
        <p>${escapeHtml(entry.case || '')}</p>
      </div>
    </div>`).join('');
  document.getElementById('futuresExpand')?.remove();
  if(futures.length <= preview) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'futuresExpand';
  button.className = 'btn btn-ghost home-expand-btn';
  button.textContent = 'Show the rest';
  button.setAttribute('aria-expanded', 'false');
  button.addEventListener('click', () => {
    const collapsed = target.classList.toggle('is-collapsed');
    button.textContent = collapsed ? 'Show the rest' : 'Show top 3';
    button.setAttribute('aria-expanded', String(!collapsed));
  });
  target.insertAdjacentElement('afterend', button);
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

function renderPulse(config, board){
  const favorite = Array.isArray(config.futures) ? config.futures[0] : null;
  const favoriteTarget = document.querySelector('[data-home-favorite]');
  if(favoriteTarget && favorite?.name && favorite?.odds){
    favoriteTarget.textContent = `${favorite.name} ${favorite.odds}`;
  }
  if(!board) return;
  const games = Array.isArray(board.matchups) ? board.matchups.length : 0;
  const gamesTarget = document.querySelector('[data-home-games]');
  if(gamesTarget) gamesTarget.textContent = games === 1 ? '1 game' : `${games} games`;
  const tableTarget = document.querySelector('[data-home-table]');
  if(tableTarget) tableTarget.textContent = tableLine(board.standings || []);
  const lede = document.querySelector('[data-home-lede]');
  if(lede) lede.textContent = homeLede(board, favorite);
}

function tableLine(standings){
  if(!standings.length) return '—';
  const records = new Set(standings.map(recordLine));
  if(records.size === 1){
    const only = [...records][0];
    return only === '0-0' ? 'All 0–0' : `All ${only}`;
  }
  const leader = standings[0];
  return `${leader.owner || leader.team || 'Leader'} ${recordLine(leader)}`;
}

function homeLede(board, favorite){
  const week = board.phase || (board.week ? `Week ${board.week}` : 'This week');
  const games = Array.isArray(board.matchups) ? board.matchups.length : 0;
  const live = (board.matchups || []).filter(game => game.state === 'live').length;
  const table = tableLine(board.standings || []);
  const favoriteText = favorite?.name && favorite?.odds ? `${favorite.name} is ${favorite.odds}.` : 'Championship odds are posted.';
  if(live === 1){
    return `${week} is live. 1 game is scoring. ${favoriteText}`;
  }
  if(live){
    return `${week} is live. ${live} of ${games} games are scoring. ${favoriteText}`;
  }
  if(table === 'All 0–0'){
    return `${week} is on the board. ${games} matchups, a 0–0 table, and the championship odds are live off the rosters.`;
  }
  return `${week} is on the board. ${games} matchups, ${table.toLowerCase()} leads the table. ${favoriteText}`;
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

function sortedStandings(standings){
  return [...standings].sort((a, b) => {
    const winDiff = (Number(b.wins || 0) + 0.5 * Number(b.ties || 0)) - (Number(a.wins || 0) + 0.5 * Number(a.ties || 0));
    if(winDiff) return winDiff;
    return Number(b.pointsFor || 0) - Number(a.pointsFor || 0);
  });
}

function formatFetchedAt(iso){
  if(!iso) return '';
  const date = new Date(iso);
  if(Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit'});
}

function renderWeekBoardFrom(payload){
  const escapeHtml = window.gateShared?.escapeHtml || (value => String(value ?? ''));
  const matchupsHost = document.querySelector('[data-week-matchups]');
  const standingsHost = document.querySelector('[data-week-standings]');
  const matchups = Array.isArray(payload.matchups) ? payload.matchups : [];
  const standings = sortedStandings(Array.isArray(payload.standings) ? payload.standings : []);
  const weekLabel = payload.phase || (payload.week ? `Week ${payload.week}` : 'This week');
  document.querySelectorAll('[data-week-heading]').forEach(el => {el.textContent = weekLabel});
  const stamp = document.querySelector('[data-week-stamp]');
  if(stamp){
    stamp.textContent = payload.note || formatFetchedAt(payload.fetchedAt) || '';
  }
  if(matchupsHost && matchups.length){
    matchupsHost.innerHTML = matchups.map(game => `<article class="week-game${game.state ? ` is-${escapeHtml(game.state)}` : ''}">
      ${gameSide(game.away, 'is-away', escapeHtml)}
      <div class="week-game-vs">${game.state === 'live' ? 'live' : game.state === 'final' ? 'final' : 'at'}</div>
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
    }</tbody></table></div><p class="week-standings-note">${escapeHtml(payload.note || formatFetchedAt(payload.fetchedAt) || '')}</p>`;
  }
  renderPulse(window.gateSiteConfig || {}, {...payload, standings});
}

async function renderWeekBoard(){
  if(!document.querySelector('[data-week-matchups]') && !document.querySelector('[data-week-standings]')) return;
  try{
    const response = await fetch('data/current-season.json', {cache:'no-store'});
    if(!response.ok) throw new Error(`current-season.json returned HTTP ${response.status}`);
    renderWeekBoardFrom(await response.json());
  }catch(error){
    console.warn('Unable to refresh the week board; keeping the HTML fallback.', error);
  }
}

function hideCommissionerBoard(){
  const board = document.getElementById('commissionerBoard');
  const office = board?.closest('.home-office');
  board?.setAttribute('hidden', '');
  office?.setAttribute('hidden', '');
}

function showCommissionerBoard(){
  const board = document.getElementById('commissionerBoard');
  const office = board?.closest('.home-office');
  board?.removeAttribute('hidden');
  office?.removeAttribute('hidden');
}

async function loadAnnouncementsHome(){
  const board = document.getElementById('commissionerBoard');
  if(!board) return;
  const supabase = window.gateSupabase || await (window.gateSupabaseReady || Promise.resolve(null));
  if(!supabase){
    hideCommissionerBoard();
    return;
  }
  const missingStarterColumn = error => error?.code === '42703' || String(error?.message || '').includes('is_starter');
  const esc = window.gateShared?.escapeHtml || (value => String(value ?? ''));
  const initialsFor = name => window.gateShared?.memberPresentation?.initialsFor?.(name) || '';
  let {data, error} = await supabase.from('announcements').select('id,author_name,body,is_starter,created_at').eq('is_pinned', true).order('created_at', {ascending:false}).limit(3);
  if(missingStarterColumn(error)){
    ({data, error} = await supabase.from('announcements').select('id,author_name,body,created_at').eq('is_pinned', true).order('created_at', {ascending:false}).limit(3));
  }
  if(error || !data?.length){
    hideCommissionerBoard();
    if(error) console.warn('Pinned commissioner announcements could not load.', error);
    return;
  }
  board.innerHTML = data.map(announcement => {
    const [headline, ...lines] = String(announcement.body).split('\n');
    const body = lines.join('\n').trim();
    const date = new Date(announcement.created_at).toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'});
    return `<article class="league-announcement"><div class="announcement-avatar" aria-hidden="true">${esc(initialsFor(announcement.author_name))}</div><div class="announcement-content"><div class="announcement-meta"><span>League office</span><time datetime="${esc(announcement.created_at)}">${esc(date)}</time></div>${announcement.is_starter ? '<span class="announcement-starter">Starter announcement</span>' : ''}<h3>${esc(headline)}</h3>${body ? `<p>${esc(body).replace(/\n/g, '<br>')}</p>` : ''}<small>${esc(announcement.author_name)}</small></div></article>`;
  }).join('');
  showCommissionerBoard();
}

window.gateHomeAnnouncements = Object.freeze({load: loadAnnouncementsHome});
window.addEventListener('gate-supabase-ready', () => loadAnnouncementsHome());
if(window.gateSupabase) loadAnnouncementsHome();
