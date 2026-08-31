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

function closePhoneMore() {
  const sheet = document.getElementById('phoneMore');
  const toggle = document.querySelector('[data-more-toggle]');
  if (!sheet) return;
  sheet.hidden = true;
  sheet.classList.remove('open');
  toggle?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('phone-more-open');
}

function openPhoneMore() {
  const sheet = document.getElementById('phoneMore');
  const toggle = document.querySelector('[data-more-toggle]');
  if (!sheet) return;
  sheet.hidden = false;
  sheet.classList.add('open');
  toggle?.setAttribute('aria-expanded', 'true');
  document.body.classList.add('phone-more-open');
}

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
  const dockViews = new Set(['home', 'history', 'transactions', 'trades']);
  document.querySelectorAll('.phone-dock [data-view]').forEach(button => {
    button.classList.toggle('active', button.dataset.view === name);
  });
  document.querySelector('[data-more-toggle]')?.classList.toggle('active', !dockViews.has(name));
  document.querySelectorAll('.phone-more [data-view]').forEach(button => {
    button.classList.toggle('active', button.dataset.view === name);
  });
  closePhoneMore();
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

document.getElementById('phoneDock')?.addEventListener('click', event => {
  const more = event.target.closest('[data-more-toggle]');
  if (more) {
    const sheet = document.getElementById('phoneMore');
    if (sheet?.hidden) openPhoneMore();
    else closePhoneMore();
    return;
  }
  const button = event.target.closest('button[data-view]');
  if (button) switchView(button.dataset.view);
});

document.getElementById('phoneMore')?.addEventListener('click', event => {
  if (event.target.closest('[data-more-close]')) {
    closePhoneMore();
    return;
  }
  const button = event.target.closest('button[data-view]');
  if (button) switchView(button.dataset.view);
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closePhoneMore();
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

/**
 * 1048 Gate Newspaper Editions Integration
 * Loads and displays Historical and Weekly editions
 */

// Edition state
let currentEdition = null;

// Edition data paths
const editionDataPaths = {
  historical: 'data/newspaper_editions/historical_2023.json',
  weekly_fallback: 'data/newspaper_editions/weekly_fallback_2023.json',
};

// Edition display names
const editionLabels = {
  historical: 'Historical Editions',
  weekly_fallback: 'Weekly Edition (Archive Demonstration)',
};

// Edition status types
const editionStatusTypes = {
  live: 'live espn',
  cached: 'cached espn snapshot',
  archive: 'historical archive',
};

// Initialize newspaper editions
async function initNewspaperEditions() {
  // Check if we're on a newspaper edition page
  const editionView = document.getElementById('newspaper');
  if (!editionView) return;

  // Try to load the preferred edition (historical first)
  await loadEdition('historical');
}

// Load a specific edition
async function loadEdition(editionKey) {
  const editionPath = editionDataPaths[editionKey];
  const editionLabel = editionLabels[editionKey];

  if (!editionPath) {
    showEditionError('Edition data not found');
    return;
  }

  // Show loading state
  const editionContainer = document.getElementById('editionContent');
  if (editionContainer) {
    editionContainer.innerHTML = `
      <div class="edition-loading">
        <div class="spinner"></div>
        <span>Loading ${editionLabel}...</span>
      </div>
    `;
  }

  try {
    const response = await fetch(editionPath, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();

    // Reset previous edition state
    if (currentEdition) {
      document.querySelectorAll('.edition-status').forEach(el => el.remove());
    }

    // Display the edition
    currentEdition = editionKey;
    displayEdition(data, editionLabel, editionKey);

    // Add edition status badge
    addEditionStatusBadge(editionKey, data);

    // Add sources drawer toggle
    addSourcesDrawer(data);

  } catch (error) {
    console.error('Failed to load edition:', error);
    showEditionError(`Failed to load ${editionLabel}: ${error.message}`);
  }
}

// Display the edition content
function displayEdition(data, label, editionKey) {
  const editionContainer = document.getElementById('editionContent');
  if (!editionContainer) return;

  // Generate the edition HTML from the data
  let editionTitle = '';
  if (editionKey === 'historical') {
    editionTitle = `${data.league_name || '1048 Gate'} — 2023 Season Historical Edition`;
  } else {
    editionTitle = `${data.league_name || '1048 Gate'} — Weekly Archive Demonstration`;
  }
  let html = `
    <div class="edition-header">
      <h2>${esc(editionTitle)}</h2>
      <div class="edition-meta">
        <span>Season: ${data.season} · Edition: ${data.edition_year}</span>
        ${data.week !== undefined ? `<span>Week: ${data.week}</span>` : ''}
      </div>
    </div>

    <div class="edition-stories">
  `;

  // Generate story cards
  const stories = data.stories || [];
  if (stories.length === 0) {
    html += `<p class="empty-state">No stories available for this edition.</p>`;
  } else {
    html += `<ol class="story-list">`;
    for (const story of stories) {
      const sourceStr = typeof story.source === 'string' ? story.source : JSON.stringify(story.source);
      const safeBody = esc(story.body.substring(0, 200) + (story.body.length > 200 ? '...' : ''));
      html += `
        <li class="story-item" tabindex="0" role="article">
          <h3 class="story-title">${esc(story.title)}</h3>
          <div class="story-meta">
            <span class="story-type">${esc(story.story_type)}</span>
            <span class="story-source">${esc(sourceStr)}</span>
          </div>
          <p class="story-body">${safeBody}</p>
        </li>`;
    }
    html += `</ol>`;
  }

  html += `</div>`;

  // Add footer with edition info
  html += `
    <div class="edition-footer">
      <small>
        Generated: ${new Date(data.generated_at).toLocaleString()}<br>
        Mode: ${data.mode || 'unknown'}
      </small>
    </div>
  `;

  editionContainer.innerHTML = html;
}

// Add edition status badge
function addEditionStatusBadge(editionKey, data) {
  const statusTypes = {
    historical: editionStatusTypes.archive,
    weekly_fallback: editionStatusTypes.cached,
  };

  const statusType = statusTypes[editionKey] || editionStatusTypes.archive;
  const statusLabel = `${statusType} data`;

  // Insert badge after the edition header
  const header = document.querySelector('.edition-header');
  if (header) {
    const badge = document.createElement('div');
    badge.className = 'edition-status';
    badge.setAttribute('aria-label', `${statusLabel} for this edition`);
    badge.innerHTML = `<span class="status-dot"></span>${statusLabel}`;
    header.insertAdjacentElement('afterend', badge);
  }
}

// Add Sources drawer
function addSourcesDrawer(data) {
  const mainContent = document.querySelector('main');
  if (!mainContent) return;

  // Check if drawer already exists
  if (document.getElementById('edition-sources-drawer')) return;

  const drawer = document.createElement('div');
  drawer.id = 'edition-sources-drawer';
  drawer.className = 'edition-drawer';
  drawer.innerHTML = `
    <div class="drawer-header">
      <h3>Sources</h3>
      <button class="drawer-close" aria-label="Close sources"><span>&times;</span></button>
    </div>
    <div class="drawer-content">
      <p>The following source traces verify all facts in this edition:</p>
      <ul class="sources-list">
      `;

  const stories = data.stories || [];
  for (const story of stories) {
    const sourceStr = typeof story.source === 'string' ? story.source : JSON.stringify(story.source);
    html += `<li>${esc(sourceStr)}</li>`;
  }

  html += `</ul></div>`;
  drawer.innerHTML += html;

  mainContent.appendChild(drawer);

  // Toggle drawer
  const drawerToggle = document.createElement('button');
  drawerToggle.className = 'drawer-toggle';
  drawerToggle.setAttribute('aria-label', 'Toggle sources drawer');
  drawerToggle.innerHTML = 'Sources';
  header.insertAdjacentElement('afterend', drawerToggle);

  drawerToggle.addEventListener('click', () => {
    drawer.classList.toggle('open');
  });

  const closeBtn = drawer.querySelector('.drawer-close');
  closeBtn.addEventListener('click', () => {
    drawer.classList.remove('open');
  });

  // Close on outside click
  drawer.addEventListener('click', (e) => {
    if (e.target === drawer) {
      drawer.classList.remove('open');
    }
  });
}

// Show edition error state
function showEditionError(message) {
  const editionContainer = document.getElementById('editionContent');
  if (!editionContainer) return;

  editionContainer.innerHTML = `
    <div class="edition-error">
      <h2>Edition Unavailable</h2>
      <p>${esc(message)}</p>
      <p class="error-help">
        This edition could not be loaded. The Historical edition is available
        as a public preview. The Weekly edition requires authenticated ESPN access.
      </p>
    </div>
  `;
}

// Edition tab switching
const editionTabs = document.querySelectorAll('#editionTabs .edition-tab');
if (editionTabs.length > 0) {
  editionTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      editionTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const editionKey = tab.dataset.edition;
      loadEdition(editionKey).catch(() => {});
      const toggleSources = document.querySelector('.toggle-sources');
      if (toggleSources) {
        if (editionKey) {
          toggleSources.style.display = 'inline-block';
          if (editionKey === 'weekly_fallback') {
            toggleSources.setAttribute('aria-label', 'View sources (cached edition)');
          } else {
            toggleSources.setAttribute('aria-label', 'View sources');
          }
        } else {
          toggleSources.style.display = 'none';
        }
      }
      if (editionKey === 'weekly_fallback') {
        document.querySelector('.toggle-sources')?.setAttribute('aria-label', 'View sources (cached edition)');
      } else {
        document.querySelector('.toggle-sources')?.setAttribute('aria-label', 'View sources');
      }
    });
  });
}

// Set initial active tab based on hash
const editionHash = window.location.hash.replace('#', '');
if (editionHash) {
  const hashTab = document.querySelector(`#editionTabs .edition-tab[data-edition="${editionHash}"]`);
  if (hashTab) {
    editionTabs.forEach(t => t.classList.remove('active'));
    hashTab.classList.add('active');
    loadEdition(editionHash).catch(() => {});
  }
}

// Make functions globally available for inline events
window.loadEdition = loadEdition;
window.switchView = window.switchView || function(name) {};
