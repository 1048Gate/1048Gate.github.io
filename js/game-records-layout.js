(function(){
  const shell=document.querySelector('#history .history-shell');
  if(!shell)return;

  const recordPanel=shell.querySelector('[data-history-panel="records"]');
  if(!recordPanel)return;

  function relocate(){
    const derivedGrid=shell.querySelector('.matchup-record-grid');
    if(!derivedGrid)return;

    const oldRecordGrid=recordPanel.querySelector('.record-grid');
    if(oldRecordGrid)oldRecordGrid.remove();

    if(derivedGrid.parentElement!==recordPanel){
      const heading=recordPanel.querySelector('.history-section-head');
      if(heading)heading.insertAdjacentElement('afterend',derivedGrid);
      else recordPanel.prepend(derivedGrid);
    }
  }

  relocate();
  const observer=new MutationObserver(relocate);
  observer.observe(shell,{childList:true,subtree:true});
})();
