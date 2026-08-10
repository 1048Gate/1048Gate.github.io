function switchView(name) {
  const target = document.getElementById(name);
  if (!target) return;

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  target.classList.add('active');
  document.querySelectorAll('#tabs button[data-view]').forEach(button => {
    const active = button.dataset.view === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.switchView = switchView;
document.getElementById('tabs')?.addEventListener('click', event => {
  const button = event.target.closest('button[data-view]');
  if (button) switchView(button.dataset.view);
});

document.querySelectorAll('.filter-pills .pill').forEach(p => p.addEventListener('click', () => {
  document.querySelectorAll('.filter-pills .pill').forEach(x => x.classList.remove('active'));
  p.classList.add('active');
}));

document.querySelectorAll('.accordion-item').forEach(item =>
  item.querySelector('.accordion-head')?.addEventListener('click', () => item.classList.toggle('open'))
);

const MEMBER_LOGOS = Object.freeze({
  '01': 'images/team-logos/01-george-travis.png',
  '02': 'images/team-logos/02-jared-hall.png',
  '03': 'images/team-logos/03-kyle-fowler.png',
  '04': 'images/team-logos/04-bryan-hunt.png',
  '05': 'images/team-logos/05-brian-heino.png',
  '06': 'images/team-logos/06-vincent-cannarozzi.png',
  '07': 'images/team-logos/07-james-brochu.png',
  '08': 'images/team-logos/08-jd-daley.png',
  '09': 'images/team-logos/09-thomas-speer.png',
  '10': 'images/team-logos/10-collin-krum.png',
  '11': 'images/team-logos/%2011-german-haro.png',
  '12': 'images/team-logos/12-trevor-hash.png'
});

const MEMBER_ROLE_OVERRIDES = Object.freeze({
  '10': 'Admin'
});

const memberNumber = value => String(value ?? '').trim().padStart(2, '0');
const memberLogo = value => MEMBER_LOGOS[memberNumber(value)] || '';
const memberRole = member => MEMBER_ROLE_OVERRIDES[memberNumber(member.number ?? member.member_number)]
  || member.role
  || member.role_label
  || 'League Member';

function bindMemberLogoFallbacks(root = document) {
  root.querySelectorAll('.member-logo').forEach(img => {
    img.addEventListener('error', () => {
      img.hidden = true;
      img.closest('.member-logo-shell')?.classList.add('logo-missing');
    }, { once: true });
  });
}

function applyMemberModalPresentation({ number, name, role, seasonsRecorded, team }) {
  const normalizedNumber = memberNumber(number);
  const logoSrc = memberLogo(normalizedNumber);
  const logoShell = document.querySelector('#memberModal .member-modal-logo-shell');
  const logo = document.getElementById('memberModalLogo');
  const fallback = document.getElementById('memberModalLogoFallback');

  document.getElementById('memberModalName').textContent = name;
  document.getElementById('memberModalRole').textContent = `${memberRole({ number: normalizedNumber, role })} • ${seasonsRecorded} seasons recorded`;

  if (fallback) fallback.textContent = normalizedNumber;
  if (logoShell) logoShell.classList.toggle('logo-missing', !logoSrc);
  if (logo) {
    logo.hidden = !logoSrc;
    logo.src = logoSrc;
    logo.alt = logoSrc ? `${name} team logo` : '';
  }

  const modalTeam = document.getElementById('memberModalTeam');
  if (modalTeam) {
    modalTeam.textContent = team || '';
    modalTeam.hidden = !team;
  }
}

window.gateMemberPresentation = Object.freeze({
  normalizeNumber: memberNumber,
  logoFor: memberLogo,
  roleFor: memberRole,
  bindLogoFallbacks: bindMemberLogoFallbacks,
  applyModal: applyMemberModalPresentation
});

let leagueMembers = [];

const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
  '"': '&quot;'
}[c]));

function parseRecord(record) {
  const parts = String(record || '').split('-').map(Number);
  return { wins: parts[0] || 0, losses: parts[1] || 0, ties: parts[2] || 0 };
}

function recordText(wins, losses, ties) {
  return ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

function totals(member) {
  let wins = 0;
  let losses = 0;
  let ties = 0;
  let pf = 0;
  let pa = 0;
  let pfs = 0;
  const finishes = [];

  member.seasons.forEach(season => {
    const record = parseRecord(season[3]);
    wins += record.wins;
    losses += record.losses;
    ties += record.ties;

    if (Number.isFinite(season[4])) {
      pf += season[4];
      pfs++;
    }
    if (Number.isFinite(season[5])) pa += season[5];
    if (Number.isFinite(Number(season[1]))) finishes.push(Number(season[1]));
  });

  const games = wins + losses + ties;
  return {
    wins,
    losses,
    ties,
    pf,
    pa,
    pfs,
    pct: games ? (wins + ties * 0.5) / games : 0,
    avg: finishes.length ? finishes.reduce((a, b) => a + b, 0) / finishes.length : null,
    best: finishes.length ? Math.min(...finishes) : null,
    titles: finishes.filter(x => x === 1).length
  };
}

function latestSeason(member) {
  if (!member.seasons.length) return null;
  return member.seasons.reduce((latest, season) => !latest || season[0] > latest[0] ? season : latest, null);
}

const num = (value, digits = 1) => Number.isFinite(value)
  ? value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '—';

function renderMembers() {
  const grid = document.getElementById('membersGrid');
  if (!grid) return;

  grid.innerHTML = leagueMembers.map((member, index) => {
    const stats = totals(member);
    const latest = latestSeason(member);
    const hasSeasons = member.seasons.length;
    const number = memberNumber(member.number);
    const logo = memberLogo(number);
    const badge = stats.titles ? `${stats.titles}× Champ` : `#${esc(number)}`;

    return `<article class="member-card public-member-card" data-i="${index}" data-member-number="${esc(number)}" tabindex="0" aria-label="View ${esc(member.name)} career history">
      <div class="member-head member-head-with-logo">
        <div class="member-logo-shell">
          ${logo ? `<img class="member-logo" src="${logo}" alt="${esc(member.name)} team logo" loading="lazy">` : ''}
          <span class="member-logo-fallback">${esc(number)}</span>
        </div>
        <div class="member-identity">
          <div class="team">${esc(member.name)}</div>
          <div class="mgr">${esc(memberRole(member))}</div>
        </div>
        <span class="member-title-badge">${badge}</span>
      </div>
      ${latest ? `<div class="member-latest"><span>${esc(latest[2])}</span><small>${latest[0]} TEAM</small></div>` : ''}
      ${hasSeasons ? `<div class="member-stats public-member-stats">
        <div class="member-stat"><span class="label">Record</span><span class="value accent">${recordText(stats.wins, stats.losses, stats.ties)}</span></div>
        <div class="member-stat"><span class="label">Win %</span><span class="value">${(stats.pct * 100).toFixed(1)}%</span></div>
        <div class="member-stat"><span class="label">Titles</span><span class="value">${stats.titles}</span></div>
        <div class="member-stat"><span class="label">Best</span><span class="value">${stats.best ? `#${stats.best}` : '—'}</span></div>
      </div>` : '<div class="member-empty">Career data ready to be added.</div>'}
      <div class="member-card-footer"><span>${member.seasons.length} season${member.seasons.length === 1 ? '' : 's'} recorded</span><span class="member-open-arrow">View career →</span></div>
    </article>`;
  }).join('');

  bindMemberLogoFallbacks(grid);

  grid.querySelectorAll('.member-card').forEach(card => {
    const open = () => openMember(Number(card.dataset.i));
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

  const stats = totals(member);
  const latest = latestSeason(member);
  applyMemberModalPresentation({
    number: member.number,
    name: member.name,
    role: member.role,
    seasonsRecorded: member.seasons.length,
    team: latest?.[2]
  });

  const boxes = [
    ['Career Record', recordText(stats.wins, stats.losses, stats.ties)],
    ['Win Rate', `${(stats.pct * 100).toFixed(1)}%`],
    ['Championships', stats.titles],
    ['Average Finish', num(stats.avg)],
    ['Best Finish', stats.best ? `#${stats.best}` : '—'],
    ['Career PF', stats.pfs ? num(stats.pf) : '—']
  ];

  document.getElementById('careerSummary').innerHTML = boxes
    .map(box => `<div class="career-box"><div class="label">${box[0]}</div><div class="value">${box[1]}</div></div>`)
    .join('');

  document.getElementById('seasonRows').innerHTML = member.seasons.length
    ? [...member.seasons].sort((a, b) => b[0] - a[0]).map(season => {
        const diff = Number.isFinite(season[4]) && Number.isFinite(season[5]) ? season[4] - season[5] : null;
        return `<tr>
          <td>${season[0]}</td>
          <td class="${Number(season[1]) === 1 ? 'finish-champ' : ''}">${Number(season[1]) === 1 ? '🏆 ' : ''}#${season[1]}</td>
          <td>${esc(season[2])}</td>
          <td>${esc(season[3])}</td>
          <td>${num(season[4])}</td>
          <td>${num(season[5])}</td>
          <td>${diff === null ? '—' : `${diff >= 0 ? '+' : ''}${num(diff)}`}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="7" class="member-empty">No season data has been entered yet.</td></tr>';

  const modal = document.getElementById('memberModal');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeMember() {
  const modal = document.getElementById('memberModal');
  modal?.classList.remove('open');
  modal?.setAttribute('aria-hidden', 'true');
}

async function loadMembers() {
  const grid = document.getElementById('membersGrid');
  if (grid) grid.innerHTML = '<div class="member-empty">Loading league history…</div>';

  try {
    const response = await fetch('data/members.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`members.json returned HTTP ${response.status}`);

    const payload = await response.json();
    if (!Array.isArray(payload.members)) throw new Error('members.json does not contain a members array');

    leagueMembers = payload.members;

    renderMembers();
  } catch (error) {
    console.error('Unable to load member history:', error);
    if (grid) {
      grid.innerHTML = '<div class="member-empty">Member history could not be loaded. Check data/members.json and refresh.</div>';
    }
  }
}

document.getElementById('memberModalClose')?.addEventListener('click', closeMember);
document.getElementById('memberModalLogo')?.addEventListener('error', event => {
  event.currentTarget.hidden = true;
  event.currentTarget.closest('.member-modal-logo-shell')?.classList.add('logo-missing');
});
document.getElementById('memberModal')?.addEventListener('click', event => {
  if (event.target.id === 'memberModal') closeMember();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeMember();
});

loadMembers();
