/* Phase 5: shared freshness labels and a last-known-good current-week cache. */
(function(){
  const WEEK_CACHE_KEY = '1048-gate-current-week-v1';

  function validWeek(payload){
    return !!payload
      && Number.isInteger(Number(payload.season))
      && Number.isInteger(Number(payload.week))
      && Array.isArray(payload.matchups)
      && payload.matchups.length > 0
      && Array.isArray(payload.standings)
      && payload.standings.length > 0;
  }

  function formatted(iso){
    if(!iso) return '';
    const date = new Date(iso);
    if(Number.isNaN(date.getTime())) return '';
    return date.toLocaleString(undefined, {
      month:'short', day:'numeric', hour:'numeric', minute:'2-digit'
    });
  }

  function setTimestamp(target, {iso, saved = false, source = 'ESPN snapshot'} = {}){
    if(!target) return;
    const label = formatted(iso);
    const prefix = saved ? 'Saved snapshot' : source;
    target.replaceChildren(document.createTextNode(label ? `${prefix} · Updated ` : prefix));
    if(label){
      const time = document.createElement('time');
      time.dateTime = iso;
      time.textContent = label;
      time.title = new Date(iso).toLocaleString();
      target.append(time);
    }
    target.classList.toggle('is-saved', saved);
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

  window.gateFreshness = Object.freeze({WEEK_CACHE_KEY, validWeek, formatted, setTimestamp, saveWeek, readWeek});
})();
