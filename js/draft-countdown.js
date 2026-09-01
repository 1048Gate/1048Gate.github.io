(() => {
  'use strict';

  const FALLBACK_START = '2026-09-01T00:00:00Z';
  const root = document.querySelector('[data-draft-countdown]');
  if (!root) return;

  const night = document.querySelector('[data-draft-night]');
  const days = root.querySelector('[data-countdown-days]');
  const hours = root.querySelector('[data-countdown-hours]');
  const minutes = root.querySelector('[data-countdown-minutes]');
  const seconds = root.querySelector('[data-countdown-seconds]');
  const status = root.querySelector('[data-countdown-status]');
  const heading = root.querySelector('#draftCountdownHeading');
  const controls = document.querySelector('[data-draft-controls]');
  const boardMeta = document.querySelector('[data-draft-board-meta]');
  const noteBody = document.querySelector('[data-draft-note-body]');
  const noteWhere = document.querySelector('[data-draft-note-where]');

  let start = new Date(root.dataset.draftStart || FALLBACK_START);
  let currentPick = 1;
  let pickCount = 12;
  let timer = null;
  let channel = null;
  let staff = false;
  let complete = false;

  const formatUnit = value => String(Math.max(0, value)).padStart(2, '0');

  function paintBoard(){
    document.querySelectorAll('[data-draft-pick]').forEach(card => {
      const pick = Number(card.dataset.draftPick);
      const onClock = !complete && pick === currentPick;
      card.classList.toggle('is-on-clock', onClock);
      let badge = card.querySelector('.draft-clock-badge');
      if(onClock && !badge){
        badge = document.createElement('span');
        badge.className = 'draft-clock-badge';
        badge.textContent = 'On the clock';
        card.appendChild(badge);
      }else if(!onClock && badge && !badge.classList.contains('is-keeper')){
        badge.remove();
      }
    });
    if(boardMeta){
      if(complete){
        boardMeta.textContent = 'First-round recap';
      }else{
        const onCard = document.querySelector('[data-draft-pick].is-on-clock .draft-pick-meta strong');
        boardMeta.textContent = onCard ? `Pick ${currentPick} · ${onCard.textContent}` : `Pick ${currentPick}`;
      }
    }
  }

  function setPick(pick, {broadcast = true} = {}){
    const next = Math.min(Math.max(1, Number(pick) || 1), pickCount);
    currentPick = next;
    paintBoard();
    if(broadcast && channel){
      channel.send({type:'broadcast', event:'pick', payload:{pick:currentPick}});
    }
  }

  function applyNote(config){
    const draft = config?.draftNight || {};
    if(noteBody && draft.note) noteBody.textContent = draft.note;
    if(noteWhere && draft.where) noteWhere.textContent = draft.where;
  }

  function applyConfig(config){
    const draft = config?.draftNight || {};
    complete = draft.status === 'complete';
    if(draft.startsAt){
      const parsed = new Date(draft.startsAt);
      if(!Number.isNaN(parsed.getTime())) start = parsed;
    }
    pickCount = Math.max(1, (config?.draftOrder || []).length || pickCount);
    currentPick = Math.min(Math.max(1, Number(draft.currentPick) || currentPick), pickCount);
    applyNote(config);
    paintBoard();
    update();
  }

  function update(){
    if(Number.isNaN(start.getTime())) return;
    if(complete){
      if(days) days.textContent = '00';
      if(hours) hours.textContent = '00';
      if(minutes) minutes.textContent = '00';
      if(seconds) seconds.textContent = '00';
      if(status) status.textContent = '192 picks are locked. Odds are live off the rosters.';
      if(heading) heading.textContent = 'The draft is in the books.';
      root.dataset.countdownState = 'complete';
      night?.setAttribute('data-draft-state', 'complete');
      paintBoard();
      window.clearInterval(timer);
      return;
    }
    const remaining = start.getTime() - Date.now();
    const live = remaining <= 0;

    if(live){
      if(days) days.textContent = '00';
      if(hours) hours.textContent = '00';
      if(minutes) minutes.textContent = '00';
      if(seconds) seconds.textContent = '00';
      if(status) status.textContent = 'The board is live. Follow the pick and stay in the ESPN lobby.';
      if(heading) heading.textContent = 'Draft night is here.';
      root.dataset.countdownState = 'live';
      night?.setAttribute('data-draft-state', 'live');
    }else{
      const totalSeconds = Math.floor(remaining / 1000);
      const dayCount = Math.floor(totalSeconds / 86400);
      const hourCount = Math.floor((totalSeconds % 86400) / 3600);
      const minuteCount = Math.floor((totalSeconds % 3600) / 60);
      const secondCount = totalSeconds % 60;
      if(days) days.textContent = formatUnit(dayCount);
      if(hours) hours.textContent = formatUnit(hourCount);
      if(minutes) minutes.textContent = formatUnit(minuteCount);
      if(seconds) seconds.textContent = formatUnit(secondCount);
      if(status) status.textContent = dayCount === 0 ? 'Clock is running in Eastern Time.' : 'Countdown runs in Eastern Time.';
      if(heading) heading.textContent = dayCount === 0 ? 'Draft night is tonight.' : 'Draft night is almost here.';
      root.dataset.countdownState = dayCount === 0 ? 'soon' : 'upcoming';
      night?.setAttribute('data-draft-state', dayCount === 0 ? 'soon' : 'upcoming');
    }

    paintBoard();
    const interval = live ? 30000 : 1000;
    window.clearInterval(timer);
    timer = window.setInterval(update, interval);
  }

  function showStaffControls(isStaff){
    staff = Boolean(isStaff);
    if(controls) controls.hidden = !staff;
  }

  controls?.addEventListener('click', event => {
    if(event.target.closest('[data-draft-next]')) setPick(currentPick + 1);
    if(event.target.closest('[data-draft-prev]')) setPick(currentPick - 1);
  });

  window.addEventListener('gate:site-ready', event => applyConfig(event.detail || {}));
  if(window.gateSiteConfig) applyConfig(window.gateSiteConfig);
  window.addEventListener('gate-auth-changed', event => {
    const role = event.detail?.profile?.role;
    showStaffControls(role === 'site_admin' || role === 'commissioner');
  });

  async function connectBroadcast(){
    const supabase = window.gateSupabase || await (window.gateSupabaseReady || Promise.resolve(null));
    if(!supabase?.channel) return;
    channel = supabase.channel('1048-draft-night');
    channel.on('broadcast', {event:'pick'}, ({payload}) => {
      if(payload?.pick) setPick(payload.pick, {broadcast:false});
    });
    channel.subscribe();
  }

  window.gateDraftNight = {
    getPick: () => currentPick,
    setPick,
    paintBoard
  };

  paintBoard();
  update();
  connectBroadcast();
})();
