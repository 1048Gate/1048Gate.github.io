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

  /* One matchup side as a single reference-table row: team (one line, ellipsis),
     manager beneath, score at the right. The margin rides with the leading side. */
  function sideHtml(side, className, escapeHtml, margin, state, standing){
    const scheduled = state === 'scheduled';
    const score = scheduled ? pointsLine(side?.projectedScore) : side?.score == null ? '\u2014' : pointsLine(side.score);
    const team = side?.team || 'Team';
    const owner = side?.owner || '';
    const played = standing ? Number(standing.wins || 0) + Number(standing.losses || 0) + Number(standing.ties || 0) : 0;
    const ppg = played && Number.isFinite(Number(standing?.pointsFor)) ? Number(standing.pointsFor) / played : null;
    const context = scheduled && standing ? `${recordLine(standing)}${ppg == null ? '' : ` · ${pointsLine(ppg)} PF/G`}` : '';
    return `<div class="${className}">
      <span class="week-card-name"><button type="button" class="week-team-link" data-team-owner="${escapeHtml(owner)}" title="View ${escapeHtml(team)} projections and history">${escapeHtml(team)}</button><span class="week-card-owner"${owner ? ` title="${escapeHtml(owner)}"` : ''}>${escapeHtml(owner)}</span>${context ? `<span class="week-card-context">${escapeHtml(context)}</span>` : ''}</span>
      <span class="week-card-score"><b>${escapeHtml(score)}</b>${margin ? `<span class="week-card-margin">${escapeHtml(margin)}</span>` : ''}</span>
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

  function matchupCardHtml(game, escapeHtml, standings = []){
    const esc = escapeHtml || (value => String(value ?? ''));
    const state = normalizedState(game?.state);
    const leader = state === 'scheduled' ? null : leaderSide(game);
    const margin = state === 'scheduled' ? '' : marginCopy(game);
    const standingFor = side => standings.find(team =>
      (side?.teamId && String(team.teamId) === String(side.teamId)) ||
      (side?.owner && team.owner === side.owner)
    );
    /* A lead attaches to the leading side; scheduled games carry season context instead. */
    const statusNote = state === 'scheduled' ? 'ESPN projected points' : margin && !leader ? margin : '';
    return `<article class="week-game week-card is-${esc(state)}" data-state="${esc(state)}"${leader ? ` data-leader="${leader}"` : ''}>
      <header class="week-card-status">
        <span class="week-card-badge">${statusLabel(state)}</span>${statusNote ? `
        <span class="week-card-margin">${esc(statusNote)}</span>` : ''}
      </header>
      <div class="week-card-sides">
        ${sideHtml(game?.away, sideClass('away', leader), esc, leader === 'away' ? margin : '', state, standingFor(game?.away))}
        ${sideHtml(game?.home, sideClass('home', leader), esc, leader === 'home' ? margin : '', state, standingFor(game?.home))}
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
        <td>${esc(team.team || 'Team')}</td>
        <td>${esc(team.owner || '')}</td>
        <td>${esc(recordLine(team))}</td>
        <td>${esc(pointsLine(team.pointsFor))}</td></tr>`;
    }).join('');
    const cutoffNote = (standings || []).length >= slots ? ' · Top 6 in the playoff picture' : '';
    return `<div class="week-standings-scroll-hint" aria-hidden="true">Swipe standings →</div><div class="week-standings-wrap"><table class="week-standings-table"><thead><tr><th>#</th><th>Team</th><th>Mgr</th><th>Rec</th><th>PF</th></tr></thead><tbody>${rows}</tbody></table></div><p class="week-standings-note">${esc(note || '')}${cutoffNote}</p>`;
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
