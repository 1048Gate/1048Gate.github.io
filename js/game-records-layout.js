(function(){
  const shell=document.querySelector('#history .history-shell');
  if(!shell)return;

  const recordPanel=shell.querySelector('[data-history-panel="records"]');
  if(!recordPanel)return;

  const {escapeHtml:esc,formatNumber}=window.gateShared;
  let attempts=0;
  const maxAttempts=40;
  let streakPromise=null;
  let fallbackPromise=null;

  function cmsBook(){
    return recordPanel.querySelector('[data-record-book="cms"]');
  }

  function removeTransientGrids(){
    recordPanel.querySelectorAll('[data-record-grid="placeholder"],[data-record-grid="fallback"]').forEach(node=>node.remove());
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

  function buildDerivedGrid(data){
    const records=data.records||{};
    const num=value=>formatNumber(value,1,2);
    const cards=[
      ['Highest Score',records.highestScore, r=>`${num(r[0])} — ${r[1]}`,r=>`${r[2]} vs ${r[3]} · ${r[5]} W${r[6]}`],
      ['Lowest Score',records.lowestScore,r=>`${num(r[0])} — ${r[1]}`,r=>`${r[2]} vs ${r[3]} · ${r[5]} W${r[6]}${r[7]?' · Playoffs':''}`],
      ['Biggest Blowout',records.biggestBlowout,r=>`${num(r[0])} pts`,r=>`${r[1]} ${num(r[2])} – ${r[3]} ${num(r[4])} · ${r[5]} W${r[6]}`],
      ['Closest Game',records.closestGame,r=>`${num(r[0])} pts`,r=>`${r[1]} ${num(r[2])} – ${r[3]} ${num(r[4])} · ${r[5]} W${r[6]}`],
      ['Highest Combined',records.highestCombined,r=>`${num(r[0])} pts`,r=>`${r[1]} ${num(r[2])} + ${r[3]} ${num(r[4])} · ${r[5]} W${r[6]}`]
    ];
    const grid=document.createElement('div');
    grid.className='matchup-record-grid';
    grid.dataset.recordGrid='fallback';
    grid.innerHTML=cards.map(([label,r,value,sub])=>r?`<article class="matchup-record-card"><span>${label}</span><strong>${esc(value(r))}</strong><small>${esc(sub(r))}</small></article>`:'').join('');
    return grid;
  }

  function installFallback(){
    if(recordPanel.querySelector('[data-record-grid="fallback"]'))return;
    removeTransientGrids();
    fallbackPromise=fallbackPromise||fetch('data/matchups.json',{cache:'no-store'}).then(response=>{
      if(!response.ok)throw new Error(`matchups.json returned HTTP ${response.status}`);
      return response.json();
    }).catch(error=>{
      console.error('Unable to load matchup records:',error);
      return null;
    });
    fallbackPromise.then(data=>{
      if(recordPanel.querySelector('[data-record-grid="fallback"]'))return;
      if(!data){
        if(!recordPanel.querySelector('[data-record-grid="placeholder"]')){
          const placeholder=document.createElement('div');
          placeholder.className='record-grid';
          placeholder.dataset.recordGrid='placeholder';
          placeholder.innerHTML='<div class="history-loading">Record book could not be loaded.</div>';
          const heading=recordPanel.querySelector('.history-section-head');
          if(heading)heading.insertAdjacentElement('afterend',placeholder);
          else recordPanel.prepend(placeholder);
        }
        return;
      }
      const grid=buildDerivedGrid(data);
      if(!grid.innerHTML.trim())return;
      const heading=recordPanel.querySelector('.history-section-head');
      if(heading)heading.insertAdjacentElement('afterend',grid);
      else recordPanel.prepend(grid);
      addStreakCard(grid);
    });
  }

  function settle(){
    const state=window.gateCmsRecords;
    if(state==='rendered'){
      removeTransientGrids();
      addStreakCard(cmsBook());
      return;
    }
    if(state==='absent'){
      installFallback();
      return;
    }
    if(++attempts<maxAttempts){
      setTimeout(settle,100);
      return;
    }
    installFallback();
  }

  settle();

  const observer=new MutationObserver(()=>{
    const book=cmsBook();
    if(!book)return;
    removeTransientGrids();
    addStreakCard(book);
  });
  observer.observe(recordPanel,{childList:true,subtree:true});
})();
