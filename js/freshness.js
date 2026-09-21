/* Phase 5 + Week 1: freshness labels, ET clock, last-known-good week cache. */
(function(){
  const WEEK_CACHE_KEY = '1048-gate-current-week-v1';
  const LEAGUE_TZ = 'America/New_York';

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

  function setTimestamp(target, {iso, saved = false, source = 'ESPN', status = '', live = false, degraded = false} = {}){
    if(!target) return;
    const rel = relativeFrom(iso);
    const clock = clockLabel(iso);
    const absolute=dateTimeLabel(iso);
    const state=saved?'snapshot':status||(live?'live':'snapshot');
    let text='';
    if(degraded) text=rel?`ESPN scores last updated ${rel} · Feed reconnecting`:'ESPN feed reconnecting';
    else if(state==='live') text=rel?`${source} live · Updated ${rel}`:`${source} live`;
    else if(state==='final') text=absolute?`Final · ${source} verified · ${absolute}`:`Final · ${source} verified`;
    else if(state==='upcoming') text=absolute?`Upcoming · ${source} schedule · ${absolute}`:`Upcoming · ${source} schedule`;
    else text=absolute?`${source} snapshot · ${absolute}`:`${source} snapshot`;
    const appendClock=state==='live'&&clock&&!degraded;
    target.replaceChildren(document.createTextNode(appendClock ? `${text} · ` : text));
    if(iso && appendClock){
      const time = document.createElement('time');
      time.dateTime = iso;
      time.textContent = clock;
      time.title = clock;
      target.append(time);
    }
    target.classList.toggle('is-saved', saved);
    target.classList.toggle('is-live', !!(state==='live' && !saved && !degraded));
    target.classList.toggle('is-final', !!(state==='final' && !degraded));
    target.classList.toggle('is-upcoming', !!(state==='upcoming' && !degraded));
    target.classList.toggle('is-degraded', !!degraded);
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
    validWeek,
    relativeFrom,
    clockLabel,
    dateTimeLabel,
    formatted,
    setTimestamp,
    saveWeek,
    readWeek
  });
})();
