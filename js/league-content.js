(function(){
  const supabase=window.gateSupabase;if(!supabase)return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=(v,d=1)=>Number.isFinite(Number(v))?Number(v).toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
  function parseRecord(record){const p=String(record||'').split('-').map(Number);return{wins:p[0]||0,losses:p[1]||0,ties:p[2]||0}}
  function totals(m){let wins=0,losses=0,ties=0,pf=0,pfs=0;const finishes=[];(m.seasons||[]).forEach(s=>{const r=parseRecord(s.record);wins+=r.wins;losses+=r.losses;ties+=r.ties;if(s.points_for!==null&&s.points_for!==undefined){pf+=Number(s.points_for);pfs++}finishes.push(Number(s.final_finish))});const games=wins+losses+ties;return{wins,losses,ties,pf,pfs,pct:games?(wins+ties*.5)/games:0,titles:finishes.filter(x=>x===1).length,avg:finishes.length?finishes.reduce((a,b)=>a+b,0)/finishes.length:null,best:finishes.length?Math.min(...finishes):null}}
  const recordText=(w,l,t)=>t?`${w}-${l}-${t}`:`${w}-${l}`;

  async function loadMembers(){
    const {data,error}=await supabase.from('league_members').select('id,member_number,name,role_label,sort_order,member_seasons(id,season_year,final_finish,team_name,record,points_for,points_against)').order('sort_order');
    if(error||!data?.length)return;
    const members=data.map(m=>({...m,seasons:[...(m.member_seasons||[])].sort((a,b)=>a.season_year-b.season_year)}));
    const grid=document.getElementById('membersGrid');if(!grid)return;
    grid.innerHTML=members.map((m,i)=>{const t=totals(m);return `<article class="member-card" data-db-member="${i}" tabindex="0"><div class="member-head"><div class="locker-num">${esc(m.member_number)}</div><div><div class="team">${esc(m.name)}</div><div class="mgr">${esc(m.role_label)}</div></div></div><div class="member-stats"><div class="member-stat"><span class="label">Record</span><span class="value accent">${recordText(t.wins,t.losses,t.ties)}</span></div><div class="member-stat"><span class="label">Win %</span><span class="value">${(t.pct*100).toFixed(1)}%</span></div><div class="member-stat"><span class="label">Titles</span><span class="value">${t.titles}</span></div></div></article>`}).join('');
    function open(i){const m=members[i],t=totals(m);document.getElementById('memberModalName').textContent=m.name;document.getElementById('memberModalRole').textContent=`${m.role_label} • ${m.seasons.length} seasons recorded`;document.getElementById('careerSummary').innerHTML=[['Career Record',recordText(t.wins,t.losses,t.ties)],['Win Rate',`${(t.pct*100).toFixed(1)}%`],['Championships',t.titles],['Average Finish',t.avg===null?'—':t.avg.toFixed(1)],['Best Finish',t.best?`#${t.best}`:'—'],['Career PF',t.pfs?num(t.pf):'—']].map(x=>`<div class="career-box"><div class="label">${x[0]}</div><div class="value">${x[1]}</div></div>`).join('');document.getElementById('seasonRows').innerHTML=[...m.seasons].sort((a,b)=>b.season_year-a.season_year).map(s=>{const diff=s.points_for!==null&&s.points_against!==null?Number(s.points_for)-Number(s.points_against):null;return `<tr><td>${s.season_year}</td><td class="${Number(s.final_finish)===1?'finish-champ':''}">${Number(s.final_finish)===1?'🏆 ':''}#${s.final_finish}</td><td>${esc(s.team_name)}</td><td>${esc(s.record)}</td><td>${num(s.points_for)}</td><td>${num(s.points_against)}</td><td>${diff===null?'—':`${diff>=0?'+':''}${num(diff)}`}</td></tr>`}).join('');document.getElementById('memberModal').classList.add('open')}
    grid.querySelectorAll('[data-db-member]').forEach(card=>{const fn=()=>open(Number(card.dataset.dbMember));card.addEventListener('click',fn);card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();fn()}})});
  }

  async function loadHistory(){
    const history=document.getElementById('history');if(!history)return;
    const [{data:champions},{data:records},{data:shame}]=await Promise.all([
      supabase.from('league_champions').select('*').order('season_year',{ascending:false}),
      supabase.from('league_records').select('*').order('sort_order'),
      supabase.from('wall_of_shame').select('*').eq('is_active',true).order('created_at',{ascending:false}).limit(1)
    ]);
    if(champions?.length){const el=history.querySelector('.timeline');if(el)el.innerHTML=champions.map(c=>`<div class="tl-item"><div class="yr">${c.season_year}</div><div class="champ">${esc(c.champion)}</div><div class="note">${esc(c.note)}</div></div>`).join('')}
    if(records?.length){const el=history.querySelector('.record-grid');if(el)el.innerHTML=records.map(r=>`<div class="record-card"><div class="label">${esc(r.label)}</div><div class="val">${esc(r.value)}</div><div class="sub">${esc(r.detail)}</div></div>`).join('')}
    if(shame?.length){const el=history.querySelector('.shame');if(el)el.innerHTML=`<div class="txt"><strong>${esc(shame[0].title)}</strong><span>${esc(shame[0].note)}</span></div><div class="trophy">${esc(shame[0].icon)}</div>`}
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
