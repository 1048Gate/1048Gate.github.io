(function(){
  const shell=document.querySelector('#history .history-shell');
  if(!shell)return;

  const recordPanel=shell.querySelector('[data-history-panel="records"]');
  if(!recordPanel)return;

  const {escapeHtml:esc}=window.gateShared;
  let attempts=0;
  const maxAttempts=40;

  async function addStreakCard(grid){
    if(grid.querySelector('[data-record="longest-losing-streak"]'))return;
    try{
      const response=await fetch('data/streaks.json',{cache:'no-store'});
      if(!response.ok)return;
      const data=await response.json();
      const streak=data.longestLosingStreak;
      if(!streak)return;
      const postseason=streak.includesPostseason?' · Includes postseason':'';
      grid.insertAdjacentHTML('beforeend',`<article class="matchup-record-card" data-record="longest-losing-streak"><span>Longest Losing Streak</span><strong>${esc(streak.losses)} straight — ${esc(streak.manager)}</strong><small>${esc(streak.team)} · ${esc(streak.season)} W${esc(streak.startWeek)}–W${esc(streak.endWeek)}${esc(postseason)}</small></article>`);
    }catch(error){
      console.error('Unable to load streak record:',error);
    }
  }

  function relocate(){
    const derivedGrid=shell.querySelector('.matchup-record-grid');
    if(!derivedGrid){
      attempts++;
      if(attempts<maxAttempts)setTimeout(relocate,100);
      return;
    }

    const oldRecordGrid=recordPanel.querySelector('.record-grid');
    if(oldRecordGrid)oldRecordGrid.remove();

    if(derivedGrid.parentElement!==recordPanel){
      const heading=recordPanel.querySelector('.history-section-head');
      if(heading)heading.insertAdjacentElement('afterend',derivedGrid);
      else recordPanel.prepend(derivedGrid);
    }

    addStreakCard(derivedGrid);
  }

  relocate();
})();
