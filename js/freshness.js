/* Phase 5 + Week 1: freshness labels, ET clock, last-known-good week cache. */
(function(){
  const WEEK_CACHE_KEY = '1048-gate-current-week-v1';
  const LEAGUE_TZ = 'America/New_York';
  const LIVE_WARNING_MINUTES = 45;
  const LIVE_CRITICAL_MINUTES = 90;

  function validWeek(payload){
    const season=payload?.season;
    const week=payload?.week;
    return !!payload
      && Number.isInteger(season)
      && season > 0
      && Number.isInteger(week)
      && week > 0
      && Array.isArray(payload.matchups)
      && payload.matchups.length === 6
      && Array.isArray(payload.standings)
      && payload.standings.length === 12;
  }

  function relativeFrom(iso, now = Date.now()){
    if(!iso) return '';
    const date = new Date(iso);
    if(Number.isNaN(date.getTime())) return '';
    const seconds = Math.max(0, Math.floor((now - date.getTime()) / 1000));
    if(seconds < 10) return 'just now';
    if(seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if(minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if(hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  function clockLabel(iso){
    if(!iso) return '';
    const date = new Date(iso);
    if(Number.isNaN(date.getTime())) return '';
    const clock = date.toLocaleString('en-US', {
      timeZone: LEAGUE_TZ,
      hour: 'numeric',
      minute: '2-digit'
    });
    return `${clock} ET`;
  }

  function dateTimeLabel(iso){
    if(!iso) return '';
    const date = new Date(iso);
    if(Number.isNaN(date.getTime())) return '';
    const label=date.toLocaleString('en-US',{
      timeZone:LEAGUE_TZ,
      month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'
    });
    return `${label.replace(/, (?=\d{1,2}:\d{2})/,' at ')} ET`;
  }

  function formatted(iso){
    const rel = relativeFrom(iso);
    const clock = clockLabel(iso);
    if(rel && clock) return `${rel} (${clock})`;
    return rel || clock;
  }

  function sourceLabel({source='1048 Gate', state='snapshot', iso='', detail=''} = {}){
    const time = dateTimeLabel(iso);
    const suffix = detail ? ` · ${detail}` : '';
    if(state === 'live') return `${source} · Live${time ? ` · Updated ${time}` : ''}${suffix}`;
    if(state === 'final') return `${source} · Verified final${time ? ` · ${time}` : ''}${suffix}`;
    if(state === 'upcoming') return `${source} · Upcoming${time ? ` · ${time}` : ''}${suffix}`;
    if(state === 'archive') return `${source} · Verified archive${suffix}`;
    return `${source} · Saved snapshot${time ? ` · ${time}` : ''}${suffix}`;
  }

  function setSourceLabel(target, options = {}){
    if(!target) return;
    const state = options.state || 'snapshot';
    target.textContent = sourceLabel(options);
    target.classList.toggle('is-live', state === 'live');
    target.classList.toggle('is-final', state === 'final');
    target.classList.toggle('is-upcoming', state === 'upcoming');
    target.classList.toggle('is-saved', state === 'snapshot');
    target.dataset.sourceState = state;
  }

  function liveFreshness(iso, now = Date.now()){
    const fetchedAt = new Date(iso || '').getTime();
    if(!Number.isFinite(fetchedAt)) return {level:'unknown', ageMinutes:null};
    const ageMinutes = Math.max(0, Math.floor((now - fetchedAt) / 60000));
    if(ageMinutes >= LIVE_CRITICAL_MINUTES) return {level:'critical', ageMinutes};
    if(ageMinutes >= LIVE_WARNING_MINUTES) return {level:'warning', ageMinutes};
    return {level:'fresh', ageMinutes};
  }

  function setTimestamp(target, {iso, saved = false, source = 'ESPN', status = '', live = false, degraded = false, now = Date.now()} = {}){
    if(!target) return;
    const rel = relativeFrom(iso, now);
    const clock = clockLabel(iso);
    const absolute=dateTimeLabel(iso);
    const state=saved?'snapshot':status||(live?'live':'snapshot');
    const freshness=state==='live' ? liveFreshness(iso, now) : {level:'fresh'};
    const stale=freshness.level==='warning'||freshness.level==='critical';
    let text='';
    if(degraded) text=rel?`ESPN scores last updated ${rel} · Feed reconnecting`:'ESPN feed reconnecting';
    else if(stale) text=`Live scores delayed · Last snapshot ${rel || clock || 'unavailable'}`;
    else if(state==='live') text=rel?`${source} live · Updated ${rel}`:`${source} live`;
    else if(state==='final') text=absolute?`Final · ${source} verified · ${absolute}`:`Final · ${source} verified`;
    else if(state==='upcoming') text=absolute?`Upcoming · ${source} schedule · ${absolute}`:`Upcoming · ${source} schedule`;
    else text=absolute?`${source} snapshot · ${absolute}`:`${source} snapshot`;
    const appendClock=state==='live'&&clock&&!degraded&&!stale;
    target.replaceChildren(document.createTextNode(appendClock ? `${text} · ` : text));
    if(iso && appendClock){
      const time = document.createElement('time');
      time.dateTime = iso;
      time.textContent = clock;
      time.title = clock;
      target.append(time);
    }
    target.classList.toggle('is-saved', saved);
    target.classList.toggle('is-live', !!(state==='live' && !saved && !degraded && !stale));
    target.classList.toggle('is-final', !!(state==='final' && !degraded));
    target.classList.toggle('is-upcoming', !!(state==='upcoming' && !degraded));
    target.classList.toggle('is-degraded', !!degraded);
    target.classList.toggle('is-stale-warning', freshness.level==='warning');
    target.classList.toggle('is-stale-critical', freshness.level==='critical');
    if(stale) target.setAttribute?.('title', `Scores are ${freshness.ageMinutes} minutes old. The last saved scores remain visible.`);
    else target.removeAttribute?.('title');
  }

  function watchTimestamp(target, options, intervalMs = 60000){
    if(!target) return () => {};
    setTimestamp(target, options);
    const timer=window.setInterval?.(()=>setTimestamp(target, options), intervalMs);
    return ()=>window.clearInterval?.(timer);
  }

  function saveWeek(payload, storage = window.localStorage){
    if(!validWeek(payload)) return false;
    try{
      storage.setItem(WEEK_CACHE_KEY, JSON.stringify({savedAt:new Date().toISOString(), payload}));
      return true;
    }catch{return false;}
  }

  function readWeek(expected = {}, storage = window.localStorage){
    try{
      const cached = JSON.parse(storage.getItem(WEEK_CACHE_KEY) || 'null');
      const payload=cached?.payload;
      if(!validWeek(payload)) return null;
      if(expected.season != null && Number(payload.season)!==Number(expected.season)) return null;
      if(expected.week != null && Number(payload.week)!==Number(expected.week)) return null;
      return payload;
    }catch{return null;}
  }

  window.gateFreshness = Object.freeze({
    WEEK_CACHE_KEY,
    LEAGUE_TZ,
    LIVE_WARNING_MINUTES,
    LIVE_CRITICAL_MINUTES,
    validWeek,
    relativeFrom,
    clockLabel,
    dateTimeLabel,
    formatted,
    sourceLabel,
    setSourceLabel,
    liveFreshness,
    setTimestamp,
    watchTimestamp,
    saveWeek,
    readWeek
  });
})();
