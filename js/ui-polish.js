(function(){
  const LABELS={home:'Home',history:'History',playoffs:'Playoffs',members:'Members',board:'Board',votes:'Votes',rules:'Rules'};
  const ORDER=['home','history','playoffs','members','board','votes','rules'];
  function polishTabs(){
    const tabs=document.getElementById('tabs');if(!tabs)return;
    ORDER.forEach(name=>{const btn=tabs.querySelector(`[data-view="${name}"]`);if(btn){btn.textContent=LABELS[name]||btn.textContent;tabs.appendChild(btn)}});
    const active=document.querySelector('.view.active')?.id;
    tabs.querySelectorAll('button[data-view]').forEach(btn=>{const on=btn.dataset.view===active;btn.classList.toggle('active',on);btn.setAttribute('aria-current',on?'page':'false')});
  }
  document.addEventListener('click',event=>{
    const btn=event.target.closest?.('#tabs button[data-view]');if(!btn)return;
    requestAnimationFrame(()=>{document.querySelectorAll('#tabs button[data-view]').forEach(x=>{const on=x===btn;x.classList.toggle('active',on);x.setAttribute('aria-current',on?'page':'false')})});
  });
  function addSectionKickers(){
    document.querySelectorAll('main>.view>.section-title').forEach(title=>{
      if(title.querySelector('.section-kicker'))return;
      const h=title.querySelector('h2');if(!h)return;
      const kicker=document.createElement('span');kicker.className='section-kicker';
      const map={home:'League HQ',board:'Community',votes:'League Decisions',history:'The Archive',playoffs:'Postseason',rules:'League Handbook',members:'The League'};
      kicker.textContent=map[title.closest('.view')?.id]||'1048 Gate';h.insertAdjacentElement('beforebegin',kicker);
    });
  }
  function run(){polishTabs();addSectionKickers()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
  [250,700,1400,2400].forEach(ms=>setTimeout(run,ms));
})();
