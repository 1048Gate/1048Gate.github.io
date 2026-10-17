/* Public JSON only: independent Response bodies, shared in-flight work, bounded archive cache. */
(function(){
  const requests=new Map();
  const ARCHIVE_TTL=5*60*1000;
  const archive=/^\/data\/(?:seasons|members|matchups|playoffs|streaks|champion-notes|manager-profiles|intelligence|drafts\/index|drafts\/\d{4}|players\/index|players\/\d{4})\.json$/;
  function keyFor(path){return new URL(path,document.baseURI).href;}
  function invalidate(path){
    if(path==null){for(const entry of requests.values())entry.invalidated=true;requests.clear();}
    else{const key=keyFor(path);if(requests.has(key))requests.get(key).invalidated=true;requests.delete(key);}
  }
  async function load(path,options={}){
    const key=keyFor(path),url=new URL(key);
    // Keep authenticated, non-GET and signal-specific requests independent.
    if(url.origin!==window.location.origin||!url.pathname.startsWith('/data/')||!url.pathname.endsWith('.json')||options.signal||options.headers||options.credentials||options.method&&options.method!=='GET')return fetch(path,options);
    const previous=requests.get(key);
    if(previous&&(previous.pending||previous.expires>Date.now())){
      const response=await previous.promise;
      if(previous.invalidated){const error=new Error('Data request superseded');error.name='AbortError';throw error;}
      return response.clone();
    }
    const entry={pending:true,expires:0,promise:null};
    if(previous)previous.invalidated=true;
    requests.set(key,entry);
    entry.promise=(async()=>{
      try{
        const response=await fetch(key,{...options,cache:'no-store'});
        if(response.ok)await response.clone().json(); // malformed JSON must never enter the cache
        if(requests.get(key)!==entry){const error=new Error('Data request superseded');error.name='AbortError';throw error;}
        entry.pending=false;
        entry.expires=response.ok&&archive.test(url.pathname)?Date.now()+ARCHIVE_TTL:0;
        if(!entry.expires)requests.delete(key);
        return response;
      }catch(error){if(requests.get(key)===entry)requests.delete(key);throw error;}
    })();
    return (await entry.promise).clone();
  }
  window.gateData=Object.freeze({fetch:load,invalidate});
})();
