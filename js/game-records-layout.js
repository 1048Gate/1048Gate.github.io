(function(){
  const shell=document.querySelector('#history .history-shell');
  if(!shell)return;

  const recordPanel=shell.querySelector('[data-history-panel="records"]');
  if(!recordPanel)return;

  let attempts=0;
  const maxAttempts=40;

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
  }

  relocate();
})();
