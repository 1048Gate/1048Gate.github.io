(async function(){
  const supabase=window.gateSupabase||await window.gateSupabaseReady;if(!supabase)return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let currentProfile=null;

  const tabs=document.getElementById('tabs');
  const staffTab=document.createElement('button');staffTab.dataset.view='staff';staffTab.className='staff-nav';staffTab.textContent='Staff';tabs?.appendChild(staffTab);
  const main=document.querySelector('main');
  const staffView=document.createElement('section');staffView.className='view';staffView.id='staff';staffView.innerHTML='<div class="section-title"><h2>Staff Tools</h2><span class="see-all" id="staffRoleLabel"></span></div><div id="staffContent"></div>';main?.appendChild(staffView);
  staffTab.addEventListener('click',()=>window.switchView?.('staff'));

  async function loadAnnouncement(){
    const note=document.querySelector('.pin-note');if(!note)return;
    const {data,error}=await supabase.from('announcements').select('author_name,body,created_at').eq('is_pinned',true).order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(error||!data){return}
    const date=new Date(data.created_at).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
    note.innerHTML=`<div class="pin"></div><span class="who">${esc(data.author_name)}</span>${esc(data.body).replace(/\n/g,'<br>')}<span class="when">${esc(date)}</span>`;
  }

  async function loadSummary(){
    const host=document.getElementById('staffSummary');if(!host)return;
    const [polls,posts,comments,announcements]=await Promise.all([
      supabase.from('polls').select('id',{count:'exact',head:true}).eq('is_open',true),
      supabase.from('board_posts').select('id',{count:'exact',head:true}),
      supabase.from('board_comments').select('id',{count:'exact',head:true}),
      supabase.from('announcements').select('id',{count:'exact',head:true})
    ]);
    const cards=[['Open Polls',polls.count??0],['Board Posts',posts.count??0],['Replies',comments.count??0],['Announcements',announcements.count??0]];
    host.innerHTML=cards.map(([label,value])=>`<div class="staff-summary-card"><span>${esc(label)}</span><strong>${value}</strong></div>`).join('');
  }

  async function createPoll(e){
    e.preventDefault();const form=e.currentTarget,status=form.querySelector('.staff-status');
    const q=form.question.value.trim();const options=[...form.querySelectorAll('[name="option"]')].map(x=>x.value.trim()).filter(Boolean);
    if(!q||options.length<2){status.textContent='Enter a question and at least 2 choices.';return}
    status.textContent='Creating…';
    const {data:poll,error}=await supabase.from('polls').insert({question:q,is_open:true}).select('id').single();
    if(error){status.textContent=error.message;return}
    const {error:optError}=await supabase.from('poll_options').insert(options.map((label,i)=>({poll_id:poll.id,label,sort_order:i+1})));
    if(optError){status.textContent=optError.message;return}
    form.reset();status.textContent='Poll created.';await Promise.all([loadPollManager(),loadSummary()]);setTimeout(()=>status.textContent='',1600);
  }

  async function loadPollManager(){
    const host=document.getElementById('staffPollList');if(!host)return;
    const {data,error}=await supabase.from('polls').select('id,question,is_open,created_at,poll_options(id,label,sort_order),poll_votes(id,option_id)').order('created_at',{ascending:false});
    if(error){host.innerHTML=`<div class="staff-empty">${esc(error.message)}</div>`;return}
    host.innerHTML=(data||[]).map(p=>{
      const votes=p.poll_votes||[],total=votes.length,opts=[...(p.poll_options||[])].sort((a,b)=>a.sort_order-b.sort_order);
      const results=opts.map(o=>{const count=votes.filter(v=>v.option_id===o.id).length,pct=total?Math.round(count/total*100):0;return `<div class="staff-poll-result"><div><span>${esc(o.label)}</span><strong>${count} · ${pct}%</strong></div><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div></div>`}).join('');
      return `<div class="staff-item"><div class="staff-item-top"><div><h4>${esc(p.question)}</h4><div class="staff-meta">${total} vote${total===1?'':'s'} · ${new Date(p.created_at).toLocaleDateString()}</div></div><span class="staff-badge ${p.is_open?'live':''}">${p.is_open?'OPEN':'CLOSED'}</span></div><div class="staff-poll-results">${results}</div><div class="staff-toolbar"><button class="btn btn-ghost" data-action="edit-poll" data-id="${p.id}" data-question="${esc(p.question)}" data-votes="${total}">Edit</button><button class="btn btn-ghost" data-action="toggle-poll" data-id="${p.id}" data-open="${p.is_open}">${p.is_open?'Close Poll':'Reopen Poll'}</button><button class="btn btn-ghost staff-danger" data-action="delete-poll" data-id="${p.id}">Delete</button></div></div>`;
    }).join('')||'<div class="staff-empty">No polls yet.</div>';
  }

  async function editPoll(id,currentQuestion,voteCount){
    const question=prompt('Edit poll question:',currentQuestion);if(question===null)return;
    const clean=question.trim();if(!clean)return alert('Poll question cannot be blank.');
    const {error}=await supabase.from('polls').update({question:clean}).eq('id',id);if(error)return alert(error.message);
    if(Number(voteCount)===0){
      const {data:options}=await supabase.from('poll_options').select('id,label,sort_order').eq('poll_id',id).order('sort_order');
      for(const option of options||[]){const label=prompt('Edit choice:',option.label);if(label===null)continue;const cleanLabel=label.trim();if(cleanLabel)await supabase.from('poll_options').update({label:cleanLabel}).eq('id',option.id)}
    }else alert('Question updated. Choices are locked once a poll has votes so existing votes stay meaningful.');
    await loadPollManager();
  }

  async function postAnnouncement(e){
    e.preventDefault();const form=e.currentTarget,status=form.querySelector('.staff-status'),body=form.body.value.trim();if(!body){status.textContent='Write an announcement first.';return}
    status.textContent='Posting…';await supabase.from('announcements').update({is_pinned:false}).eq('is_pinned',true);
    const {error}=await supabase.from('announcements').insert({author_id:window.gateAuthState?.session?.user?.id,author_name:currentProfile?.display_name||'League Staff',body,is_pinned:true});
    if(error){status.textContent=error.message;return}
    form.reset();status.textContent='Announcement posted.';await Promise.all([loadAnnouncement(),loadAnnouncements(),loadSummary()]);setTimeout(()=>status.textContent='',1600);
  }

  async function loadAnnouncements(){
    const host=document.getElementById('staffAnnouncementList');if(!host)return;
    const {data,error}=await supabase.from('announcements').select('*').order('created_at',{ascending:false}).limit(20);if(error){host.innerHTML=`<div class="staff-empty">${esc(error.message)}</div>`;return}
    host.innerHTML=(data||[]).map(a=>`<div class="staff-item"><div class="staff-item-top"><div><h4>${esc(a.author_name)}</h4><div class="staff-meta">${new Date(a.created_at).toLocaleString()}</div></div>${a.is_pinned?'<span class="staff-badge live">PINNED</span>':''}</div><div class="staff-announcement-body">${esc(a.body).replace(/\n/g,'<br>')}</div><div class="staff-toolbar"><button class="btn btn-ghost" data-action="edit-announcement" data-id="${a.id}" data-body="${encodeURIComponent(a.body)}">Edit</button>${a.is_pinned?'':'<button class="btn btn-ghost" data-action="pin-announcement" data-id="'+a.id+'">Pin to Home</button>'}<button class="btn btn-ghost staff-danger" data-action="delete-announcement" data-id="${a.id}">Delete</button></div></div>`).join('')||'<div class="staff-empty">No announcements yet.</div>';
  }

  async function loadModeration(){
    const host=document.getElementById('staffBoardList');if(!host)return;
    const {data,error}=await supabase.from('board_posts').select('id,author,title,category,created_at,board_comments(id,author,body,created_at)').order('created_at',{ascending:false}).limit(15);
    if(error){host.innerHTML=`<div class="staff-empty">${esc(error.message)}</div>`;return}
    host.innerHTML=(data||[]).map(p=>`<div class="staff-item"><div class="staff-item-top"><div><h4>${esc(p.title)}</h4><div class="staff-meta">${esc(p.author)} · ${esc(p.category)} · ${new Date(p.created_at).toLocaleString()}</div></div><span class="staff-badge">${p.board_comments?.length||0} replies</span></div><div class="staff-toolbar"><button class="btn btn-ghost staff-danger" data-action="delete-post" data-id="${p.id}">Delete Thread</button></div>${(p.board_comments||[]).length?`<div class="staff-comment-list">${[...p.board_comments].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)).map(c=>`<div class="staff-comment-row"><div><strong>${esc(c.author)}</strong><span>${esc(c.body)}</span></div><button class="staff-mini-delete" data-action="delete-comment" data-id="${c.id}" title="Delete reply">×</button></div>`).join('')}</div>`:''}</div>`).join('')||'<div class="staff-empty">No board posts.</div>';
  }

  async function loadProfiles(){
    const box=document.getElementById('siteAdminProfiles');if(!box||currentProfile?.role!=='site_admin')return;
    const {data,error}=await supabase.from('profiles').select('id,display_name,role,created_at').order('created_at');if(error){box.innerHTML=`<div class="staff-empty">${esc(error.message)}</div>`;return}
    box.innerHTML=(data||[]).map(p=>`<div class="staff-item"><div class="staff-item-top"><div><h4>${esc(p.display_name||'Unnamed User')}</h4><div class="staff-meta">${esc(p.role)}</div></div><select data-role-user="${p.id}"><option value="member" ${p.role==='member'?'selected':''}>Member</option><option value="commissioner" ${p.role==='commissioner'?'selected':''}>Commissioner</option><option value="site_admin" ${p.role==='site_admin'?'selected':''}>Site Admin</option></select></div></div>`).join('');
  }

  function renderDashboard(){
    const host=document.getElementById('staffContent');if(!host)return;const siteAdmin=currentProfile?.role==='site_admin';document.getElementById('staffRoleLabel').textContent=siteAdmin?'SITE ADMIN':'COMMISSIONER';
    host.innerHTML=`<div class="staff-role-note"><strong>${siteAdmin?'Site Admin':'Commissioner'} access:</strong> ${siteAdmin?'full league-site staff controls plus account-role management.':'polls, announcements, and message-board moderation.'}</div><div class="staff-summary" id="staffSummary"></div><div class="staff-grid"><div class="panel staff-panel"><h3>Create Poll</h3><form class="staff-form" id="staffPollForm"><input name="question" maxlength="200" placeholder="Poll question" required><div class="staff-options"><input name="option" maxlength="120" placeholder="Choice 1" required><input name="option" maxlength="120" placeholder="Choice 2" required><input name="option" maxlength="120" placeholder="Choice 3 (optional)"><input name="option" maxlength="120" placeholder="Choice 4 (optional)"></div><div class="staff-actions"><span class="staff-status"></span><button class="btn btn-primary">Create Poll</button></div></form></div><div class="panel staff-panel"><h3>Homepage Announcement</h3><form class="staff-form" id="staffAnnouncementForm"><textarea name="body" maxlength="1200" placeholder="Post an announcement to the homepage…" required></textarea><div class="staff-actions"><span class="staff-status"></span><button class="btn btn-primary">Publish & Pin</button></div></form></div><div class="panel staff-panel"><h3>Manage Polls</h3><div class="staff-list" id="staffPollList"></div></div><div class="panel staff-panel"><h3>Message Board Moderation</h3><div class="staff-list" id="staffBoardList"></div></div><div class="panel staff-panel"><h3>Announcements</h3><div class="staff-list" id="staffAnnouncementList"></div></div>${siteAdmin?'<div class="panel staff-panel"><h3>User Roles</h3><div class="staff-role-note">Only the site admin can change staff roles.</div><div class="staff-list" id="siteAdminProfiles"></div></div>':''}</div>`;
    document.getElementById('staffPollForm').addEventListener('submit',createPoll);document.getElementById('staffAnnouncementForm').addEventListener('submit',postAnnouncement);host.addEventListener('click',handleAction);host.addEventListener('change',handleRoleChange);
    Promise.all([loadSummary(),loadPollManager(),loadModeration(),loadAnnouncements(),loadProfiles()]);
  }

  async function handleAction(e){
    const b=e.target.closest('[data-action]');if(!b)return;const action=b.dataset.action,id=b.dataset.id;b.disabled=true;
    try{
      if(action==='edit-poll')await editPoll(id,b.dataset.question,b.dataset.votes);
      if(action==='toggle-poll'){const {error}=await supabase.from('polls').update({is_open:b.dataset.open!=='true'}).eq('id',id);if(error)alert(error.message);await Promise.all([loadPollManager(),loadSummary()])}
      if(action==='delete-poll'&&confirm('Delete this poll and all of its votes?')){const {error}=await supabase.from('polls').delete().eq('id',id);if(error)alert(error.message);await Promise.all([loadPollManager(),loadSummary()])}
      if(action==='delete-post'&&confirm('Delete this message-board thread and all replies?')){const {error}=await supabase.from('board_posts').delete().eq('id',id);if(error)alert(error.message);await Promise.all([loadModeration(),loadSummary()])}
      if(action==='delete-comment'&&confirm('Delete this reply?')){const {error}=await supabase.from('board_comments').delete().eq('id',id);if(error)alert(error.message);await Promise.all([loadModeration(),loadSummary()])}
      if(action==='edit-announcement'){const old=decodeURIComponent(b.dataset.body||''),body=prompt('Edit announcement:',old);if(body!==null&&body.trim()){const {error}=await supabase.from('announcements').update({body:body.trim(),updated_at:new Date().toISOString()}).eq('id',id);if(error)alert(error.message);await Promise.all([loadAnnouncements(),loadAnnouncement()])}}
      if(action==='pin-announcement'){await supabase.from('announcements').update({is_pinned:false}).eq('is_pinned',true);const {error}=await supabase.from('announcements').update({is_pinned:true,updated_at:new Date().toISOString()}).eq('id',id);if(error)alert(error.message);await Promise.all([loadAnnouncements(),loadAnnouncement()])}
      if(action==='delete-announcement'&&confirm('Delete this announcement?')){const {error}=await supabase.from('announcements').delete().eq('id',id);if(error)alert(error.message);await Promise.all([loadAnnouncements(),loadAnnouncement(),loadSummary()])}
    }finally{b.disabled=false}
  }

  async function handleRoleChange(e){const select=e.target.closest('[data-role-user]');if(!select||currentProfile?.role!=='site_admin')return;select.disabled=true;const {error}=await supabase.from('profiles').update({role:select.value}).eq('id',select.dataset.roleUser);if(error)alert(error.message);select.disabled=false}

  window.addEventListener('gate-auth-changed',e=>{currentProfile=e.detail.profile;const staff=currentProfile&&['site_admin','commissioner'].includes(currentProfile.role);staffTab.classList.toggle('visible',!!staff);if(!staff&&document.getElementById('staff')?.classList.contains('active'))window.switchView?.('home');if(staff)renderDashboard()});
  loadAnnouncement();
  supabase.channel('1048-staff-live')
    .on('postgres_changes',{event:'*',schema:'public',table:'announcements'},()=>{loadAnnouncement();if(currentProfile){loadAnnouncements();loadSummary()}})
    .on('postgres_changes',{event:'*',schema:'public',table:'board_posts'},()=>{if(currentProfile){loadModeration();loadSummary()}})
    .on('postgres_changes',{event:'*',schema:'public',table:'board_comments'},()=>{if(currentProfile){loadModeration();loadSummary()}})
    .on('postgres_changes',{event:'*',schema:'public',table:'poll_votes'},()=>{if(currentProfile)loadPollManager()})
    .on('postgres_changes',{event:'*',schema:'public',table:'polls'},()=>{if(currentProfile){loadPollManager();loadSummary()}})
    .on('postgres_changes',{event:'*',schema:'public',table:'poll_options'},()=>{if(currentProfile)loadPollManager()})
    .subscribe();
})();
