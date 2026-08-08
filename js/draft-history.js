(function(){
  const shell=document.querySelector('#history .history-shell');
  if(!shell||shell.querySelector('[data-history-tab="drafts"]'))return;
  if(!document.querySelector('link[href="css/drafts.css"]')){const css=document.createElement('link');css.rel='stylesheet';css.href='css/drafts.css';document.head.appendChild(css)}
  const subnav=shell.querySelector('.history-subnav'),panels=shell.querySelector('.history-tab-panels'),recordBtn=subnav?.querySelector('[data-history-tab="records"]');
  if(!subnav||!panels)return;
  const btn=document.createElement('button');btn.type='button';btn.dataset.historyTab='drafts';btn.textContent='📝 Drafts';
  if(recordBtn)subnav.insertBefore(btn,recordBtn);else subnav.appendChild(btn);
  const panel=document.createElement('section');panel.className='history-tab-panel';panel.dataset.historyPanel='drafts';panel.innerHTML='<div class="panel history-content-panel draft-archive-panel"><div class="history-loading">Loading draft archive…</div></div>';
  const recordPanel=panels.querySelector('[data-history-panel="records"]');if(recordPanel)panels.insertBefore(panel,recordPanel);else panels.appendChild(panel);
  function activate(){shell.querySelectorAll('[data-history-tab]').forEach(x=>x.classList.toggle('active',x===btn));shell.querySelectorAll('[data-history-panel]').forEach(x=>x.classList.toggle('active',x===panel))}
  btn.addEventListener('click',activate);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  fetch('data/drafts.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(`drafts.json returned HTTP ${r.status}`);return r.json()}).then(data=>{
    const seasons=[...(data.seasons||[])].sort((a,b)=>b[0]-a[0]);if(!seasons.length)throw new Error('No draft seasons found');
    panel.innerHTML='<div class="panel history-content-panel draft-archive-panel"><div class="history-section-head"><div><span>DRAFT ARCHIVE</span><h3>Draft History</h3></div><small>'+Number(data.totalPicks||0).toLocaleString()+' picks on file</small></div><div class="draft-year-nav"></div><div class="draft-detail"></div></div>';
    const nav=panel.querySelector('.draft-year-nav'),detail=panel.querySelector('.draft-detail');
    nav.innerHTML=seasons.map((s,i)=>`<button type="button" class="${i===0?'active':''}" data-draft-year="${s[0]}">${s[0]}</button>`).join('');
    function renderYear(year){
      const season=seasons.find(s=>Number(s[0])===Number(year));if(!season)return;const [y,league,keeperCount,teams,picks]=season;
      nav.querySelectorAll('button').forEach(x=>x.classList.toggle('active',Number(x.dataset.draftYear)===Number(y)));
      const ownerFor=p=>teams[p[1]]?.[1]||'Unknown',teamFor=p=>teams[p[1]]?.[0]||'Unknown';const owners=[...new Set(picks.map(ownerFor))].sort((a,b)=>a.localeCompare(b));const top=picks[0];
      detail.innerHTML=`<div class="draft-summary"><div><span class="season-label">${esc(league)}</span><h4>${y} Draft</h4></div><div class="draft-summary-cards"><div><span>#1 Overall</span><strong>${esc(top?.[2]||'—')}</strong><small>${esc(top?ownerFor(top):'')}</small></div><div><span>Keepers</span><strong>${keeperCount}</strong><small>marked by ESPN</small></div><div><span>Total Picks</span><strong>${picks.length}</strong><small>16 rounds</small></div></div></div><div class="draft-controls"><label>Manager<select class="draft-owner-filter"><option value="">All managers</option>${owners.map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select></label><label>Search<input class="draft-search" type="search" placeholder="Player, team or manager"></label></div><div class="draft-table-wrap"><table class="draft-table"><thead><tr><th>Pick</th><th>Round</th><th>Player</th><th>Team / Manager</th><th>Type</th></tr></thead><tbody></tbody></table><div class="draft-empty" hidden>No picks match that filter.</div></div>`;
      const tbody=detail.querySelector('tbody'),ownerFilter=detail.querySelector('.draft-owner-filter'),search=detail.querySelector('.draft-search'),empty=detail.querySelector('.draft-empty');
      function draw(){const owner=ownerFilter.value,q=search.value.trim().toLowerCase();const filtered=picks.filter(p=>(!owner||ownerFor(p)===owner)&&(!q||`${p[2]} ${teamFor(p)} ${ownerFor(p)}`.toLowerCase().includes(q)));tbody.innerHTML=filtered.map(p=>{const round=Math.floor((p[0]-1)/12)+1,roundPick=((p[0]-1)%12)+1;return `<tr><td class="draft-overall"><strong>#${p[0]}</strong><small>${roundPick} in round</small></td><td>R${round}</td><td class="draft-player"><strong>${esc(p[2])}</strong></td><td><strong>${esc(teamFor(p))}</strong><small>${esc(ownerFor(p))}</small></td><td>${p[3]?'<span class="draft-keeper">KEEPER</span>':'<span class="draft-pick">PICK</span>'}</td></tr>`}).join('');empty.hidden=filtered.length>0}
      ownerFilter.addEventListener('change',draw);search.addEventListener('input',draw);draw();
    }
    nav.querySelectorAll('button').forEach(x=>x.addEventListener('click',()=>renderYear(x.dataset.draftYear)));renderYear(seasons[0][0]);
  }).catch(error=>{console.error('Unable to load draft archive:',error);panel.innerHTML='<div class="panel history-content-panel"><div class="history-loading">Draft archive could not be loaded.</div></div>'});
})();
