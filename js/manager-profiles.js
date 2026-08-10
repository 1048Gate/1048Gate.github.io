(function(){
  let profilePromise=null;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=v=>Number(v||0).toLocaleString(undefined,{minimumFractionDigits:1,maximumFractionDigits:2});
  const rec=(w,l,t)=>t?`${w}-${l}-${t}`:`${w}-${l}`;
  function host(){
    let node=document.getElementById('managerProfileExtras');
    if(node)return node;
    const summary=document.getElementById('careerSummary');if(!summary)return null;
    node=document.createElement('div');node.id='managerProfileExtras';node.className='manager-profile-extras';summary.insertAdjacentElement('afterend',node);return node;
  }
  function loadProfiles(){
    if(!profilePromise)profilePromise=fetch('data/manager-profiles.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(`manager-profiles.json returned HTTP ${r.status}`);return r.json()});
    return profilePromise;
  }
  function gameCard(label,g,tone){
    if(!g)return '';
    return `<article class="manager-game-card ${tone}"><span>${label}</span><strong>${num(g[0])} pts</strong><small>${esc(g[2])} ${num(g[3])} – ${esc(g[4])} ${num(g[5])}<br>${g[6]} Week ${g[7]}${g[8]?' · Playoffs':''} · vs ${esc(g[1])}</small></article>`;
  }
  async function render(name){
    const node=host();if(!node||!name)return;
    node.innerHTML='<div class="manager-profile-loading">Loading full manager résumé…</div>';
    try{
      const data=await loadProfiles();
      if(document.getElementById('memberModalName')?.textContent!==name)return;
      const p=(data.profiles||[]).find(x=>x.name===name);if(!p){node.innerHTML='';return}
      const r=p.resume||{},rival=p.rivalry,draft=p.draft||{},weapons=p.weapons||[],sig=p.signature||{};
      const best=r.bestSeason||[],high=r.highestPF||[];
      const firstRound=(draft.firstRound||[]).map(x=>`<div class="manager-draft-pick"><span>${x[0]} · #${x[1]}</span><strong>${esc(x[2])}</strong>${x[3]?'<small>KEEPER</small>':''}</div>`).join('')||'<div class="manager-profile-empty">No first-round picks in archive.</div>';
      const weaponRows=weapons.map((x,i)=>`<tr><td>#${i+1}</td><td><strong>${esc(x[1])}</strong><small>${esc(x[2])} · ${x[4]}${x[5]!==x[4]?`–${x[5]}`:''}</small></td><td>${num(x[0])}</td><td>${x[3]}</td></tr>`).join('')||'<tr><td colspan="4">Player data begins in 2019.</td></tr>';
      node.innerHTML=`
        <section class="manager-profile-section"><div class="manager-profile-head"><div><span>LEAGUE RÉSUMÉ</span><h3>Career Snapshot</h3></div><small>2017–2025 archive</small></div>
          <div class="manager-resume-grid"><div><span>Playoff Apps</span><strong>${r.playoffAppearances??0}</strong><small>${(r.playoffYears||[]).join(' · ')||'—'}</small></div><div><span>Finals</span><strong>${r.finals??0}</strong><small>${(r.finalYears||[]).join(' · ')||'—'}</small></div><div><span>Best Season</span><strong>${best.length?`#${best[1]} · ${best[0]}`:'—'}</strong><small>${best.length?esc(best[2]):'—'}</small></div><div><span>Highest PF</span><strong>${high.length?num(high[1]):'—'}</strong><small>${high.length?`${high[0]} · ${esc(high[2])}`:'—'}</small></div></div>
        </section>
        <section class="manager-profile-section manager-profile-two"><div><div class="manager-profile-head"><div><span>RIVALRY SNAPSHOT</span><h3>Most Familiar Foe</h3></div></div>${rival?`<div class="manager-rival-card"><div><span>${esc(rival[0])}</span><strong>${rec(rival[1],rival[2],rival[3])}</strong><small>${rival[6]} meetings · ${num(rival[4])}–${num(rival[5])} points</small></div><div class="manager-rival-vs">VS</div></div>`:'<div class="manager-profile-empty">No current-member rivalry data.</div>'}</div><div><div class="manager-profile-head"><div><span>SIGNATURE GAMES</span><h3>Highs & Lows</h3></div></div><div class="manager-game-grid">${gameCard('Biggest Win',sig.biggestWin,'win')}${gameCard('Worst Loss',sig.worstLoss,'loss')}</div></div></section>
        <section class="manager-profile-section manager-profile-two"><div><div class="manager-profile-head"><div><span>DRAFT DNA</span><h3>Recent First-Round Picks</h3></div><small>${draft.totalPicks||0} picks · ${draft.keepers||0} keepers</small></div><div class="manager-draft-grid">${firstRound}</div></div><div><div class="manager-profile-head"><div><span>TOP FANTASY WEAPONS</span><h3>Starter Points While Rostered</h3></div><small>2019–2025</small></div><div class="manager-weapons-wrap"><table class="manager-weapons"><thead><tr><th></th><th>Player</th><th>Pts</th><th>Starts</th></tr></thead><tbody>${weaponRows}</tbody></table></div></div></section>`;
    }catch(error){console.error('Unable to load manager profile:',error);node.innerHTML='<div class="manager-profile-loading">Full manager résumé could not be loaded.</div>'}
  }
  function queueFromCard(target){const card=target?.closest?.('.member-card[data-i]');if(!card)return;setTimeout(()=>render(document.getElementById('memberModalName')?.textContent||''),0)}
  document.addEventListener('click',e=>queueFromCard(e.target));
  document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target?.matches?.('.member-card[data-i]'))queueFromCard(e.target)});
})();
