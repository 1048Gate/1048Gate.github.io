(function(){
  const MEMBER_ROLE_OVERRIDES = Object.freeze({'10': 'Admin'});

  const escapeHtml = value => String(value ?? '').replace(/[&<>'\"]/g, character => ({
    '&': '&',
    '<': '<',
    '>': '>',
    "'": '&#39;',
    '"': '"'
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

  function trapFocus(event, container){
    if(event.key !== 'Tab' || !container) return;
    const focusable = [...container.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
      .filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
    if(!focusable.length){
      event.preventDefault();
      container.focus?.();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if(event.shiftKey && document.activeElement === first){
      event.preventDefault();
      last.focus();
    }else if(!event.shiftKey && document.activeElement === last){
      event.preventDefault();
      first.focus();
    }
  }

  const normalizeMemberNumber = value => String(value ?? '').trim().padStart(2, '0');
  let initialsRoster = [];
  const setInitialsRoster = names => {
    initialsRoster = Array.isArray(names) ? names.map(name => String(name || '').trim()).filter(Boolean) : [];
  };
  const baseMemberInitials = name => {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if(!parts.length) return '—';
    if(parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts.at(-1)[0]}`.toUpperCase();
  };
  const memberInitials = (name, roster) => {
    const base = baseMemberInitials(name);
    const pool = Array.isArray(roster) ? roster : initialsRoster;
    const collisions = pool.filter(other => baseMemberInitials(other) === base);
    if(collisions.length <= 1) return base;
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if(parts.length >= 2){
      const lastTwo = `${parts[0][0]}${parts.at(-1).slice(0, 2)}`.toUpperCase();
      const lastTwoHits = collisions.filter(other => {
        const otherParts = String(other).trim().split(/\s+/).filter(Boolean);
        return otherParts.length >= 2 && `${otherParts[0][0]}${otherParts.at(-1).slice(0, 2)}`.toUpperCase() === lastTwo;
      });
      if(lastTwoHits.length <= 1) return lastTwo;
      return `${parts[0].slice(0, 2)}${parts.at(-1)[0]}`.toUpperCase();
    }
    return base;
  };
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

  function applyMemberModal({number, name, role, seasonsRecorded, team}){
    const normalizedNumber = normalizeMemberNumber(number);
    const initials = document.getElementById('memberModalInitials');
    const modalName = document.getElementById('memberModalName');
    const modalRole = document.getElementById('memberModalRole');
    const modalTeam = document.getElementById('memberModalTeam');

    if(modalName) modalName.textContent = name;
    if(modalRole) modalRole.textContent = `${memberRole({number:normalizedNumber, role})} • ${seasonsRecorded} seasons recorded`;
    if(initials) initials.textContent = memberInitials(name);
    if(modalTeam){
      modalTeam.textContent = team || '';
      modalTeam.hidden = !team;
    }
  }

  const memberPresentation = Object.freeze({
    normalizeNumber: normalizeMemberNumber,
    initialsFor: memberInitials,
    setRoster: setInitialsRoster,
    roleFor: memberRole,
    applyModal: applyMemberModal
  });

  const cleanTransactionText = value => String(value ?? '').trim().replace(/\s+/g, ' ');
  const archiveTransactionKey = (year, transactionId) => `${Number(year)}|${cleanTransactionText(transactionId)}`;

  function buildAcceptedTradeArchive(transactions = [], items = []){
    const tradeItemsByTransaction = new Map();
    for(const rawItem of items){
      if(rawItem?.item_type !== 'TRADE') continue;
      const player = cleanTransactionText(rawItem.player_name);
      const from = cleanTransactionText(rawItem.from_team_name);
      const to = cleanTransactionText(rawItem.to_team_name);
      if(!player || (!from && !to)) continue;
      const item = {
        ...rawItem,
        season_year:Number(rawItem.season_year),
        item_index:Number(rawItem.item_index || 0),
        player_name:player,
        from_team_name:from,
        to_team_name:to
      };
      const key = archiveTransactionKey(item.season_year, item.espn_transaction_id);
      if(!tradeItemsByTransaction.has(key)) tradeItemsByTransaction.set(key, []);
      tradeItemsByTransaction.get(key).push(item);
    }
    for(const group of tradeItemsByTransaction.values()) group.sort((a,b) => a.item_index - b.item_index);

    const groups = new Map();
    for(const rawRow of transactions){
      if(rawRow?.transaction_type !== 'TRADE_ACCEPT') continue;
      if(rawRow.status !== null && rawRow.status !== 'EXECUTED') continue;
      const seasonYear = Number(rawRow.season_year);
      const acceptanceId = cleanTransactionText(rawRow.espn_transaction_id);
      if(!Number.isFinite(seasonYear) || !acceptanceId) continue;
      const dealId = cleanTransactionText(rawRow.related_transaction_id) || acceptanceId;
      const key = archiveTransactionKey(seasonYear, dealId);
      if(!groups.has(key)) groups.set(key, {key, dealId, seasonYear, acceptances:[]});
      groups.get(key).acceptances.push({
        ...rawRow,
        season_year:seasonYear,
        espn_transaction_id:acceptanceId,
        transaction_date_ms:Number(rawRow.transaction_date_ms || new Date(rawRow.transaction_date).getTime() || 0),
        scoring_period:Number(rawRow.scoring_period || 0)
      });
    }

    const trades = [];
    for(const group of groups.values()){
      group.acceptances.sort((a,b) => a.transaction_date_ms - b.transaction_date_ms || a.espn_transaction_id.localeCompare(b.espn_transaction_id));
      const completed = group.acceptances.at(-1);
      const proposalItems = tradeItemsByTransaction.get(group.key) || [];
      const acceptedItems = group.acceptances.flatMap(row => tradeItemsByTransaction.get(archiveTransactionKey(group.seasonYear, row.espn_transaction_id)) || []);
      const sourceItems = proposalItems.length ? proposalItems : acceptedItems;
      const seenItems = new Set();
      const tradeItems = sourceItems.filter(item => {
        const key = [item.player_id || item.player_name, item.from_team_id || item.from_team_name, item.to_team_id || item.to_team_name].join('|');
        if(seenItems.has(key)) return false;
        seenItems.add(key);
        return true;
      });
      const teams = [];
      const sides = new Map();
      const addTeam = team => {
        if(!team || sides.has(team)) return;
        teams.push(team);
        sides.set(team, {gives:[], receives:[]});
      };
      for(const item of tradeItems){
        addTeam(item.from_team_name);
        addTeam(item.to_team_name);
      }
      for(const item of tradeItems){
        if(item.from_team_name) sides.get(item.from_team_name)?.gives.push(item.player_name);
        if(item.to_team_name) sides.get(item.to_team_name)?.receives.push(item.player_name);
      }

      trades.push({
        ...completed,
        id:group.key,
        deal_id:group.dealId,
        espn_transaction_id:group.dealId,
        transaction_type:'TRADE_ACCEPT',
        status:'EXECUTED',
        team_name:teams.length ? teams.join(' \u2194 ') : 'League trade',
        acceptance_count:group.acceptances.length,
        source_acceptance_ids:group.acceptances.map(row => row.espn_transaction_id),
        items:tradeItems,
        teams,
        sides,
        incomplete:tradeItems.length === 0
      });
    }
    return trades.sort((a,b) => b.transaction_date_ms - a.transaction_date_ms || a.id.localeCompare(b.id));
  }

  window.gateShared = Object.freeze({
    escapeHtml,
    parseRecord,
    recordText,
    formatNumber,
    ordinal,
    relativeTime,
    trapFocus,
    normalizeSeason,
    normalizeMember,
    memberTotals,
    latestSeason,
    memberPresentation,
    buildAcceptedTradeArchive
  });
})();
