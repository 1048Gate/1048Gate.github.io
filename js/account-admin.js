(function(){
  const supabase=window.gateSupabase;if(!supabase)return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let currentProfile=null;
  let pollObserver=null;

  function isStaff(){return currentProfile&&['site_admin','commissioner'].includes(currentProfile.role)}

  function ensureVoterModal(){
    let modal=document.getElementById('voterStatusModal');if(modal)return modal;
    modal=document.createElement('div');modal.className='voter-status-modal';modal.id='voterStatusModal';modal.innerHTML='<div class="voter-status-card"><div class="voter-status-head"><div><h2>League Vote Status</h2><p class="staff-meta">Choices stay hidden while a poll is open.</p></div><button class="modal-close" type="button" aria-label="Close">×</button></div><div class="voter-status-list" id="voterStatusList"></div></div>';document.body.appendChild(modal);
    modal.querySelector('.modal-close').addEventListener('click',()=>modal.classList.remove('open'));modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('open')});return modal;
  }

  async function loadInvites(){
    const host=document.getElementById('leagueInviteRows');if(!host||!isStaff())return;
    const {data,error}=await supabase.rpc('list_league_invites');
    if(error){host.innerHTML='<div class="staff-empty">League account backend is not installed yet.</div>';return}
    const rows=data||[],claimed=rows.filter(x=>x.claimed).length;
    const summary=document.getElementById('leagueInviteSummary');if(summary)summary.textContent=`${claimed} of ${rows.length} accounts claimed`;
    host.innerHTML=rows.map(r=>`<div class="league-invite-row"><div class="league-invite-number">${esc(r.member_number)}</div><div class="league-invite-name"><strong>${esc(r.display_name)}</strong><small>${esc(r.desired_role==='site_admin'?'Admin':r.desired_role==='commissioner'?'Commissioner':'Member')}${r.username?` · @${esc(r.username)}`:''}</small></div><div class="league-invite-status ${r.claimed?'claimed':''}">${r.claimed?'✓ Account claimed':r.invite_ready?'Invite ready':'No invite issued'}</div>${r.claimed?'':`<button class="btn btn-ghost" type="button" data-generate-invite="${esc(r.member_number)}">${r.invite_ready?'Regenerate':'Generate'} Code</button>`}</div>`).join('');
  }

  async function generateInvite(memberNumber,button){
    button.disabled=true;
    try{
      const {data,error}=await supabase.rpc('generate_league_invite',{p_member_number:memberNumber});if(error)throw error;
      const panel=document.getElementById('leagueInviteAdmin');let code=panel.querySelector('.league-invite-code');if(!code){code=document.createElement('div');code.className='league-invite-code';panel.appendChild(code)}
      code.innerHTML=`<span>Copy this now — it is only shown in plaintext here</span><strong>${esc(data)}</strong><button class="btn btn-ghost" type="button" data-copy-invite="${esc(data)}">Copy Code</button>`;
      await loadInvites();
    }catch(error){alert(error.message||'Unable to generate invite code.')}finally{button.disabled=false}
  }

  async function showVoterStatus(pollId,question){
    const modal=ensureVoterModal(),host=modal.querySelector('#voterStatusList');modal.querySelector('h2').textContent=question||'League Vote Status';host.innerHTML='<div class="staff-empty">Loading voter status…</div>';modal.classList.add('open');
    const {data,error}=await supabase.rpc('get_poll_voter_status',{p_poll_id:pollId});
    if(error){host.innerHTML=`<div class="staff-empty">${esc(error.message)}</div>`;return}
    host.innerHTML=(data||[]).map(r=>`<div class="voter-status-row"><div class="mark">${r.has_voted?'✅':r.account_claimed?'⬜':'◻️'}</div><div><strong>${esc(r.display_name)}</strong><small>#${esc(r.member_number)} · ${r.account_claimed?'Account active':'Account not claimed'} · ${r.has_voted?'Voted':'Not voted'}</small></div><div class="choice">${r.option_label?esc(r.option_label):r.has_voted?'Ballot hidden':''}</div></div>`).join('');
  }

  function patchPollButtons(){
    if(!isStaff())return;
    const list=document.getElementById('staffPollList');if(!list)return;
    list.querySelectorAll('.staff-item').forEach(item=>{
      if(item.querySelector('[data-voter-status]'))return;
      const edit=item.querySelector('[data-action="edit-poll"][data-id]');const toolbar=item.querySelector('.staff-toolbar');const title=item.querySelector('h4')?.textContent||'League Vote Status';if(!edit||!toolbar)return;
      const btn=document.createElement('button');btn.type='button';btn.className='btn btn-ghost';btn.dataset.voterStatus=edit.dataset.id;btn.textContent='Who Voted?';btn.addEventListener('click',()=>showVoterStatus(edit.dataset.id,title));toolbar.insertBefore(btn,toolbar.firstChild);
    });
  }

  function mount(){
    if(!isStaff())return;
    const content=document.getElementById('staffContent');if(!content)return;
    if(!document.getElementById('leagueInviteAdmin')){
      const panel=document.createElement('div');panel.className='panel staff-panel staff-panel-wide';panel.id='leagueInviteAdmin';panel.innerHTML='<div class="staff-item-top"><div><h3>League Accounts & Invites</h3><div class="staff-meta" id="leagueInviteSummary">Invite-only access for the 12 league members</div></div><span class="staff-badge live">INVITE ONLY</span></div><div class="staff-role-note"><strong>No emails needed.</strong> Generate a one-time code, send it privately to that member, and they choose their own username and password.</div><div class="league-invite-grid" id="leagueInviteRows"><div class="staff-empty">Loading league accounts…</div></div>';content.appendChild(panel);
      panel.addEventListener('click',e=>{const generate=e.target.closest('[data-generate-invite]');if(generate)generateInvite(generate.dataset.generateInvite,generate);const copy=e.target.closest('[data-copy-invite]');if(copy)navigator.clipboard?.writeText(copy.dataset.copyInvite).then(()=>{copy.textContent='Copied ✓'})});loadInvites();
    }
    patchPollButtons();
    const list=document.getElementById('staffPollList');if(list&&!pollObserver){pollObserver=new MutationObserver(patchPollButtons);pollObserver.observe(list,{childList:true,subtree:true})}
  }

  window.addEventListener('gate-auth-changed',e=>{currentProfile=e.detail.profile;if(!isStaff()){document.getElementById('leagueInviteAdmin')?.remove();pollObserver?.disconnect();pollObserver=null;return}[100,300,700,1400].forEach(ms=>setTimeout(mount,ms))});
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-view="staff"]'))setTimeout(mount,150)});
})();
