(function(){
  const supabase=window.gateSupabase;if(!supabase)return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let currentProfile=null;

  async function importCurrentSiteData(btn){
    btn.disabled=true;btn.textContent='Importing…';
    try{
      if(typeof leagueMembers==='undefined')throw new Error('Current member data was not found.');
      const memberRows=leagueMembers.map((m,i)=>({member_number:m.number,name:m.name,role_label:m.role,sort_order:i+1}));
      const {error:me}=await supabase.from('league_members').upsert(memberRows,{onConflict:'member_number'});if(me)throw me;
      const {data:dbMembers,error:readErr}=await supabase.from('league_members').select('id,member_number');if(readErr)throw readErr;
      const idMap=Object.fromEntries(dbMembers.map(m=>[m.member_number,m.id]));
      const seasons=[];leagueMembers.forEach(m=>(m.seasons||[]).forEach(s=>seasons.push({member_id:idMap[m.number],season_year:s[0],final_finish:s[1],team_name:s[2],record:s[3],points_for:s[4],points_against:s[5]})));
      const {error:se}=await supabase.from('member_seasons').upsert(seasons,{onConflict:'member_id,season_year'});if(se)throw se;

      const history=document.getElementById('history');
      const champions=[...history.querySelectorAll('.timeline .tl-item')].map(x=>({season_year:Number(x.querySelector('.yr')?.textContent.trim()),champion:x.querySelector('.champ')?.textContent.trim()||'',note:x.querySelector('.note')?.textContent.trim()||''})).filter(x=>x.season_year&&x.champion);
      if(champions.length){const {error}=await supabase.from('league_champions').upsert(champions,{onConflict:'season_year'});if(error)throw error}
      const recordRows=[...history.querySelectorAll('.record-grid .record-card')].map((x,i)=>({label:x.querySelector('.label')?.textContent.trim()||'',value:x.querySelector('.val')?.textContent.trim()||'',detail:x.querySelector('.sub')?.textContent.trim()||'',sort_order:i+1})).filter(x=>x.label);
      if(recordRows.length){await supabase.from('league_records').delete().neq('id','00000000-0000-0000-0000-000000000000');const {error}=await supabase.from('league_records').insert(recordRows);if(error)throw error}
      const shame=history.querySelector('.shame');if(shame){const title=shame.querySelector('strong')?.textContent.trim(),note=shame.querySelector('span')?.textContent.trim()||'',icon=shame.querySelector('.trophy')?.textContent.trim()||'💩';if(title){await supabase.from('wall_of_shame').update({is_active:false}).eq('is_active',true);const {error}=await supabase.from('wall_of_shame').insert({title,note,icon,is_active:true});if(error)throw error}}
      btn.textContent='Imported ✓';await Promise.all([window.refreshLeagueContent?.(),loadManager()]);setTimeout(()=>{btn.textContent='Import Current Site Data';btn.disabled=false},1800);
    }catch(err){alert(err.message||String(err));btn.textContent='Import Current Site Data';btn.disabled=false}
  }

  async function loadManager(){
    const host=document.getElementById('leagueContentManager');if(!host)return;
    const [{data:members},{data:champions},{data:records},{data:shame}]=await Promise.all([
      supabase.from('league_members').select('id,member_number,name,role_label,sort_order,member_seasons(id,season_year,final_finish,team_name,record,points_for,points_against)').order('sort_order'),
      supabase.from('league_champions').select('*').order('season_year',{ascending:false}),
      supabase.from('league_records').select('*').order('sort_order'),
      supabase.from('wall_of_shame').select('*').eq('is_active',true).order('created_at',{ascending:false}).limit(1)
    ]);
    host.innerHTML=`
      <div class="staff-subsection"><div class="staff-subhead"><h4>Members & Seasons</h4><button class="btn btn-primary" id="addMemberBtn">Add Member</button></div><div class="staff-list">${(members||[]).map(m=>`<div class="staff-item"><div class="staff-item-top"><div><h4>${esc(m.member_number)} · ${esc(m.name)}</h4><div class="staff-meta">${esc(m.role_label)} · ${(m.member_seasons||[]).length} seasons</div></div></div><div class="staff-toolbar"><button class="btn btn-ghost" data-content-action="edit-member" data-id="${m.id}">Edit Member</button><button class="btn btn-ghost" data-content-action="add-season" data-id="${m.id}">Add Season</button><button class="btn btn-ghost staff-danger" data-content-action="delete-member" data-id="${m.id}">Delete</button></div>${[...(m.member_seasons||[])].sort((a,b)=>b.season_year-a.season_year).map(s=>`<div class="league-season-row"><span>${s.season_year}</span><span>#${s.final_finish}</span><span>${esc(s.team_name)}</span><span>${esc(s.record)}</span><button class="mini-link" data-content-action="edit-season" data-id="${s.id}" data-member="${m.id}">Edit</button><button class="mini-link danger" data-content-action="delete-season" data-id="${s.id}">Delete</button></div>`).join('')}</div>`).join('')||'<div class="staff-empty">No members in Supabase yet. Use Import Current Site Data.</div>'}</div></div>
      <div class="staff-subsection"><div class="staff-subhead"><h4>Champions</h4><button class="btn btn-primary" id="addChampionBtn">Add Champion</button></div><div class="staff-list">${(champions||[]).map(c=>`<div class="staff-item"><div class="staff-item-top"><div><h4>${c.season_year} · ${esc(c.champion)}</h4><div class="staff-meta">${esc(c.note)}</div></div></div><div class="staff-toolbar"><button class="btn btn-ghost" data-content-action="edit-champion" data-id="${c.id}">Edit</button><button class="btn btn-ghost staff-danger" data-content-action="delete-champion" data-id="${c.id}">Delete</button></div></div>`).join('')||'<div class="staff-empty">No champions stored yet.</div>'}</div></div>
      <div class="staff-subsection"><div class="staff-subhead"><h4>Record Book</h4><button class="btn btn-primary" id="addRecordBtn">Add Record</button></div><div class="staff-list">${(records||[]).map(r=>`<div class="staff-item"><div class="staff-item-top"><div><h4>${esc(r.label)}</h4><div class="staff-meta">${esc(r.value)} · ${esc(r.detail)}</div></div></div><div class="staff-toolbar"><button class="btn btn-ghost" data-content-action="edit-record" data-id="${r.id}">Edit</button><button class="btn btn-ghost staff-danger" data-content-action="delete-record" data-id="${r.id}">Delete</button></div></div>`).join('')||'<div class="staff-empty">No records stored yet.</div>'}</div></div>
      <div class="staff-subsection"><div class="staff-subhead"><h4>Wall of Shame</h4><button class="btn btn-primary" id="editShameBtn">${shame?.length?'Edit Current':'Add Entry'}</button></div>${shame?.length?`<div class="staff-item"><h4>${esc(shame[0].title)}</h4><div class="staff-meta">${esc(shame[0].note)} · ${esc(shame[0].icon)}</div></div>`:'<div class="staff-empty">No active entry.</div>'}</div>`;
    document.getElementById('addMemberBtn')?.addEventListener('click',()=>memberDialog());
    document.getElementById('addChampionBtn')?.addEventListener('click',()=>championDialog());
    document.getElementById('addRecordBtn')?.addEventListener('click',()=>recordDialog());
    document.getElementById('editShameBtn')?.addEventListener('click',()=>shameDialog(shame?.[0]||null));
  }

  async function memberDialog(existing=null){const number=prompt('Member number:',existing?.member_number||''),name=number!==null?prompt('Member name:',existing?.name||''):null,role=name!==null?prompt('Role label:',existing?.role_label||'League Member'):null;if(number===null||name===null||role===null||!number.trim()||!name.trim())return;const row={member_number:number.trim(),name:name.trim(),role_label:role.trim()||'League Member',sort_order:Number(number)||99};const q=existing?supabase.from('league_members').update(row).eq('id',existing.id):supabase.from('league_members').insert(row);const {error}=await q;if(error)alert(error.message);else await refreshAll()}
  async function seasonDialog(memberId,existing=null){const year=prompt('Season year:',existing?.season_year||''),finish=year!==null?prompt('Final finish:',existing?.final_finish||''):null,team=finish!==null?prompt('Team name:',existing?.team_name||''):null,record=team!==null?prompt('Record (W-L or W-L-T):',existing?.record||''):null,pf=record!==null?prompt('Points For (leave blank if unavailable):',existing?.points_for??''):null,pa=pf!==null?prompt('Points Against (leave blank if unavailable):',existing?.points_against??''):null;if([year,finish,team,record,pf,pa].some(v=>v===null)||!year||!finish||!team||!record)return;const row={member_id:memberId,season_year:Number(year),final_finish:Number(finish),team_name:team.trim(),record:record.trim(),points_for:pf===''?null:Number(pf),points_against:pa===''?null:Number(pa)};const q=existing?supabase.from('member_seasons').update(row).eq('id',existing.id):supabase.from('member_seasons').insert(row);const {error}=await q;if(error)alert(error.message);else await refreshAll()}
  async function championDialog(existing=null){const year=prompt('Season year:',existing?.season_year||''),champ=year!==null?prompt('Champion / team:',existing?.champion||''):null,note=champ!==null?prompt('Championship note:',existing?.note||''):null;if(year===null||champ===null||note===null||!year||!champ)return;const row={season_year:Number(year),champion:champ.trim(),note:note.trim()};const q=existing?supabase.from('league_champions').update(row).eq('id',existing.id):supabase.from('league_champions').insert(row);const {error}=await q;if(error)alert(error.message);else await refreshAll()}
  async function recordDialog(existing=null){const label=prompt('Record label:',existing?.label||''),value=label!==null?prompt('Record value:',existing?.value||''):null,detail=value!==null?prompt('Detail / holder:',existing?.detail||''):null;if(label===null||value===null||detail===null||!label||!value)return;const row={label:label.trim(),value:value.trim(),detail:detail.trim(),sort_order:existing?.sort_order||Date.now()%100000};const q=existing?supabase.from('league_records').update(row).eq('id',existing.id):supabase.from('league_records').insert(row);const {error}=await q;if(error)alert(error.message);else await refreshAll()}
  async function shameDialog(existing=null){const title=prompt('Wall of Shame title:',existing?.title||''),note=title!==null?prompt('Description:',existing?.note||''):null,icon=note!==null?prompt('Icon / emoji:',existing?.icon||'💩'):null;if(title===null||note===null||icon===null||!title)return;if(existing){const {error}=await supabase.from('wall_of_shame').update({title:title.trim(),note:note.trim(),icon:icon.trim()||'💩'}).eq('id',existing.id);if(error)alert(error.message)}else{await supabase.from('wall_of_shame').update({is_active:false}).eq('is_active',true);const {error}=await supabase.from('wall_of_shame').insert({title:title.trim(),note:note.trim(),icon:icon.trim()||'💩',is_active:true});if(error)alert(error.message)}await refreshAll()}
  async function refreshAll(){await Promise.all([loadManager(),window.refreshLeagueContent?.()])}

  async function action(e){const b=e.target.closest('[data-content-action]');if(!b)return;const a=b.dataset.contentAction,id=b.dataset.id;
    if(a==='delete-member'&&confirm('Delete this member and all seasons?'))await supabase.from('league_members').delete().eq('id',id);
    if(a==='delete-season'&&confirm('Delete this season?'))await supabase.from('member_seasons').delete().eq('id',id);
    if(a==='delete-champion'&&confirm('Delete this champion entry?'))await supabase.from('league_champions').delete().eq('id',id);
    if(a==='delete-record'&&confirm('Delete this record?'))await supabase.from('league_records').delete().eq('id',id);
    if(a==='add-season')return seasonDialog(id);
    if(a==='edit-member'){const {data}=await supabase.from('league_members').select('*').eq('id',id).single();return memberDialog(data)}
    if(a==='edit-season'){const {data}=await supabase.from('member_seasons').select('*').eq('id',id).single();return seasonDialog(b.dataset.member,data)}
    if(a==='edit-champion'){const {data}=await supabase.from('league_champions').select('*').eq('id',id).single();return championDialog(data)}
    if(a==='edit-record'){const {data}=await supabase.from('league_records').select('*').eq('id',id).single();return recordDialog(data)}
    await refreshAll();
  }

  function inject(){if(currentProfile?.role!=='site_admin')return;const staff=document.getElementById('staffContent');if(!staff||document.getElementById('leagueContentPanel'))return;const panel=document.createElement('div');panel.className='panel staff-panel staff-panel-wide';panel.id='leagueContentPanel';panel.innerHTML=`<div class="staff-subhead"><div><h3>League Content Manager</h3><div class="staff-meta">Edit members, seasons, champions, records, and Wall of Shame without touching code.</div></div><button class="btn btn-primary" id="importSiteDataBtn">Import Current Site Data</button></div><div class="staff-role-note">The import button copies the current hardcoded site data into Supabase. It is safe to use for the initial migration; future edits should be made here.</div><div id="leagueContentManager"></div>`;staff.appendChild(panel);panel.addEventListener('click',action);document.getElementById('importSiteDataBtn').addEventListener('click',e=>importCurrentSiteData(e.currentTarget));loadManager()}

  window.addEventListener('gate-auth-changed',e=>{currentProfile=e.detail.profile;if(currentProfile?.role==='site_admin')setTimeout(inject,0)});
})();
