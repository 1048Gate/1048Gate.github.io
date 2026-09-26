/* Phase 3: This Week matchup cards and compact standings snapshot. */
(function(){
  const PLAYOFF_SLOTS = 6;

  function pointsLine(value){
    if(value == null || value === '') return '\u2014';
    const number = Number(value);
    if(!Number.isFinite(number)) return '\u2014';
    return Number.isInteger(number) ? String(number) : number.toFixed(1).replace(/\.0$/, '');
  }

  function recordLine(team){
    const wins = Number(team.wins || 0);
    const losses = Number(team.losses || 0);
    const ties = Number(team.ties || 0);
    return ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
  }

  function statusLabel(state){
    if(state === 'live') return 'Live';
    if(state === 'final') return 'Final';
    return 'Upcoming';
  }

  function normalizedState(state){
    return state === 'live' || state === 'final' ? state : 'scheduled';
  }

  function numericScore(value){
    if(value == null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function marginFor(game){
    const away = numericScore(game?.away?.score);
    const home = numericScore(game?.home?.score);
    if(away == null || home == null) return null;
    return Math.abs(away - home);
  }

  function leaderSide(game){
    const away = numericScore(game?.away?.score);
    const home = numericScore(game?.home?.score);
    if(away == null || home == null || away === home) return null;
    return away > home ? 'away' : 'home';
  }

  function sideClass(which, leader){
    const lead = leader === which ? ' is-leading' : leader ? ' is-trailing' : '';
    return `week-game-side is-${which}${lead}`;
  }

  function sideHtml(side, className, escapeHtml){
    const score = side?.score == null ? '\u2014' : pointsLine(side.score);
    return `<div class="${className}">
      <span class="week-card-owner">${escapeHtml(side?.owner || '')}</span>
      <strong>${escapeHtml(side?.team || 'Team')}</strong>
      <b>${escapeHtml(score)}</b>
    </div>`;
  }

  function marginCopy(game){
    const state = normalizedState(game?.state);
    const margin = marginFor(game);
    if(margin == null) return '';
    if(margin === 0) return state === 'scheduled' ? '' : 'Tied';
    const verb = state === 'final' ? 'Won by' : 'Ahead by';
    return `${verb} ${pointsLine(margin)}`;
  }

  function matchupCardHtml(game, escapeHtml){
    const esc = escapeHtml || (value => String(value ?? ''));
    const state = normalizedState(game?.state);
    const leader = leaderSide(game);
    const vs = state === 'live' ? 'live' : state === 'final' ? 'final' : 'at';
    return `<article class="week-game week-card is-${esc(state)}" data-state="${esc(state)}">
      <header class="week-card-status">
        <span class="week-card-badge">${statusLabel(state)}</span>
        <span class="week-card-margin">${esc(marginCopy(game))}</span>
      </header>
      <div class="week-card-sides">
        ${sideHtml(game?.away, sideClass('away', leader), esc)}
        <div class="week-game-vs">${vs}</div>
        ${sideHtml(game?.home, sideClass('home', leader), esc)}
      </div>
    </article>`;
  }

  function standingsSnapshotHtml(standings, note, escapeHtml, playoffSlots){
    const esc = escapeHtml || (value => String(value ?? ''));
    const slots = Number(playoffSlots) > 0 ? Number(playoffSlots) : PLAYOFF_SLOTS;
    const rows = (standings || []).map((team, index) => {
      const rank = index + 1;
      const cutoff = rank === slots ? ' class="is-playoff-line"' : '';
      return `<tr${cutoff}><td class="week-standings-rank">${rank}</td>
        <td class="week-standings-team"><strong>${esc(team.team || 'Team')}</strong><small>${esc(team.owner || '')}</small></td>
        <td class="week-standings-manager">${esc(team.owner || '')}</td>
        <td>${esc(recordLine(team))}</td>
        <td>${esc(pointsLine(team.pointsFor))}</td></tr>`;
    }).join('');
    const cutoffNote = (standings || []).length >= slots ? ' · Top 6 in the playoff picture' : '';
    return `<div class="week-standings-scroll-hint" aria-hidden="true">Standings · team, record, points</div><div class="week-standings-wrap"><table class="week-standings-table"><thead><tr><th>#</th><th>Team</th><th class="week-standings-manager">Mgr</th><th>Rec</th><th>PF</th></tr></thead><tbody>${rows}</tbody></table></div><p class="week-standings-note">${esc(note || '')}${cutoffNote}</p>`;
  }

  window.gateWeekBoard = Object.freeze({
    PLAYOFF_SLOTS,
    pointsLine,
    recordLine,
    statusLabel,
    normalizedState,
    marginFor,
    leaderSide,
    marginCopy,
    matchupCardHtml,
    standingsSnapshotHtml
  });
})();
