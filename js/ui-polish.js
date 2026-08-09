(function(){
  const LABELS={home:'Home',history:'History',playoffs:'Playoffs',members:'Members',board:'Board',votes:'Votes',rules:'Rules'};
  const ORDER=['home','history','playoffs','members','board','votes','rules'];
  function ensureFinalCss(){
    let link=document.querySelector('link[data-gate-polish-final]');
    if(!link){link=document.createElement('link');link.rel='stylesheet';link.href='css/polish-final.css';link.dataset.gatePolishFinal='true'}
    document.head.appendChild(link);
  }
  function fixFoundingYear(){
    document.querySelectorAll('.brand-text .tag,.hero .eyebrow').forEach(node=>{
      node.textContent=node.textContent.replace('EST. 2016','EST. 2017');
    });
  }
  function polishTabs(){
    const tabs=document.getElementById('tabs');if(!tabs)return;
    ORDER.forEach(name=>{const btn=tabs.querySelector(`[data-view="${name}"]`);if(btn){btn.textContent=LABELS[name]||btn.textContent;tabs.appendChild(btn)}});
    const active=document.querySelector('.view.active')?.id;
    tabs.querySelectorAll('button[data-view]').forEach(btn=>{
      const target=document.getElementById(btn.dataset.view);
      btn.hidden=!target;
      const on=Boolean(target)&&btn.dataset.view===active;
      btn.classList.toggle('active',on);
      btn.setAttribute('aria-current',on?'page':'false');
    });
  }
  function ensurePlayoffsQuickCard(){
    const playoffs=document.getElementById('playoffs');
    const grid=document.querySelector('#home .quick-grid');
    if(!playoffs||!grid||grid.querySelector('[data-quick-view="playoffs"]'))return;
    const card=document.createElement('div');
    card.className='quick-card';
    card.dataset.quickView='playoffs';
    card.tabIndex=0;
    card.innerHTML='<div class="num">06</div><h3>Playoffs</h3><p>Browse postseason brackets, champions, seeds, and consolation history.</p>';
    const open=()=>{window.switchView?.('playoffs');requestAnimationFrame(polishTabs)};
    card.addEventListener('click',open);
    card.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open()}});
    grid.appendChild(card);
  }
  document.addEventListener('click',event=>{
    const btn=event.target.closest?.('#tabs button[data-view]');
    if(btn)requestAnimationFrame(()=>{document.querySelectorAll('#tabs button[data-view]').forEach(x=>{const on=x===btn;x.classList.toggle('active',on);x.setAttribute('aria-current',on?'page':'false')})});
    setTimeout(ensureFinalCss,80);
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
  function run(){fixFoundingYear();polishTabs();addSectionKickers();ensurePlayoffsQuickCard();ensureFinalCss()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
  [250,700,1400,2400,4000,6000].forEach(ms=>setTimeout(run,ms));
})();
