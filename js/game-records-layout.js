(function(){
  const shell=document.querySelector('#history .history-shell');
  if(!shell)return;

  const recordPanel=shell.querySelector('[data-history-panel="records"]');
  if(!recordPanel)return;

  const {escapeHtml:esc}=window.gateShared;
  let attempts=0;
  const maxAttempts=40;
  let derivedGrid=null;
  let streakPromise=null;

  function cmsBook(){
    return recordPanel.querySelector('[data-record-book="cms"]');
  }

  function removePlaceholders(){
    recordPanel.querySelectorAll('[data-record-grid="placeholder"]').forEach(node=>node.remove());
  }

  function addStreakCard(grid){
    if(!grid||grid.querySelector('[data-record="longest-losing-streak"]'))return;
    streakPromise=streakPromise||fetch('data/streaks.json',{cache:'no-store'}).then(response=>{
      if(!response.ok)throw new Error(`streaks.json returned HTTP ${response.status}`);
      return response.json();
    }).catch(error=>{
      console.error('Unable to load streak record:',error);
      return null;
    });
    streakPromise.then(data=>{
      if(!data||grid.querySelector('[data-record="longest-losing-streak"]'))return;
      const streak=data.longestLosingStreak;
      if(!streak)return;
      const postseason=streak.includesPostseason?' · Includes postseason':'';
      grid.insertAdjacentHTML('beforeend',`<article class="matchup-record-card" data-record="longest-losing-streak"><span>Longest Losing Streak</span><strong>${esc(streak.losses)} straight — ${esc(streak.manager)}</strong><small>${esc(streak.team)} · ${esc(streak.season)} W${esc(streak.startWeek)}–W${esc(streak.endWeek)}${esc(postseason)}</small></article>`);
    });
  }

  function ensureFallback(){
    if(cmsBook())return;
    removePlaceholders();
    if(derivedGrid&&derivedGrid.parentElement!==recordPanel){
      const heading=recordPanel.querySelector('.history-section-head');
      if(heading)heading.insertAdjacentElement('afterend',derivedGrid);
      else recordPanel.prepend(derivedGrid);
    }
    addStreakCard(derivedGrid);
  }

  function settle(){
    const state=window.gateCmsRecords;
    if(state==='rendered'){
      removePlaceholders();
      addStreakCard(cmsBook());
      return;
    }
    if(state==='absent'){
      ensureFallback();
      return;
    }
    if(++attempts<maxAttempts){
      setTimeout(settle,100);
      return;
    }
    ensureFallback();
  }

  function onDerived(){
    const grid=shell.querySelector('.matchup-record-grid');
    if(!grid){
      if(++attempts<maxAttempts)setTimeout(onDerived,100);
      return;
    }
    derivedGrid=grid;
    attempts=0;
    settle();
  }

  onDerived();

  const observer=new MutationObserver(()=>{
    const book=cmsBook();
    if(!book)return;
    removePlaceholders();
    if(derivedGrid&&recordPanel.contains(derivedGrid)){
      const matchupPanel=shell.querySelector('[data-history-panel="matchups"]');
      if(matchupPanel){
        const h2h=matchupPanel.querySelector('.h2h-builder');
        if(h2h)h2h.insertAdjacentElement('beforebegin',derivedGrid);
        else matchupPanel.appendChild(derivedGrid);
      }
    }
    addStreakCard(book);
  });
  observer.observe(recordPanel,{childList:true,subtree:true});
})();
