(function(){
  const shell=document.querySelector('#history .history-shell');
  if(!shell||shell.querySelector('[data-history-tab="game-records"]'))return;

  const subnav=shell.querySelector('.history-subnav');
  const panels=shell.querySelector('.history-tab-panels');
  const recordButton=subnav?.querySelector('[data-history-tab="records"]');
  const recordPanel=panels?.querySelector('[data-history-panel="records"]');
  if(!subnav||!panels||!recordButton||!recordPanel)return;

  const button=document.createElement('button');
  button.type='button';
  button.dataset.historyTab='game-records';
  button.textContent='📊 Game Records';
  subnav.insertBefore(button,recordButton);

  const panel=document.createElement('section');
  panel.className='history-tab-panel';
  panel.dataset.historyPanel='game-records';
  panel.innerHTML=`<div class="panel history-content-panel game-records-panel"><div class="history-section-head"><div><span>GAME RECORDS</span><h3>Single-Game Extremes</h3></div></div><div class="game-records-host"><div class="history-loading">Loading game records…</div></div></div>`;
  panels.insertBefore(panel,recordPanel);

  const host=panel.querySelector('.game-records-host');

  function activate(){
    shell.querySelectorAll('[data-history-tab]').forEach(item=>item.classList.toggle('active',item.dataset.historyTab==='game-records'));
    shell.querySelectorAll('[data-history-panel]').forEach(item=>item.classList.toggle('active',item.dataset.historyPanel==='game-records'));
  }
  button.addEventListener('click',activate);

  function relocate(){
    const grid=shell.querySelector('.matchup-record-grid');
    if(!grid||grid.parentElement===host)return;
    host.innerHTML='';
    host.appendChild(grid);
  }

  relocate();
  const observer=new MutationObserver(relocate);
  observer.observe(shell,{childList:true,subtree:true});
})();
