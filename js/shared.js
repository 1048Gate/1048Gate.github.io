(function(){
  const MEMBER_LOGOS = Object.freeze({
    '01': 'images/team-logos/01-george-travis.webp',
    '02': 'images/team-logos/02-jared-hall.webp',
    '03': 'images/team-logos/03-kyle-fowler.webp',
    '04': 'images/team-logos/04-bryan-hunt.webp',
    '05': 'images/team-logos/05-brian-heino.webp',
    '06': 'images/team-logos/06-vincent-cannarozzi.webp',
    '07': 'images/team-logos/07-james-brochu.webp',
    '08': 'images/team-logos/08-jd-daley.webp',
    '09': 'images/team-logos/09-thomas-speer.webp',
    '10': 'images/team-logos/10-collin-krum.webp',
    '11': 'images/team-logos/11-german-haro.webp',
    '12': 'images/team-logos/12-trevor-hash.webp'
  });

  const MEMBER_ROLE_OVERRIDES = Object.freeze({'10': 'Admin'});

  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[character]));

  function parseRecord(record){
    const parts = String(record || '').split('-').map(Number);
    return {wins: parts[0] || 0, losses: parts[1] || 0, ties: parts[2] || 0};
  }

  const recordText = (wins, losses, ties) => ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;

  function formatNumber(value, minimumDigits = 1, maximumDigits = minimumDigits){
    if(value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return '—';
    return Number(value).toLocaleString(undefined, {
      minimumFractionDigits: minimumDigits,
      maximumFractionDigits: maximumDigits
    });
  }

  function ordinal(value){
    const number = Number(value);
    if(!number) return '—';
    const suffixes = ['th', 'st', 'nd', 'rd'];
    const remainder = number % 100;
    return `${number}${suffixes[(remainder - 20) % 10] || suffixes[remainder] || suffixes[0]}`;
  }

  function relativeTime(iso){
    const seconds = Math.max(1, Math.floor((Date.now() - new Date(iso)) / 1000));
    if(seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if(minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if(hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  const normalizeMemberNumber = value => String(value ?? '').trim().padStart(2, '0');
  const memberLogo = value => MEMBER_LOGOS[normalizeMemberNumber(value)] || '';
  const memberRole = member => MEMBER_ROLE_OVERRIDES[normalizeMemberNumber(member.number ?? member.member_number)]
    || member.role
    || member.role_label
    || 'League Member';

  const nullableNumber = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value))
    ? null
    : Number(value);

  function normalizeSeason(season){
    if(Array.isArray(season)){
      return {
        year: Number(season[0]),
        finish: nullableNumber(season[1]),
        team: String(season[2] ?? ''),
        record: String(season[3] ?? ''),
        pointsFor: nullableNumber(season[4]),
        pointsAgainst: nullableNumber(season[5])
      };
    }
    return {
      id: season?.id,
      year: Number(season?.year ?? season?.season_year),
      finish: nullableNumber(season?.finish ?? season?.final_finish),
      team: String(season?.team ?? season?.team_name ?? ''),
      record: String(season?.record ?? ''),
      pointsFor: nullableNumber(season?.pointsFor ?? season?.points_for),
      pointsAgainst: nullableNumber(season?.pointsAgainst ?? season?.points_against)
    };
  }

  function normalizeMember(member){
    const rawSeasons = member?.seasons ?? member?.member_seasons ?? [];
    const number = normalizeMemberNumber(member?.number ?? member?.member_number);
    return {
      id: member?.id,
      number,
      name: String(member?.name ?? ''),
      role: memberRole({...member, number}),
      sortOrder: nullableNumber(member?.sortOrder ?? member?.sort_order),
      seasons: rawSeasons.map(normalizeSeason).filter(season => Number.isFinite(season.year)).sort((a, b) => a.year - b.year)
    };
  }

  function memberTotals(member){
    let wins = 0, losses = 0, ties = 0, pointsFor = 0, pointsAgainst = 0, pointsForSeasons = 0;
    const finishes = [];
    for(const season of member.seasons || []){
      const record = parseRecord(season.record);
      wins += record.wins;
      losses += record.losses;
      ties += record.ties;
      if(season.pointsFor !== null){pointsFor += season.pointsFor; pointsForSeasons++}
      if(season.pointsAgainst !== null) pointsAgainst += season.pointsAgainst;
      if(season.finish !== null) finishes.push(season.finish);
    }
    const games = wins + losses + ties;
    return {
      wins,
      losses,
      ties,
      pointsFor,
      pointsAgainst,
      pointsForSeasons,
      games,
      winRate: games ? (wins + ties * 0.5) / games : 0,
      titles: finishes.filter(finish => finish === 1).length,
      runnerUps: finishes.filter(finish => finish === 2).length,
      averageFinish: finishes.length ? finishes.reduce((sum, finish) => sum + finish, 0) / finishes.length : null,
      bestFinish: finishes.length ? Math.min(...finishes) : null
    };
  }

  function latestSeason(member){
    return (member.seasons || []).reduce((latest, season) => !latest || season.year > latest.year ? season : latest, null);
  }

  function bindLogoFallbacks(root = document){
    root.querySelectorAll('.member-logo').forEach(image => {
      image.addEventListener('error', () => {
        image.hidden = true;
        image.closest('.member-logo-shell')?.classList.add('logo-missing');
      }, {once:true});
    });
  }

  function applyMemberModal({number, name, role, seasonsRecorded, team}){
    const normalizedNumber = normalizeMemberNumber(number);
    const logoSrc = memberLogo(normalizedNumber);
    const logoShell = document.querySelector('#memberModal .member-modal-logo-shell');
    const logo = document.getElementById('memberModalLogo');
    const fallback = document.getElementById('memberModalLogoFallback');
    const modalName = document.getElementById('memberModalName');
    const modalRole = document.getElementById('memberModalRole');
    const modalTeam = document.getElementById('memberModalTeam');

    if(modalName) modalName.textContent = name;
    if(modalRole) modalRole.textContent = `${memberRole({number:normalizedNumber, role})} • ${seasonsRecorded} seasons recorded`;
    if(fallback) fallback.textContent = normalizedNumber;
    if(logoShell) logoShell.classList.toggle('logo-missing', !logoSrc);
    if(logo){
      logo.hidden = !logoSrc;
      logo.src = logoSrc;
      logo.alt = logoSrc ? `${name} team logo` : '';
    }
    if(modalTeam){
      modalTeam.textContent = team || '';
      modalTeam.hidden = !team;
    }
  }

  const memberPresentation = Object.freeze({
    normalizeNumber: normalizeMemberNumber,
    logoFor: memberLogo,
    roleFor: memberRole,
    bindLogoFallbacks,
    applyModal: applyMemberModal
  });

  window.gateShared = Object.freeze({
    escapeHtml,
    parseRecord,
    recordText,
    formatNumber,
    ordinal,
    relativeTime,
    normalizeSeason,
    normalizeMember,
    memberTotals,
    latestSeason,
    memberPresentation
  });
})();
