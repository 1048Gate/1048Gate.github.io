/* League reference desk: compact, stats-first homepage sections built only from
   feeds the site already publishes (homepage-week/current-season, site.json,
   matchups.json, seasons.json, streaks.json) plus the existing public
   transaction archive RPC. Nothing here invents numbers: when a feed is missing
   the section says so. Pure helpers are exported on window.gateReferenceDesk
   so scripts/test-reference-desk.mjs can check them without a browser. */
(function(){
  const PLAYOFF_SLOTS = 6;
  const REGULAR_SEASON_GAMES = 14; // 2026 regular season (confirmed by the commissioner)
  const clean = value => String(value ?? '').trim().replace(/\s+/g, ' ');
  const num = value => { const n = Number(value); return Number.isFinite(n) ? n : null; };
  const fixed = (value, digits = 1) => { const n = num(value); return n == null ? '—' : n.toFixed(digits); };
  const signed = (value, digits = 1) => { const n = num(value); if(n == null) return '—'; const s = Math.abs(n).toFixed(digits); return n > 0 ? `+${s}` : n < 0 ? `−${s}` : s; };
  const ordinal = n => { const v = n % 100; return `${n}${(v >= 11 && v <= 13) ? 'th' : ({1:'st',2:'nd',3:'rd'})[n % 10] || 'th'}`; };
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const wordCount = n => ['no','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'][n] ?? String(n);
  const name = row => clean(row?.owner || row?.team || 'Unknown');
  const wins = row => Number(row?.wins || 0) + 0.5 * Number(row?.ties || 0);
  const played = row => Number(row?.wins || 0) + Number(row?.losses || 0) + Number(row?.ties || 0);
  const record = row => { const w = Number(row?.wins || 0), l = Number(row?.losses || 0), t = Number(row?.ties || 0); return t ? `${w}-${l}-${t}` : `${w}-${l}`; };
  const pct = row => { const gp = played(row); if(!gp) return '—'; const p = wins(row) / gp; return p >= 1 ? '1.000' : p.toFixed(3).replace(/^0/, ''); };

  /* Same ordering the week board uses: record (ties = half), then total points for (Rules §5). */
  function sortStandings(rows){
    return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => (wins(b) - wins(a)) || (Number(b.pointsFor || 0) - Number(a.pointsFor || 0)));
  }
  function completedWeeks(table){ return table.reduce((max, row) => Math.max(max, played(row)), 0); }
  const gamesRemaining = row => Math.max(0, REGULAR_SEASON_GAMES - played(row));
  const gamesBehind = (row, ref) => ((Number(ref.wins || 0) - Number(row.wins || 0)) + (Number(row.losses || 0) - Number(ref.losses || 0))) / 2;

  function impliedProbability(odds){
    const match = /^\s*([+-])\s*(\d+(?:\.\d+)?)\s*$/.exec(String(odds ?? ''));
    if(!match) return null;
    const price = Number(match[2]);
    if(!price) return null;
    return match[1] === '+' ? 100 / (price + 100) : price / (price + 100);
  }
  const probLabel = p => p == null ? '—' : `${(p * 100).toFixed(1)}%`;

  function games(board){
    return (Array.isArray(board?.matchups) ? board.matchups : []).filter(game => game?.away && game?.home);
  }
  function scored(game){
    const a = num(game.away.score), h = num(game.home.score);
    if(a == null || h == null) return null;
    if(game.state !== 'live' && game.state !== 'final') return null;
    const awayAhead = a >= h;
    return {game, lead:awayAhead ? game.away : game.home, trail:awayAhead ? game.home : game.away, leadScore:Math.max(a, h), trailScore:Math.min(a, h), margin:Math.abs(a - h), tied:a === h};
  }

  /* Aggregates the board does not show at a glance (top score, closest, widest).
     Game state lives on the board and in the masthead, so it is not restated here. */
  function weekNote(board){
    const list = games(board);
    const week = board?.week;
    const label = board?.phase || (week ? `Week ${week}` : 'This week');
    if(!list.length) return '';
    const live = list.filter(g => g.state === 'live').length;
    const final = list.filter(g => g.state === 'final').length;
    const results = list.map(scored).filter(Boolean);
    if(!results.length || (!live && !final)) return '';
    const byMargin = [...results].sort((a, b) => a.margin - b.margin);
    const close = byMargin[0], wide = byMargin[byMargin.length - 1];
    const sides = results.flatMap(r => [{owner:name(r.lead), score:r.leadScore}, {owner:name(r.trail), score:r.trailScore}]).sort((a, b) => b.score - a.score);
    const top = sides[0];
    const allFinal = final === list.length;
    const verb = r => r.game.state === 'final' ? 'beat' : 'leads';
    const lines = [`${label} ${allFinal ? 'high score' : 'top score so far'}: ${top.owner}, ${fixed(top.score)}.`];
    if(close.tied) lines.push(`${name(close.lead)} and ${name(close.trail)} are level at ${fixed(close.leadScore)}.`);
    else lines.push(`Closest: ${name(close.lead)} ${verb(close)} ${name(close.trail)} by ${fixed(close.margin)}.`);
    if(wide !== close && wide.margin > 0) lines.push(`Widest: ${name(wide.lead)} ${verb(wide)} ${name(wide.trail)} by ${fixed(wide.margin)}.`);
    return lines.join(' ');
  }

  /* Only what the table does not say on its own: a tie at the top broken on
     points, and a points-for leader sitting lower than his scoring suggests. */
  function standingsNote(table){
    if(table.length < 2) return '';
    const done = completedWeeks(table);
    if(!done) return 'No completed games yet. Order reflects points for until results arrive.';
    const leader = table[0];
    const tiedTop = table.filter(row => wins(row) === wins(leader) && played(row) === played(leader));
    const lines = [];
    if(tiedTop.length > 1) lines.push(`${wordCount(tiedTop.length)[0].toUpperCase()}${wordCount(tiedTop.length).slice(1)} teams are ${record(leader)}; ${name(leader)} leads on points for (${fixed(leader.pointsFor)}).`);
    const pfLeader = [...table].sort((a, b) => Number(b.pointsFor || 0) - Number(a.pointsFor || 0))[0];
    const pfRank = table.indexOf(pfLeader) + 1;
    if(pfLeader && pfRank > 3){
      const paRank = [...table].sort((a, b) => Number(b.pointsAgainst || 0) - Number(a.pointsAgainst || 0)).indexOf(pfLeader) + 1;
      const unlucky = num(pfLeader.pointsAgainst) != null && paRank > 0 && paRank <= Math.ceil(table.length / 3);
      lines.push(`${name(pfLeader)} leads the league in points (${fixed(pfLeader.pointsFor)}) but sits ${ordinal(pfRank)} at ${record(pfLeader)}${unlucky ? `; ${fixed(pfLeader.pointsAgainst)} points against, ${ordinal(paRank)}-most in the league` : ''}.`);
    }
    if(!lines.length) lines.push(`${name(leader)} leads at ${record(leader)} with ${fixed(leader.pointsFor)} points for.`);
    return lines.join(' ');
  }

  function standingsRows(table){
    const leader = table[0];
    return table.map((row, index) => {
      const gp = played(row);
      const pf = num(row.pointsFor), pa = num(row.pointsAgainst);
      return {
        rank:index + 1, owner:name(row), team:clean(row.team), w:Number(row.wins || 0), l:Number(row.losses || 0), t:Number(row.ties || 0),
        pct:pct(row), pf, pa, diff:pf != null && pa != null ? pf - pa : null, ppg:gp && pf != null ? pf / gp : null,
        gb:index === 0 ? null : gamesBehind(row, leader), gr:gamesRemaining(row), cut:index + 1 === PLAYOFF_SLOTS
      };
    });
  }

  function playoffRace(table){
    if(table.length <= PLAYOFF_SLOTS) return null;
    const sixth = table[PLAYOFF_SLOTS - 1], seventh = table[PLAYOFF_SLOTS];
    const rows = table.map((row, index) => {
      const seed = index + 1;
      const inField = seed <= PLAYOFF_SLOTS;
      const ref = inField ? seventh : sixth;
      const games = inField ? gamesBehind(ref, row) : -gamesBehind(row, ref);
      return {seed, owner:name(row), record:record(row), pf:num(row.pointsFor), gr:gamesRemaining(row), inField, gamesVsCut:games, pfVsSixth:num(row.pointsFor) != null && num(sixth.pointsFor) != null ? Number(row.pointsFor) - Number(sixth.pointsFor) : null};
    });
    const gap = gamesBehind(seventh, sixth);
    const done = completedWeeks(table);
    let note;
    if(!done) note = 'No completed games; the race has not started.';
    else if(gap === 0) note = `${name(sixth)} holds No. 6 at ${record(sixth)}. ${name(seventh)} is level on record and ${fixed(Number(sixth.pointsFor || 0) - Number(seventh.pointsFor || 0))} points behind on the tiebreaker.`;
    else note = `${name(sixth)} holds No. 6 at ${record(sixth)}. ${name(seventh)} is ${gap === 1 ? 'one game' : `${gap} games`} back.`;
    const level = table.filter(row => wins(row) === wins(sixth) && played(row) === played(sixth)).length;
    if(done && level > 2) note += ` ${wordCount(level)[0].toUpperCase()}${wordCount(level).slice(1)} teams are ${record(sixth)} around the cut; points for is sorting them.`;
    return {rows, note};
  }

  function seasonScores(archive, seasonYear){
    const rows = Array.isArray(archive?.currentSeasonScores) ? archive.currentSeasonScores : [];
    return rows.filter(row => (!seasonYear || Number(row.season) === Number(seasonYear)) && num(row.score) != null);
  }
  function weekSpan(rows){
    const weeks = [...new Set(rows.map(row => Number(row.week)).filter(Number.isFinite))].sort((a, b) => a - b);
    if(!weeks.length) return '';
    return weeks.length === 1 ? `Wk ${weeks[0]}` : `Wks ${weeks[0]}–${weeks[weeks.length - 1]}`;
  }

  function leaders(table, archive, board, seasonYear){
    const blocks = [];
    const done = completedWeeks(table);
    const top = (rows, value, format, dir = -1) => [...rows].filter(row => value(row) != null).sort((a, b) => dir * (value(a) - value(b))).slice(0, 3).map(row => ({owner:name(row), value:format(value(row))}));
    if(done){
      const span = `Thru ${plural(done, 'week')}`;
      blocks.push({title:'Points for', span, rows:top(table, row => num(row.pointsFor), v => fixed(v))});
      blocks.push({title:'Point differential', span, rows:top(table, row => num(row.pointsFor) != null && num(row.pointsAgainst) != null ? row.pointsFor - row.pointsAgainst : null, v => signed(v))});
      blocks.push({title:'Points against', span:`${span} · most`, rows:top(table, row => num(row.pointsAgainst), v => fixed(v))});
    }
    const scores = seasonScores(archive, seasonYear);
    if(scores.length){
      const span = weekSpan(scores);
      const fmt = row => ({owner:clean(row.owner), value:`${fixed(row.score)}`, detail:`Wk ${row.week}`});
      blocks.push({title:'High score, one week', span, rows:[...scores].sort((a, b) => b.score - a.score).slice(0, 3).map(fmt)});
      blocks.push({title:'Low score, one week', span, rows:[...scores].sort((a, b) => a.score - b.score).slice(0, 3).map(fmt)});
    }
    const results = games(board).map(scored).filter(Boolean);
    if(results.length){
      const state = results.every(r => r.game.state === 'final') ? 'final' : 'live';
      const sides = results.flatMap(r => [{owner:name(r.lead), score:r.leadScore}, {owner:name(r.trail), score:r.trailScore}]).sort((a, b) => b.score - a.score).slice(0, 3);
      blocks.push({title:`Week ${board.week} scoring`, span:state === 'final' ? 'Final' : 'Live · not final', rows:sides.map(side => ({owner:side.owner, value:fixed(side.score)}))});
    }
    return blocks.filter(block => block.rows.length);
  }

  function championsFrom(seasons){
    return (Array.isArray(seasons?.seasons) ? seasons.seasons : [])
      .map(row => ({year:Number(row[0]), owner:clean(row[2]), team:clean(row[3])}))
      .filter(row => Number.isFinite(row.year) && row.owner)
      .sort((a, b) => a.year - b.year);
  }

  function historyNotes({seasons, archive, streaks, config, table}){
    const notes = [];
    const champs = championsFrom(seasons);
    const currentRow = owner => (table || []).find(row => name(row) === owner);
    if(champs.length){
      const last = champs[champs.length - 1];
      const defending = currentRow(last.owner);
      notes.push(`Defending champion: ${last.owner} (${last.year}, ${last.team})${defending && played(defending) ? `, ${record(defending)} so far in ${config?.seasonYear || 'the current season'}` : ''}.`);
      const tally = new Map();
      champs.forEach(row => { if(!tally.has(row.owner)) tally.set(row.owner, []); tally.get(row.owner).push(row.year); });
      const ranked = [...tally].sort((a, b) => b[1].length - a[1].length || a[1][0] - b[1][0]);
      const most = ranked[0][1].length;
      const leadersList = ranked.filter(([, years]) => years.length === most).map(([owner, years]) => `${owner} ${years.length} (${years.join(', ')})`);
      notes.push(`Most titles: ${leadersList.join('; ')}. ${wordCount(tally.size)[0].toUpperCase()}${wordCount(tally.size).slice(1)} different managers have won in ${champs.length} seasons.`);
      const repeats = champs.filter((row, index) => index > 0 && champs[index - 1].owner === row.owner).map(row => `${row.owner} (${row.year - 1}–${String(row.year).slice(2)})`);
      if(repeats.length) notes.push(`Repeat champions: ${repeats.join(', ')}.`);
    }
    const high = archive?.records?.highestScore;
    if(Array.isArray(high) && num(high[0]) != null) notes.push(`Single-week scoring record: ${fixed(high[0], 2)}, ${clean(high[1])}, ${high[5]} Wk ${high[6]}.`);
    const close = archive?.records?.closestGame;
    /* records.closestGame: [margin, winner, winnerScore, loser, loserScore, season, week, ...] */
    if(Array.isArray(close) && num(close[0]) != null && num(close[2]) != null) notes.push(`Closest game on record: ${fixed(close[0], 2)} points, ${clean(close[1])} ${fixed(close[2], 2)} over ${clean(close[3])} ${fixed(close[4], 2)} (${close[5]} Wk ${close[6]}).`);
    const blowout = archive?.records?.biggestBlowout;
    if(Array.isArray(blowout) && num(blowout[0]) != null && num(blowout[2]) != null) notes.push(`Widest margin on record: ${fixed(blowout[0], 2)} points, ${clean(blowout[1])} ${fixed(blowout[2], 2)} over ${clean(blowout[3])} ${fixed(blowout[4], 2)} (${blowout[5]} Wk ${blowout[6]}).`);
    const win = streaks?.longestWinningStreak;
    if(win?.games) notes.push(`Longest winning streak: ${win.games}, ${clean(win.manager)} (${win.season}, Wks ${win.startWeek}–${win.endWeek}).`);
    const losing = Array.isArray(streaks?.leaderboards?.losingStreaks) ? streaks.leaderboards.losingStreaks : [];
    const worst = losing[0]?.games;
    if(worst){
      const grouped = new Map();
      losing.filter(row => row.games === worst).forEach(row => { const key = clean(row.manager); if(!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(row.season); });
      const holders = [...grouped].map(([manager, years]) => `${manager} (${years.join(', ')})`);
      notes.push(`Longest losing streak: ${worst}, ${holders.join('; ')}.`);
      const favorite = Array.isArray(config?.futures) ? clean(config.futures[0]?.name) : '';
      if(favorite && losing.some(row => row.games === worst && clean(row.manager) === favorite)){
        notes.push(`The current odds favorite, ${favorite}, holds a share of that losing-streak record. The board has a short memory.`);
      }
    }
    return notes;
  }

  function oddsNote(config, table, board){
    const futures = Array.isArray(config?.futures) ? config.futures.filter(row => row?.name && row?.odds) : [];
    if(!futures.length) return '';
    const fav = futures[0];
    const favRow = (table || []).find(row => name(row) === clean(fav.name));
    const favRank = favRow ? table.indexOf(favRow) + 1 : 0;
    const p = impliedProbability(fav.odds);
    const week = Number(board?.week) || null;
    const lines = [`${clean(fav.name)} is the league-office favorite${week ? ` in Week ${week}` : ''} at ${fav.odds}${p != null ? ` (${probLabel(p)} implied)` : ''}.`];
    const leader = table?.[0];
    const leaderLine = leader && played(leader) && name(leader) !== clean(fav.name) ? futures.find(row => clean(row.name) === name(leader)) : null;
    const favPlace = favRow && played(favRow) ? `The favorite sits ${ordinal(favRank)} at ${record(favRow)}` : '';
    const leaderText = leaderLine ? `the table leader, ${name(leader)} (${record(leader)}), is ${leaderLine.odds}` : '';
    if(favPlace && leaderText) lines.push(`${favPlace}; ${leaderText}.`);
    else if(favPlace) lines.push(`${favPlace}.`);
    else if(leaderText) lines.push(`${leaderText[0].toUpperCase()}${leaderText.slice(1)}.`);
    const probs = futures.map(row => impliedProbability(row.odds));
    if(probs.every(value => value != null)){
      const total = probs.reduce((sum, value) => sum + value, 0) * 100;
      if(total > 100.5) lines.push(`The ${plural(futures.length, 'price')} sum to ${total.toFixed(1)}% implied; the office keeps a margin, like any book.`);
    }
    return lines.join(' ');
  }

  const TYPE_LABELS = {FREEAGENT:'Add/drop', WAIVER:'Waiver', TRADE_ACCEPT:'Trade'};
  function transactionRows(items){
    return (Array.isArray(items) ? items : []).map(row => {
      const parts = (Array.isArray(row.items) ? row.items : []).map(item => {
        const player = clean(item.player_name) || 'Player';
        if(item.item_type === 'ADD') return `+ ${player}`;
        if(item.item_type === 'DROP') return `− ${player}`;
        if(item.item_type === 'TRADE') return `${player} → ${clean(item.to_team_name) || 'another team'}`;
        return player;
      });
      const detail = parts.length > 3 ? `${parts.slice(0, 3).join('; ')}; +${parts.length - 3} more` : parts.join('; ');
      const ms = Number(row.transaction_date_ms);
      return {
        date:Number.isFinite(ms) && ms > 0 ? new Intl.DateTimeFormat('en-US', {timeZone:'America/New_York', month:'short', day:'numeric'}).format(new Date(ms)) : '—',
        week:row.scoring_period ? `Wk ${row.scoring_period}` : '',
        team:clean(row.team_name) || 'League',
        type:TYPE_LABELS[row.transaction_type] || clean(String(row.transaction_type || '').toLowerCase().replaceAll('_', ' ')) || 'Move',
        detail:detail || 'Details in the Wire archive'
      };
    });
  }

  const api = {REGULAR_SEASON_GAMES, gamesRemaining, sortStandings, completedWeeks, impliedProbability, probLabel, weekNote, standingsNote, standingsRows, playoffRace, leaders, historyNotes, oddsNote, transactionRows, record, ordinal};
  window.gateReferenceDesk = Object.freeze(api);
  if(typeof document === 'undefined' || !document.getElementById) return;

  /* ---------------- DOM rendering ---------------- */
  const esc = value => (window.gateShared?.escapeHtml || (text => String(text ?? '')))(value);
  const feeds = {matchups:null, seasons:null, streaks:null};
  let feedsRequested = false, txRequested = false;

  function setHtml(id, html){ const node = document.querySelector(`[data-desk-body="${id}"]`); if(node) node.innerHTML = html; }
  function setNote(id, text){ const node = document.querySelector(`[data-desk-note="${id}"]`); if(!node) return; node.textContent = text || ''; node.hidden = !text; }
  function setStatus(id, text){ const node = document.querySelector(`[data-desk-status="${id}"]`); if(node) node.textContent = text; }
  const unavailable = text => `<p class="desk-unavailable">${esc(text)}</p>`;

  async function loadFeeds(){
    if(feedsRequested) return;
    feedsRequested = true;
    await Promise.all(Object.keys(feeds).map(async key => {
      try{ const response = await fetch(`data/${key}.json`); if(response.ok) feeds[key] = await response.json(); }
      catch(error){ console.warn(`Reference desk could not load data/${key}.json.`, error); }
    }));
    render();
  }

  /* Phones default to a compact view (Rk | Manager | W-L | PF | GB) with a toggle
     for every column; desktop always shows the full table. Same rows, same math:
     compact only hides cells (.desk-col-full) and shows the combined W-L cell
     (.desk-col-compact). */
  let standingsExpanded = false;
  function renderStandings(table){
    const home = document.getElementById('home');
    if(table.length < 2){ home?.classList.remove('has-desk-standings'); setHtml('standings', unavailable('Standings unavailable from the current snapshot. The Current Week board shows the saved table.')); return; }
    const rows = standingsRows(table);
    const ties = rows.some(row => row.t);
    const F = ' desk-col-full', C = ' desk-col-compact';
    const body = rows.map(row => `<tr${row.cut ? ' class="is-playoff-line"' : ''}><td class="num">${row.rank}</td><td class="desk-strong">${esc(row.owner)}</td><td class="desk-team${F}">${esc(row.team)}</td><td class="num${C}">${esc(record({wins:row.w, losses:row.l, ties:row.t}))}</td><td class="num${F}">${row.w}</td><td class="num${F}">${row.l}</td>${ties ? `<td class="num${F}">${row.t}</td>` : ''}<td class="num${F}">${row.pct}</td><td class="num">${fixed(row.pf)}</td><td class="num${F}">${fixed(row.pa)}</td><td class="num${F}">${signed(row.diff)}</td><td class="num${F}">${fixed(row.ppg)}</td><td class="num">${row.gb == null ? '—' : row.gb.toFixed(1)}</td><td class="num${F}">${row.gr}</td></tr>`).join('');
    const expanded = standingsExpanded;
    setHtml('standings', `<div class="desk-standings${expanded ? ' is-expanded' : ''}"><div class="desk-standings-tools"><span class="desk-standings-hint" aria-hidden="true">Swipe for all columns →</span><button type="button" class="desk-link desk-standings-toggle" data-standings-toggle aria-controls="deskStandingsTable" aria-expanded="${expanded}">${expanded ? 'Compact standings' : 'Full standings'}</button></div><div class="desk-scroll" id="deskStandingsTable"><table class="desk-table desk-standings-table"><thead><tr><th class="num">Rk</th><th>Manager</th><th class="desk-team${F}">Team</th><th class="num${C}">W-L</th><th class="num${F}">W</th><th class="num${F}">L</th>${ties ? `<th class="num${F}">T</th>` : ''}<th class="num${F}">Pct</th><th class="num">PF</th><th class="num${F}">PA</th><th class="num${F}">Diff</th><th class="num${F}">PF/G</th><th class="num">GB</th><th class="num${F}" title="Regular-season games remaining (${REGULAR_SEASON_GAMES}-game schedule)">GR</th></tr></thead><tbody>${body}</tbody></table></div></div><p class="desk-foot">Ties in record break on total points for (Rules §5). Rule under No. ${PLAYOFF_SLOTS} marks the playoff line. PF/G uses completed games only. GB = games behind No. 1. GR = games remaining of the ${REGULAR_SEASON_GAMES}-game regular season.</p>`);
    home?.classList.add('has-desk-standings');
    setNote('standings', standingsNote(table));
  }
  document.addEventListener('click', event => {
    const toggle = event.target.closest?.('[data-standings-toggle]');
    if(!toggle) return;
    const wrap = toggle.closest('.desk-standings');
    standingsExpanded = !wrap?.classList.contains('is-expanded');
    wrap?.classList.toggle('is-expanded', standingsExpanded);
    toggle.setAttribute('aria-expanded', String(standingsExpanded));
    toggle.textContent = standingsExpanded ? 'Compact standings' : 'Full standings';
  });

  function renderLeaders(table, board, config){
    const blocks = leaders(table, feeds.matchups, board, config?.seasonYear);
    if(!blocks.length){ setHtml('leaders', unavailable('No completed games yet. Leaders appear after Week 1 is final.')); return; }
    setHtml('leaders', `<div class="desk-leaders">${blocks.map(block => `<table class="desk-mini"><caption><span>${esc(block.title)}</span><small>${esc(block.span)}</small></caption><tbody>${block.rows.map((row, index) => `<tr><td class="num">${index + 1}</td><td>${esc(row.owner)}${row.detail ? ` <small>${esc(row.detail)}</small>` : ''}</td><td class="num desk-strong">${esc(row.value)}</td></tr>`).join('')}</tbody></table>`).join('')}</div>`);
  }

  function renderPlayoff(table){
    const race = playoffRace(table);
    if(!race){ setHtml('playoff', unavailable('Playoff race unavailable from the current snapshot.')); setNote('playoff', ''); return; }
    setNote('playoff', race.note);
    const body = race.rows.map(row => `<tr class="${row.inField ? 'is-in' : 'is-out'}${row.seed === PLAYOFF_SLOTS ? ' is-playoff-line' : ''}"><td class="num">${row.seed}</td><td class="desk-strong">${esc(row.owner)}</td><td class="num">${esc(row.record)}</td><td class="num">${fixed(row.pf)}</td><td class="num">${row.gamesVsCut === 0 ? '0.0' : signed(row.gamesVsCut)}</td><td class="num">${row.seed === PLAYOFF_SLOTS ? '—' : signed(row.pfVsSixth)}</td><td class="num">${row.gr}</td></tr>`).join('');
    setHtml('playoff', `<div class="desk-scroll"><table class="desk-table desk-race"><thead><tr><th class="num">Seed</th><th>Manager</th><th class="num">Rec</th><th class="num">PF</th><th class="num" title="Seeds 1–6: games ahead of No. 7. Seeds 7–12: games behind No. 6.">G vs cut</th><th class="num" title="Total points for relative to No. 6, the seeding tiebreaker">PF vs No. 6</th><th class="num" title="Regular-season games remaining (${REGULAR_SEASON_GAMES}-game schedule)">Games left</th></tr></thead><tbody>${body}</tbody></table></div><p class="desk-foot">Six teams qualify (Rules §5). “G vs cut” is games ahead of No. 7 for seeds 1–6 and games behind No. 6 for seeds 7–12. “Games left” counts the ${REGULAR_SEASON_GAMES}-game regular season. No projections here; the simulation board lives under Playoffs.</p>`);
  }

  function renderHistory(table, config){
    if(!feeds.seasons && !feeds.matchups && !feeds.streaks){ if(feedsRequested) setHtml('history', unavailable('Archive feeds are loading or unavailable.')); return; }
    const notes = historyNotes({seasons:feeds.seasons, archive:feeds.matchups, streaks:feeds.streaks, config, table});
    setHtml('history', notes.length ? `<ol class="desk-notes">${notes.map(note => `<li>${esc(note)}</li>`).join('')}</ol><p class="desk-foot"><strong>From The Book.</strong> Season, matchup, and streak archives (2017–present). <button type="button" class="desk-link" data-view-link="intel">Open The Book →</button></p>` : unavailable('Historical notes unavailable.'));
  }

  function render(){
    const config = window.gateSiteConfig;
    const board = window.gateHomeBoard;
    if(board){
      const table = sortStandings(board.standings);
      setNote('week', weekNote(board));
      renderStandings(table);
      renderLeaders(table, board, config);
      renderPlayoff(table);
      if(config) setNote('odds', oddsNote(config, table, board));
      renderHistory(table, config);
    }else if(config){
      setNote('odds', oddsNote(config, [], null));
      renderHistory([], config);
    }
    if(!feedsRequested) loadFeeds();
  }

  function renderTransactions(items, year){
    const rows = transactionRows(items);
    if(!rows.length){ setHtml('transactions', unavailable(`No completed ${year || 'current-season'} moves in the verified archive yet. Older seasons are on the Wire.`)); setStatus('transactions', 'Verified archive'); return; }
    setHtml('transactions', `<div class="desk-scroll"><table class="desk-table desk-tx"><thead><tr><th>Date</th><th>Team</th><th>Move</th><th>Detail</th></tr></thead><tbody>${rows.map(row => `<tr><td class="desk-nowrap">${esc(row.date)}${row.week ? ` <small>${esc(row.week)}</small>` : ''}</td><td class="desk-strong">${esc(row.team)}</td><td class="desk-nowrap">${esc(row.type)}</td><td>${esc(row.detail)}</td></tr>`).join('')}</tbody></table></div><p class="desk-foot">Completed moves only, newest first, from the verified transaction archive. Full ledger on the <button type="button" class="desk-link" data-view-link="transactions">Wire</button>.</p>`);
    setStatus('transactions', `Latest ${rows.length} · verified archive`);
  }

  async function loadTransactions(){
    if(txRequested) return;
    const supabase = window.gateSupabase || await (window.gateSupabaseReady || Promise.resolve(null));
    if(!supabase) return;
    txRequested = true;
    const year = Number(window.gateSiteConfig?.seasonYear) || null;
    try{
      const {data, error} = await supabase.rpc('get_transaction_archive', {p_page:1, p_page_size:6, p_season_year:year, p_category:'all', p_search:null, p_sort:'newest'});
      if(error) throw error;
      renderTransactions(Array.isArray(data?.items) ? data.items : [], year);
    }catch(error){
      console.warn('Reference desk could not load recent transactions.', error);
      setHtml('transactions', unavailable('Transaction feed unavailable right now. The full archive is on the Wire.'));
      setStatus('transactions', 'Unavailable');
    }
  }

  ['gate:site-ready', 'gate:home-board-ready', 'gate:homepage-week-ready'].forEach(evt => document.addEventListener(evt, render));
  window.addEventListener('gate-supabase-ready', loadTransactions);
  if(window.gateSupabase) loadTransactions();
  setTimeout(() => {
    if(txRequested) return;
    setHtml('transactions', unavailable('Transaction feed unavailable here. The full archive is on the Wire.'));
    setStatus('transactions', 'Unavailable');
  }, 12000);
  render();
})();
