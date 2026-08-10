(async function(){
  const supabase=window.gateSupabase||await window.gateSupabaseReady;if(!supabase)return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=(v,d=1)=>Number.isFinite(Number(v))?Number(v).toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
  function parseRecord(record){const p=String(record||'').split('-').map(Number);return{wins:p[0]||0,losses:p[1]||0,ties:p[2]||0}}
  function totals(m){let wins=0,losses=0,ties=0,pf=0,pa=0,pfs=0;const finishes=[];(m.seasons||[]).forEach(s=>{const r=parseRecord(s.record);wins+=r.wins;losses+=r.losses;ties+=r.ties;if(s.points_for!==null&&s.points_for!==undefined){pf+=Number(s.points_for);pfs++}if(s.points_against!==null&&s.points_against!==undefined)pa+=Number(s.points_against);if(Number.isFinite(Number(s.final_finish)))finishes.push(Number(s.final_finish))});const games=wins+losses+ties;return{wins,losses,ties,pf,pa,pfs,pct:games?(wins+ties*.5)/games:0,titles:finishes.filter(x=>x===1).length,runnerUps:finishes.filter(x=>x===2).length,avg:finishes.length?finishes.reduce((a,b)=>a+b,0)/finishes.length:null,best:finishes.length?Math.min(...finishes):null,games}}
  const recordText=(w,l,t)=>t?`${w}-${l}-${t}`:`${w}-${l}`;
  const ordinal=n=>{n=Number(n);if(!n)return '—';const s=['th','st','nd','rd'],v=n%100;return `${n}${s[(v-20)%10]||s[v]||s[0]}`};
  const memberPresentation=window.gateMemberPresentation;

  async function loadMembers(){
    const {data,error}=await supabase.from('league_members').select('id,member_number,name,role_label,sort_order,member_seasons(id,season_year,final_finish,team_name,record,points_for,points_against)').order('sort_order');
    if(error||!data?.length)return;
    const members=data.map(m=>({...m,seasons:[...(m.member_seasons||[])].sort((a,b)=>a.season_year-b.season_year)}));
    const grid=document.getElementById('membersGrid');if(!grid)return;
    grid.innerHTML=members.map((m,i)=>{
      const t=totals(m);
      const latest=[...m.seasons].sort((a,b)=>b.season_year-a.season_year)[0];
      const number=memberPresentation.normalizeNumber(m.member_number);
      const logo=memberPresentation.logoFor(number);
      const role=memberPresentation.roleFor({number,role:m.role_label});
      const titleBadge=t.titles?`<span class="member-title-badge">🏆 ${t.titles}× CHAMP</span>`:`<span class="member-title-badge">#${esc(number)}</span>`;
      return `<article class="member-card public-member-card" data-db-member="${i}" data-member-number="${esc(number)}" tabindex="0" aria-label="View ${esc(m.name)} career history"><div class="member-head member-head-with-logo"><div class="member-logo-shell">${logo?`<img class="member-logo" src="${logo}" alt="${esc(m.name)} team logo" loading="lazy">`:''}<span class="member-logo-fallback">${esc(number)}</span></div><div class="member-identity"><div class="team">${esc(m.name)}</div><div class="mgr">${esc(role)}</div></div>${titleBadge}</div><div class="member-latest"><span>${latest?esc(latest.team_name):'No team history'}</span><small>${latest?`${latest.season_year} · ${ordinal(latest.final_finish)} place`:''}</small></div><div class="member-stats public-member-stats"><div class="member-stat"><span class="label">Record</span><span class="value accent">${recordText(t.wins,t.losses,t.ties)}</span></div><div class="member-stat"><span class="label">Win %</span><span class="value">${(t.pct*100).toFixed(1)}%</span></div><div class="member-stat"><span class="label">Avg Finish</span><span class="value">${t.avg===null?'—':t.avg.toFixed(1)}</span></div><div class="member-stat"><span class="label">Seasons</span><span class="value">${m.seasons.length}</span></div></div><div class="member-card-footer"><span>View career profile</span><span class="member-open-arrow">View career →</span></div></article>`;
    }).join('');
    memberPresentation.bindLogoFallbacks(grid);
    function open(i){const m=members[i],t=totals(m),latest=[...m.seasons].sort((a,b)=>b.season_year-a.season_year)[0];memberPresentation.applyModal({number:m.member_number,name:m.name,role:m.role_label,seasonsRecorded:m.seasons.length,team:latest?.team_name});document.getElementById('careerSummary').innerHTML=[['Career Record',recordText(t.wins,t.losses,t.ties)],['Win Rate',`${(t.pct*100).toFixed(1)}%`],['Championships',t.titles],['Runner-Ups',t.runnerUps],['Average Finish',t.avg===null?'—':t.avg.toFixed(1)],['Best Finish',t.best?ordinal(t.best):'—'],['Career PF',t.pfs?num(t.pf):'—'],['Games',t.games]].map(x=>`<div class="career-box"><div class="label">${x[0]}</div><div class="value">${x[1]}</div></div>`).join('');document.getElementById('seasonRows').innerHTML=[...m.seasons].sort((a,b)=>b.season_year-a.season_year).map(s=>{const diff=s.points_for!==null&&s.points_against!==null?Number(s.points_for)-Number(s.points_against):null;return `<tr class="${Number(s.final_finish)===1?'champ-season-row':''}"><td>${s.season_year}</td><td class="${Number(s.final_finish)===1?'finish-champ':''}">${Number(s.final_finish)===1?'🏆 ':''}${ordinal(s.final_finish)}</td><td>${esc(s.team_name)}</td><td>${esc(s.record)}</td><td>${num(s.points_for)}</td><td>${num(s.points_against)}</td><td class="${diff!==null?(diff>=0?'positive-diff':'negative-diff'):''}">${diff===null?'—':`${diff>=0?'+':''}${num(diff)}`}</td></tr>`}).join('');const modal=document.getElementById('memberModal');modal.classList.add('open');modal.setAttribute('aria-hidden','false')}
    grid.querySelectorAll('[data-db-member]').forEach(card=>{const fn=()=>open(Number(card.dataset.dbMember));card.addEventListener('click',fn);card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();fn()}})});
  }

  async function loadHistory(){
    const history=document.getElementById('history');if(!history)return;
    const [{data:champions},{data:records},{data:shame}]=await Promise.all([
      supabase.from('league_champions').select('*').order('season_year',{ascending:false}),
      supabase.from('league_records').select('*').order('sort_order'),
      supabase.from('wall_of_shame').select('*').order('season_year',{ascending:false,nullsFirst:false}).order('created_at',{ascending:false})
    ]);
    if(champions?.length){const el=history.querySelector('.timeline');if(el){el.classList.add('champions-timeline');el.innerHTML=champions.map((c,idx)=>{const champName=c.champion||'',team=c.champion_team||'',result=[c.runner_up?`Defeated ${c.runner_up}`:'',c.championship_score].filter(Boolean).join(' · ');return `<article class="champion-entry ${idx===0?'latest-champion':''}"><div class="champion-year">${c.season_year}</div><div class="champion-main"><div class="champion-kicker">${idx===0?'Defending Champion':'League Champion'}</div><h3>${esc(champName)}</h3>${team?`<div class="champion-team">${esc(team)}</div>`:''}${result?`<div class="champion-result">${esc(result)}</div>`:''}${c.note?`<p>${esc(c.note)}</p>`:''}</div><div class="champion-trophy">🏆</div></article>`}).join('')}}
    if(records?.length){const el=history.querySelector('.record-grid');if(el){el.classList.add('public-record-grid');el.innerHTML=records.map((r,i)=>{const sub=[r.holder||r.detail,r.season_context].filter(Boolean).join(' · ');return `<article class="record-card public-record-card"><div class="record-rank">${String(i+1).padStart(2,'0')}</div><div class="label">${esc(r.label)}</div><div class="val">${esc(r.value)}</div><div class="sub">${esc(sub)}</div></article>`}).join('')}}
    const existingShame=history.querySelector('.shame');if(existingShame&&shame?.length){const container=existingShame.parentElement;const active=shame.find(s=>s.is_active)||shame[0];existingShame.innerHTML=`<div class="txt"><strong>${esc(active.member_team&&active.season_year?`${active.member_team} — Last Place, ${active.season_year}`:active.title)}</strong><span>${esc([active.punishment,active.note&&active.note!==active.punishment?active.note:''].filter(Boolean).join(' — '))}</span></div><div class="trophy">${esc(active.icon)}</div>`;let timeline=history.querySelector('#shameTimeline');if(!timeline){timeline=document.createElement('div');timeline.id='shameTimeline';timeline.className='shame-history';container.appendChild(timeline)}timeline.innerHTML=`<div class="shame-history-head"><h3>Hall of Misfortune</h3><span>Last-place archive</span></div><div class="shame-history-grid">${shame.map(s=>`<article class="shame-history-card ${s.is_active?'active':''}"><div class="shame-history-year">${s.season_year||'—'}</div><div class="shame-history-icon">${esc(s.icon||'💩')}</div><h4>${esc(s.member_team||s.title)}</h4>${s.punishment?`<strong>${esc(s.punishment)}</strong>`:''}${s.note&&s.note!==s.punishment?`<p>${esc(s.note)}</p>`:''}</article>`).join('')}</div>`}
  }

  async function refresh(){await Promise.all([loadMembers(),loadHistory()])}
  window.refreshLeagueContent=refresh;
  refresh();
  supabase.channel('1048-league-content')
    .on('postgres_changes',{event:'*',schema:'public',table:'league_members'},loadMembers)
    .on('postgres_changes',{event:'*',schema:'public',table:'member_seasons'},loadMembers)
    .on('postgres_changes',{event:'*',schema:'public',table:'league_champions'},loadHistory)
    .on('postgres_changes',{event:'*',schema:'public',table:'league_records'},loadHistory)
    .on('postgres_changes',{event:'*',schema:'public',table:'wall_of_shame'},loadHistory)
    .subscribe();
})();
