(async function(){
  const supabase=window.gateSupabase||await window.gateSupabaseReady;if(!supabase)return;
  const {escapeHtml:esc,memberPresentation}=window.gateShared;
  let currentProfile=null;
  const missingStarterColumn=error=>error?.code==='42703'||String(error?.message||'').includes('is_starter');

  const tabs=document.getElementById('tabs');
  let staffTab=tabs?.querySelector('[data-view="staff"]');
  if(!staffTab){
    staffTab=document.createElement('button');staffTab.dataset.view='staff';staffTab.className='staff-nav';staffTab.textContent='Staff';tabs?.appendChild(staffTab);
  }
  const main=document.querySelector('main');
  if(!document.getElementById('staff')){
    const staffView=document.createElement('section');staffView.className='view';staffView.id='staff';staffView.innerHTML='<div class="section-title"><h2>Staff Tools</h2><span class="see-all" id="staffRoleLabel"></span></div><div id="staffContent"></div>';main?.appendChild(staffView);
  }
  staffTab.addEventListener('click',()=>window.switchView?.('staff'));

  async function loadAnnouncementsHome(){
    const board=document.getElementById('commissionerBoard');if(!board)return;
    let {data,error}=await supabase.from('announcements').select('id,author_name,body,is_starter,created_at').eq('is_pinned',true).order('created_at',{ascending:false}).limit(3);
    if(missingStarterColumn(error))({data,error}=await supabase.from('announcements').select('id,author_name,body,created_at').eq('is_pinned',true).order('created_at',{ascending:false}).limit(3));
    if(error){
      board.innerHTML='<div class="commissioner-empty">Commissioner announcements could not load.</div>';
      return;
    }
    if(!data?.length){
      board.innerHTML='<div class="commissioner-empty">No commissioner announcements are posted yet.</div>';
      return;
    }
    board.innerHTML=data.map(announcement=>{
      const [headline,...lines]=String(announcement.body).split('\n');
      const body=lines.join('\n').trim();
      const date=new Date(announcement.created_at).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
      const initials=memberPresentation.initialsFor(announcement.author_name);
      return `<article class="league-announcement"><div class="announcement-avatar" aria-hidden="true">${esc(initials)}</div><div class="announcement-content"><div class="announcement-meta"><span>League office</span><time datetime="${esc(announcement.created_at)}">${esc(date)}</time></div>${announcement.is_starter?'<span class="announcement-starter">Starter announcement</span>':''}<h3>${esc(headline)}</h3>${body?`<p>${esc(body).replace(/\n/g,'<br>')}</p>`:''}<small>${esc(announcement.author_name)}</small></div></article>`;
    }).join('');
  }

  async function loadSummary(){
    const host=document.getElementById('staffSummary');if(!host)return;
    const [polls,posts,comments,announcements]=await Promise.all([
      supabase.from('polls').select('id',{count:'exact',head:true}).eq('is_open',true),
      supabase.from('trade_board_posts').select('id',{count:'exact',head:true}),
      supabase.from('trade_board_comments').select('id',{count:'exact',head:true}),
      supabase.from('announcements').select('id',{count:'exact',head:true})
    ]);
    const cards=[['Open Polls',polls.count??0],['Trade Posts',posts.count??0],['Trade Replies',comments.count??0],['Announcements',announcements.count??0]];
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
    const voterKey='1048GateVoterId';let voterId=localStorage.getItem(voterKey);if(!voterId){voterId=crypto.randomUUID();localStorage.setItem(voterKey,voterId)}
    const {data,error}=await supabase.rpc('get_informal_polls',{p_voter_id:voterId});
    if(error){host.innerHTML=`<div class="staff-empty">${esc(error.message)}</div>`;return}
    host.innerHTML=(data||[]).map(p=>{
      const opts=[...(p.options||[])].sort((a,b)=>Number(a.sort_order)-Number(b.sort_order));const total=opts.reduce((sum,o)=>sum+Number(o.vote_count||0),0);
      const results=opts.map(o=>{const count=Number(o.vote_count||0),pct=total?Math.round(count/total*100):0;return `<div class="staff-poll-result"><div><span>${esc(o.label)}</span><strong>${count} · ${pct}%</strong></div><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div></div>`}).join('');
      return `<div class="staff-item"><div class="staff-item-top"><div><h4>${esc(p.question)}</h4><div class="staff-meta">${total} informal response${total===1?'':'s'} · ${new Date(p.created_at).toLocaleDateString()}</div></div><div class="staff-badge-stack">${p.is_starter?'<span class="staff-badge starter">STARTER</span>':''}<span class="staff-badge ${p.is_open?'live':''}">${p.is_open?'OPEN':'CLOSED'}</span></div></div><div class="staff-poll-results">${results}</div><div class="staff-toolbar">${p.is_starter?'':`<button class="btn btn-ghost" data-action="edit-poll" data-id="${p.id}" data-question="${esc(p.question)}" data-votes="${total}">Edit</button><button class="btn btn-ghost" data-action="toggle-poll" data-id="${p.id}" data-open="${p.is_open}">${p.is_open?'Close Poll':'Reopen Poll'}</button>`}<button class="btn btn-ghost staff-danger" data-action="delete-poll" data-id="${p.id}">${p.is_starter?'Delete Starter Poll':'Delete'}</button></div></div>`;
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
    status.textContent='Posting…';
    const {error}=await supabase.from('announcements').insert({author_id:window.gateAuthState?.session?.user?.id,author_name:currentProfile?.display_name||'League Staff',body,is_pinned:true});
    if(error){status.textContent=error.message;return}
    form.reset();status.textContent='Announcement posted.';await Promise.all([loadAnnouncementsHome(),loadAnnouncements(),loadSummary()]);setTimeout(()=>status.textContent='',1600);
  }

  async function loadAnnouncements(){
    const host=document.getElementById('staffAnnouncementList');if(!host)return;
    let {data,error}=await supabase.from('announcements').select('*').order('created_at',{ascending:false}).limit(20);if(error){host.innerHTML=`<div class="staff-empty">${esc(error.message)}</div>`;return}
    host.innerHTML=(data||[]).map(a=>`<div class="staff-item"><div class="staff-item-top"><div><h4>${esc(a.author_name)}</h4><div class="staff-meta">${new Date(a.created_at).toLocaleString()}</div></div><div class="staff-badge-stack">${a.is_starter?'<span class="staff-badge starter">STARTER</span>':''}${a.is_pinned?'<span class="staff-badge live">ON HOME</span>':'<span class="staff-badge">HIDDEN</span>'}</div></div><div class="staff-announcement-body">${esc(a.body).replace(/\n/g,'<br>')}</div><div class="staff-toolbar"><button class="btn btn-ghost" data-action="edit-announcement" data-id="${a.id}" data-body="${encodeURIComponent(a.body)}">Edit</button><button class="btn btn-ghost" data-action="toggle-announcement" data-id="${a.id}" data-pinned="${a.is_pinned}">${a.is_pinned?'Remove from Home':'Show on Home'}</button><button class="btn btn-ghost staff-danger" data-action="delete-announcement" data-id="${a.id}">${a.is_starter?'Delete Starter Announcement':'Delete'}</button></div></div>`).join('')||'<div class="staff-empty">No announcements yet.</div>';
  }

  async function loadProfiles(){
    const box=document.getElementById('siteAdminProfiles');if(!box||currentProfile?.role!=='site_admin')return;
    const {data,error}=await supabase.from('profiles').select('id,display_name,role,created_at').order('created_at');if(error){box.innerHTML=`<div class="staff-empty">${esc(error.message)}</div>`;return}
    box.innerHTML=(data||[]).map(p=>`<div class="staff-item"><div class="staff-item-top"><div><h4>${esc(p.display_name||'Unnamed User')}</h4><div class="staff-meta">${esc(p.role)}</div></div><select data-role-user="${p.id}"><option value="member" ${p.role==='member'?'selected':''}>Member</option><option value="commissioner" ${p.role==='commissioner'?'selected':''}>Commissioner</option><option value="site_admin" ${p.role==='site_admin'?'selected':''}>Site Admin</option></select></div></div>`).join('');
  }

  function renderDashboard(){
    const host=document.getElementById('staffContent');if(!host)return;const siteAdmin=currentProfile?.role==='site_admin';document.getElementById('staffRoleLabel').textContent=siteAdmin?'SITE ADMIN':'COMMISSIONER';
    host.innerHTML=`<div class="staff-role-note"><strong>${siteAdmin?'Site Admin':'Commissioner'} access:</strong> ${siteAdmin?'full league-site staff controls plus account-role management.':'informal polls, announcements, and Trade Board moderation.'} Items marked <span class="staff-badge starter">STARTER</span> are the launch examples; delete them from their normal lists whenever the league is ready.</div><div class="staff-summary" id="staffSummary"></div><div class="staff-grid"><div class="panel staff-panel"><h3>Create Poll</h3><form class="staff-form" id="staffPollForm"><input name="question" maxlength="200" placeholder="Poll question" required><div class="staff-options"><input name="option" maxlength="120" placeholder="Choice 1" required><input name="option" maxlength="120" placeholder="Choice 2" required><input name="option" maxlength="120" placeholder="Choice 3 (optional)"><input name="option" maxlength="120" placeholder="Choice 4 (optional)"></div><div class="staff-actions"><span class="staff-status"></span><button class="btn btn-primary">Create Poll</button></div></form></div><div class="panel staff-panel"><h3>Homepage Announcement</h3><form class="staff-form" id="staffAnnouncementForm"><textarea name="body" maxlength="1200" placeholder="Headline on the first line, then the announcement…" required></textarea><div class="staff-actions"><span class="staff-status"></span><button class="btn btn-primary">Publish to Home</button></div></form></div><div class="panel staff-panel"><h3>Manage Polls</h3><div class="staff-list" id="staffPollList"></div></div><div class="panel staff-panel"><h3>Community Moderation</h3><div class="staff-role-note">The retired legacy message board is preserved in the release archive and no longer accepts or exposes public content. Trade Board moderation remains available from the Trade Talk screen for authorized staff.</div></div><div class="panel staff-panel"><h3>Announcements</h3><div class="staff-list" id="staffAnnouncementList"></div></div>${siteAdmin?'<div class="panel staff-panel"><h3>User Roles</h3><div class="staff-role-note">Only the site admin can change staff roles.</div><div class="staff-list" id="siteAdminProfiles"></div></div>':''}</div>`;
    document.getElementById('staffPollForm').addEventListener('submit',createPoll);document.getElementById('staffAnnouncementForm').addEventListener('submit',postAnnouncement);host.addEventListener('click',handleAction);host.addEventListener('change',handleRoleChange);
    Promise.all([loadSummary(),loadPollManager(),loadAnnouncements(),loadProfiles()]);
  }

  async function handleAction(e){
    const b=e.target.closest('[data-action]');if(!b)return;const action=b.dataset.action,id=b.dataset.id;b.disabled=true;
    try{
      if(action==='edit-poll')await editPoll(id,b.dataset.question,b.dataset.votes);
      if(action==='toggle-poll'){const {error}=await supabase.from('polls').update({is_open:b.dataset.open!=='true'}).eq('id',id);if(error)alert(error.message);await Promise.all([loadPollManager(),loadSummary()])}
      if(action==='delete-poll'&&confirm('Delete this poll and all of its votes?')){const {error}=await supabase.from('polls').delete().eq('id',id);if(error)alert(error.message);await Promise.all([loadPollManager(),loadSummary()])}
      if(action==='edit-announcement'){const old=decodeURIComponent(b.dataset.body||''),body=prompt('Edit announcement:',old);if(body!==null&&body.trim()){const {error}=await supabase.from('announcements').update({body:body.trim(),updated_at:new Date().toISOString()}).eq('id',id);if(error)alert(error.message);await Promise.all([loadAnnouncements(),loadAnnouncementsHome()])}}
      if(action==='toggle-announcement'){const {error}=await supabase.from('announcements').update({is_pinned:b.dataset.pinned!=='true',updated_at:new Date().toISOString()}).eq('id',id);if(error)alert(error.message);await Promise.all([loadAnnouncements(),loadAnnouncementsHome()])}
      if(action==='delete-announcement'&&confirm('Delete this announcement?')){const {error}=await supabase.from('announcements').delete().eq('id',id);if(error)alert(error.message);await Promise.all([loadAnnouncements(),loadAnnouncementsHome(),loadSummary()])}
    }finally{b.disabled=false}
  }

  async function handleRoleChange(e){const select=e.target.closest('[data-role-user]');if(!select||currentProfile?.role!=='site_admin')return;select.disabled=true;const {error}=await supabase.from('profiles').update({role:select.value}).eq('id',select.dataset.roleUser);if(error)alert(error.message);select.disabled=false}

  window.addEventListener('gate-auth-changed',e=>{currentProfile=e.detail.profile;const staff=currentProfile&&['site_admin','commissioner'].includes(currentProfile.role);document.querySelectorAll('.staff-nav').forEach(el=>el.classList.toggle('visible',!!staff));if(!staff&&document.getElementById('staff')?.classList.contains('active'))window.switchView?.('home');if(staff)renderDashboard()});
  loadAnnouncementsHome();
  supabase.channel('1048-staff-live')
    .on('postgres_changes',{event:'*',schema:'public',table:'announcements'},()=>{loadAnnouncementsHome();if(currentProfile){loadAnnouncements();loadSummary()}})
    .on('postgres_changes',{event:'*',schema:'public',table:'polls'},()=>{if(currentProfile){loadPollManager();loadSummary()}})
    .on('postgres_changes',{event:'*',schema:'public',table:'poll_options'},()=>{if(currentProfile)loadPollManager()})
    .subscribe();
})();
