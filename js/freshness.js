/* Phase 5 + Week 1: freshness labels, ET clock, last-known-good week cache. */
(function(){
  const WEEK_CACHE_KEY = '1048-gate-current-week-v1';
  const LEAGUE_TZ = 'America/New_York';
  const LIVE_WARNING_MINUTES = 45;
  const LIVE_CRITICAL_MINUTES = 90;

  function validWeek(payload, expected = {}){
    const season=payload?.season;
    const week=payload?.week;
    return !!payload
      && Number.isInteger(season)
      && season > 0
      && Number.isInteger(week)
      && week > 0
      && week <= 25
      && (expected.season == null || season === expected.season)
      && (expected.week == null || week === expected.week)
      && Array.isArray(payload.matchups)
      && payload.matchups.length === 6
      && payload.matchups.every(game=>game && (game.week == null || game.week === week))
      && Array.isArray(payload.standings)
      && payload.standings.length === 12;
  }

  function sourceTime(payload){return payload?.fetchedAt||payload?.last_updated;}
  const sourceMillis=value=>typeof value==='string'&&/(?:Z|[+-]\d{2}:\d{2})$/.test(value)?Date.parse(value):NaN;
  function validScoreboard(payload,expected={}){
    if(!validWeek(payload,expected)||payload.phase!==`Week ${payload.week}`)return false;
    const stamp=sourceMillis(sourceTime(payload));
    if(!Number.isFinite(stamp)||stamp>Date.now()+5*60000)return false;
    const finite=value=>typeof value==='number'&&Number.isFinite(value);
    if(payload.standings.some(row=>!row||typeof row!=='object'))return false;
    const teams=new Map(payload.standings.map(row=>[row.teamId,row]));
    if(teams.size!==12||payload.standings.some(row=>!Number.isInteger(row.teamId)||row.teamId<1||!row.team||!row.owner||['wins','losses','ties'].some(key=>!Number.isInteger(row[key])||row[key]<0)||!finite(row.pointsFor)||!finite(row.pointsAgainst)))return false;
    const seen=new Set();
    for(const game of payload.matchups){
      if(game.week!==payload.week||!['scheduled','live','final'].includes(game.state))return false;
      for(const side of [game.away,game.home]){
        const team=teams.get(side?.teamId);
        if(!team||seen.has(side.teamId)||side.team!==team.team||side.owner!==team.owner||!(finite(side.score)||(side.score===null&&game.state==='scheduled')))return false;
        if(side.projectedScore!=null&&!finite(side.projectedScore))return false;
        seen.add(side.teamId);
      }
    }
    if(payload.teamProjections!=null){
      if(!Array.isArray(payload.teamProjections)||payload.teamProjections.length!==12||payload.teamProjections.some(row=>!row||typeof row!=='object')||new Set(payload.teamProjections.map(row=>row.teamId)).size!==12)return false;
      const projected=new Map(payload.teamProjections.map(row=>[row.teamId,row]));
      if(payload.teamProjections.some(row=>!teams.has(row.teamId)||typeof row.complete!=='boolean'||(row.complete?!finite(row.projectedScore):row.projectedScore!==null)))return false;
      if(payload.matchups.some(game=>[game.away,game.home].some(side=>side.projectedScore!==projected.get(side.teamId).projectedScore)))return false;
    }
    if(payload.projectionsStale===true||payload.teamProjections!=null||payload.projectionsFetchedAt!=null){
      const projectionStamp=sourceMillis(payload.projectionsFetchedAt);
      if(!Number.isFinite(projectionStamp)||projectionStamp>Date.now()+5*60000)return false;
    }
    return seen.size===12;
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
    const freshness=state==='live' ? liveFreshness(iso, now) : state==='upcoming'&&now-Date.parse(iso)>86400000?{level:'warning',ageMinutes:Math.floor((now-Date.parse(iso))/60000)}:{level:'fresh'};
    const stale=freshness.level==='warning'||freshness.level==='critical';
    let text='';
    if(degraded) text=rel?`ESPN scores last updated ${rel} · Feed reconnecting`:'ESPN feed reconnecting';
    else if(!absolute)text=`${source} source time unavailable`;
    else if(stale) text=`${state==='live'?'Live scores delayed':'Schedule snapshot stale'} · Last collection ${rel || clock || 'unavailable'}`;
    else if(state==='live') text=`${source} live · Collected ${rel}`;
    else if(state==='final') text=`Final · ${source} verified · Collected ${absolute}`;
    else if(state==='upcoming') text=`Upcoming · ${source} schedule · Collected ${absolute}`;
    else text=`${source} snapshot · Collected ${absolute}`;
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
    target.classList.toggle('is-live', !!(absolute && state==='live' && !saved && !degraded && !stale));
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
    validScoreboard,
    sourceTime,
    relativeFrom,
    clockLabel,
    dateTimeLabel,
    formatted,
    liveFreshness,
    setTimestamp,
    watchTimestamp,
    saveWeek,
    readWeek
  });
})();
