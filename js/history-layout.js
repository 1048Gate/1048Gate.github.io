(function(){
  const history=document.getElementById('history');
  if(!history||history.dataset.historyLayout==='ready')return;
  history.dataset.historyLayout='ready';

  if(!document.querySelector('link[href="css/history.css"]')){
    const css=document.createElement('link');
    css.rel='stylesheet';
    css.href='css/history.css';
    document.head.appendChild(css);
  }

  const title=history.querySelector('.section-title');
  const timeline=history.querySelector('.timeline');
  const recordGrid=history.querySelector('.record-grid');
  const shame=history.querySelector('.shame');
  if(!timeline||!recordGrid||!shame)return;

  const championsPanel=timeline.closest('.panel')||timeline.parentElement;
  const recordsPanel=recordGrid.closest('.panel')||recordGrid.parentElement;
  const shamePanel=shame.closest('.panel')||shame.parentElement;

  const shell=document.createElement('div');
  shell.className='history-shell';
  shell.innerHTML=`
    <div class="history-intro">
      <div>
        <span class="history-eyebrow">1048 ARCHIVES</span>
        <h3>Ten seasons of league lore</h3>
        <p>Browse champions, all-time records, and the moments nobody is allowed to forget.</p>
      </div>
    </div>
    <div class="history-subnav" role="tablist" aria-label="League history sections">
      <button class="active" type="button" data-history-tab="champions">🏆 Champions</button>
      <button type="button" data-history-tab="records">📖 Record Book</button>
      <button type="button" data-history-tab="shame">💩 Wall of Shame</button>
    </div>
    <div class="history-tab-panels">
      <section class="history-tab-panel active" data-history-panel="champions"></section>
      <section class="history-tab-panel" data-history-panel="records"></section>
      <section class="history-tab-panel" data-history-panel="shame"></section>
    </div>`;

  if(title)title.insertAdjacentElement('afterend',shell);else history.prepend(shell);

  const champHost=shell.querySelector('[data-history-panel="champions"]');
  const recordHost=shell.querySelector('[data-history-panel="records"]');
  const shameHost=shell.querySelector('[data-history-panel="shame"]');

  championsPanel.classList.add('history-content-panel');
  recordsPanel.classList.add('history-content-panel');
  shamePanel.classList.add('history-content-panel');

  champHost.appendChild(championsPanel);
  recordHost.appendChild(recordsPanel);
  shameHost.appendChild(shamePanel);

  const cleanHeading=(panel,label,sub)=>{
    const old=panel.querySelector(':scope > h3');
    if(old)old.remove();
    const head=document.createElement('div');
    head.className='history-section-head';
    head.innerHTML=`<div><span>${label}</span><h3>${sub}</h3></div>`;
    panel.prepend(head);
  };
  cleanHeading(championsPanel,'CHAMPIONSHIP ARCHIVE','Champions Through the Years');
  cleanHeading(recordsPanel,'LEAGUE RECORD BOOK','Records & Milestones');
  cleanHeading(shamePanel,'HALL OF MISFORTUNE','Wall of Shame');

  function activate(name){
    shell.querySelectorAll('[data-history-tab]').forEach(b=>b.classList.toggle('active',b.dataset.historyTab===name));
    shell.querySelectorAll('[data-history-panel]').forEach(p=>p.classList.toggle('active',p.dataset.historyPanel===name));
  }
  shell.querySelectorAll('[data-history-tab]').forEach(btn=>btn.addEventListener('click',()=>activate(btn.dataset.historyTab)));

  const observer=new MutationObserver(()=>{
    const shameTimeline=document.getElementById('shameTimeline');
    if(shameTimeline&&shameTimeline.parentElement!==shamePanel)shamePanel.appendChild(shameTimeline);
  });
  observer.observe(history,{childList:true,subtree:true});
})();