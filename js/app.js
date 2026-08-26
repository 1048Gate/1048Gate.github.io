const {
  escapeHtml: esc,
  formatNumber: num,
  ordinal,
  normalizeMember,
  memberTotals,
  latestSeason,
  recordText,
  trapFocus,
  memberPresentation
} = window.gateShared;

function switchView(name, {updateHash = true, scroll = true} = {}) {
  const target = document.getElementById(name);
  if (!target) return;

  document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
  target.classList.add('active');
  document.querySelectorAll('#tabs button[data-view]').forEach(button => {
    const active = button.dataset.view === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  const activeButton = [...document.querySelectorAll('#tabs button[data-view]')]
    .find(button => button.dataset.view === name);
  activeButton?.scrollIntoView({block:'nearest', inline:'center', behavior:'smooth'});
  if (updateHash && window.location.hash !== `#${name}`) history.pushState({view:name}, '', `#${name}`);
  if (scroll) window.scrollTo({top: 0, behavior: 'smooth'});
  document.dispatchEvent(new CustomEvent('gate:viewchange', {detail:{name}}));
}

window.switchView = switchView;
document.getElementById('tabs')?.addEventListener('click', event => {
  const button = event.target.closest('button[data-view]');
  if (button) switchView(button.dataset.view);
});

document.querySelector('.quick-grid')?.addEventListener('click', event => {
  const card = event.target.closest('[data-quick-view]');
  if(card) switchView(card.dataset.quickView);
});

document.addEventListener('click', event => {
  const link = event.target.closest('[data-view-link]');
  if(link) switchView(link.dataset.viewLink);
});

window.addEventListener('popstate', () => {
  const name = window.location.hash.slice(1) || 'home';
  switchView(name, {updateHash:false});
});


document.querySelectorAll('.filter-pills .pill').forEach(pill => pill.addEventListener('click', () => {
  document.querySelectorAll('.filter-pills .pill').forEach(item => item.classList.remove('active'));
  pill.classList.add('active');
}));

document.querySelectorAll('.accordion-item').forEach(item => {
  const trigger = item.querySelector('.accordion-head');
  trigger?.addEventListener('click', () => {
    const open = item.classList.toggle('open');
    trigger.setAttribute('aria-expanded', String(open));
  });
});

let leagueMembers = [];
let membersClient = null;
let membersChannel = null;
let memberReturnFocus = null;

function setMemberSource(label) {
  const source = document.getElementById('memberDataSource');
  if (source) source.textContent = label;
}

function renderMembers() {
  const grid = document.getElementById('membersGrid');
  if (!grid) return;

  grid.innerHTML = leagueMembers.map((member, index) => {
    const stats = memberTotals(member);
    const latest = latestSeason(member);
    const initials = memberPresentation.initialsFor(member.name);
    const badge = stats.titles ? `${stats.titles}× Champ` : `#${esc(member.number)}`;

    return `<article class="member-card public-member-card" data-member-index="${index}" data-member-number="${esc(member.number)}" tabindex="0" aria-label="View ${esc(member.name)} career history">
      <div class="member-head member-head-with-avatar">
        <div class="member-avatar" aria-hidden="true">
          <span class="member-initials">${esc(initials)}</span>
        </div>
        <div class="member-identity">
          <div class="team">${esc(member.name)}</div>
          <div class="mgr">${esc(member.role)}</div>
        </div>
        <span class="member-title-badge">${badge}</span>
      </div>
      ${latest ? `<div class="member-latest"><span>${esc(latest.team)}</span><small>${latest.year} · ${ordinal(latest.finish)} place</small></div>` : '<div class="member-latest"><span>No team history</span><small>Ready to add</small></div>'}
      ${member.seasons.length ? `<div class="member-stats public-member-stats">
        <div class="member-stat"><span class="label">Record</span><span class="value accent">${recordText(stats.wins, stats.losses, stats.ties)}</span></div>
        <div class="member-stat"><span class="label">Win %</span><span class="value">${(stats.winRate * 100).toFixed(1)}%</span></div>
        <div class="member-stat"><span class="label">Avg Finish</span><span class="value">${stats.averageFinish === null ? '—' : stats.averageFinish.toFixed(1)}</span></div>
        <div class="member-stat"><span class="label">Seasons</span><span class="value">${member.seasons.length}</span></div>
      </div>` : '<div class="member-empty">Career data ready to be added.</div>'}
      <div class="member-card-footer"><span>${member.seasons.length} season${member.seasons.length === 1 ? '' : 's'} recorded</span><span class="member-open-arrow">View career →</span></div>
    </article>`;
  }).join('');

  grid.querySelectorAll('[data-member-index]').forEach(card => {
    const open = () => openMember(Number(card.dataset.memberIndex));
    card.addEventListener('click', open);
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
  });
}

function openMember(index) {
  const member = leagueMembers[index];
  if (!member) return;
  const stats = memberTotals(member);
  const latest = latestSeason(member);
  memberReturnFocus = document.activeElement;

  memberPresentation.applyModal({
    number: member.number,
    name: member.name,
    role: member.role,
    seasonsRecorded: member.seasons.length,
    team: latest?.team
  });

  const boxes = [
    ['Career Record', recordText(stats.wins, stats.losses, stats.ties)],
    ['Win Rate', `${(stats.winRate * 100).toFixed(1)}%`],
    ['Championships', stats.titles],
    ['Runner-Ups', stats.runnerUps],
    ['Average Finish', num(stats.averageFinish)],
    ['Best Finish', ordinal(stats.bestFinish)],
    ['Career PF', stats.pointsForSeasons ? num(stats.pointsFor) : '—'],
    ['Games', stats.games]
  ];

  document.getElementById('careerSummary').innerHTML = boxes
    .map(([label, value]) => `<div class="career-box"><div class="label">${label}</div><div class="value">${value}</div></div>`)
    .join('');

  document.getElementById('seasonRows').innerHTML = member.seasons.length
    ? [...member.seasons].sort((a, b) => b.year - a.year).map(season => {
        const difference = season.pointsFor !== null && season.pointsAgainst !== null ? season.pointsFor - season.pointsAgainst : null;
        const champion = season.finish === 1;
        return `<tr class="${champion ? 'champ-season-row' : ''}">
          <td>${season.year}</td>
          <td class="${champion ? 'finish-champ' : ''}">${champion ? '🏆 ' : ''}${ordinal(season.finish)}</td>
          <td>${esc(season.team)}</td>
          <td>${esc(season.record)}</td>
          <td>${num(season.pointsFor)}</td>
          <td>${num(season.pointsAgainst)}</td>
          <td class="${difference === null ? '' : difference >= 0 ? 'positive-diff' : 'negative-diff'}">${difference === null ? '—' : `${difference >= 0 ? '+' : ''}${num(difference)}`}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="7" class="member-empty">No season data has been entered yet.</td></tr>';

  const modal = document.getElementById('memberModal');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.dispatchEvent(new CustomEvent('gate:member-profile-opened', {
    detail: {name: member.name, number: member.number}
  }));
  document.getElementById('memberModalClose')?.focus();
}

function closeMember() {
  const modal = document.getElementById('memberModal');
  modal?.classList.remove('open');
  modal?.setAttribute('aria-hidden', 'true');
  if(memberReturnFocus?.isConnected) memberReturnFocus.focus();
  memberReturnFocus = null;
}

function useMembers(rows, sourceLabel) {
  const normalized = (rows || []).map(normalizeMember).filter(member => member.number && member.name);
  if (!normalized.length) throw new Error('No valid league members were returned.');
  leagueMembers = normalized.sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));
  setMemberSource(sourceLabel);
  renderMembers();
}

async function loadJsonMembers() {
  const response = await fetch('data/members.json', {cache: 'no-store'});
  if (!response.ok) throw new Error(`members.json returned HTTP ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload.members)) throw new Error('members.json does not contain a members array');
  useMembers(payload.members, 'Archived history');
}

async function loadSupabaseMembers(client) {
  const {data, error} = await client.from('league_members')
    .select('id,member_number,name,role_label,sort_order,member_seasons(id,season_year,final_finish,team_name,record,points_for,points_against)')
    .order('sort_order');
  if (error) throw error;
  useMembers(data, 'Live history synced');
}

async function refreshLeagueMembers({allowFallback = true, showLoading = !leagueMembers.length} = {}) {
  const grid = document.getElementById('membersGrid');
  if (showLoading && grid) grid.innerHTML = '<div class="member-empty">Loading league history…</div>';

  try {
    if (membersClient) {
      await loadSupabaseMembers(membersClient);
      return;
    }
    if (allowFallback) await loadJsonMembers();
  } catch (primaryError) {
    console.warn('Live member data was unavailable; using the static archive.', primaryError);
    if (allowFallback) {
      try {
        await loadJsonMembers();
        return;
      } catch (fallbackError) {
        console.error('Unable to load member history:', fallbackError);
      }
    }
    if (grid && !leagueMembers.length) {
      grid.innerHTML = '<div class="member-empty">Member history is temporarily unavailable. Try refreshing the page; if it continues, check the Supabase connection and data/members.json.</div>';
    }
    setMemberSource('Data unavailable');
  }
}

async function initializeMembers() {
  membersClient = window.gateSupabase || await (window.gateSupabaseReady || Promise.resolve(null));
  await refreshLeagueMembers();
  if (membersClient && !membersChannel) {
    membersChannel = membersClient.channel('1048-members')
      .on('postgres_changes', {event:'*', schema:'public', table:'league_members'}, () => refreshLeagueMembers({allowFallback:false, showLoading:false}))
      .on('postgres_changes', {event:'*', schema:'public', table:'member_seasons'}, () => refreshLeagueMembers({allowFallback:false, showLoading:false}))
      .subscribe();
  }
}

window.gateMembers = Object.freeze({
  current: () => leagueMembers,
  refresh: refreshLeagueMembers,
  render: renderMembers
});

document.getElementById('memberModalClose')?.addEventListener('click', closeMember);
document.getElementById('memberModal')?.addEventListener('click', event => {
  if (event.target.id === 'memberModal') closeMember();
});
document.addEventListener('keydown', event => {
  const modal = document.getElementById('memberModal');
  if(!modal?.classList.contains('open')) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeMember();
    return;
  }
  trapFocus(event, modal.querySelector('.member-modal-card'));
});

initializeMembers();

const initialView = window.location.hash.slice(1);
if(initialView && document.getElementById(initialView)){
  switchView(initialView, {updateHash:false, scroll:false});
}else if(!window.location.hash){
  history.replaceState({view:'home'}, '', '#home');
}
