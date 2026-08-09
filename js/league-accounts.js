(function(){
  const supabase=window.gateSupabase;if(!supabase)return;
  const MEMBER_DOMAIN='members.1048gate.invalid';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const usernameEmail=username=>`${String(username||'').trim().toLowerCase()}@${MEMBER_DOMAIN}`;

  if(!document.querySelector('link[data-league-account-styles]')){
    const css=document.createElement('link');css.rel='stylesheet';css.href='css/league-accounts.css?v=20260809a';css.dataset.leagueAccountStyles='true';document.head.appendChild(css);
  }

  const authCard=document.querySelector('#authModal .auth-card');
  if(!authCard)return;
  const authFields=authCard.querySelector('.auth-fields');
  const authActions=authCard.querySelector('.auth-actions');
  if(!authFields||!authActions)return;

  const divider=document.createElement('div');divider.className='league-account-divider';divider.textContent='League members';
  const createLink=document.createElement('button');createLink.type='button';createLink.className='league-account-link';createLink.textContent='Have an invite code? Create your league account →';
  authFields.insertAdjacentElement('afterend',divider);divider.insertAdjacentElement('afterend',createLink);

  const modal=document.createElement('div');modal.className='league-account-modal';modal.id='leagueAccountModal';modal.innerHTML=`<div class="league-account-card" role="dialog" aria-modal="true" aria-labelledby="leagueAccountTitle"><h2 id="leagueAccountTitle">Create League Account</h2><p id="leagueAccountIntro">Use the one-time invite code from league staff. No email address or phone number is required.</p><div class="league-account-fields"><label>Invite code<input id="leagueInviteCode" autocomplete="one-time-code" maxlength="40" placeholder="1048-…"></label><label>Username<input id="leagueUsername" autocomplete="username" maxlength="24" placeholder="Choose a username"></label><label class="league-password-field">Password<input id="leaguePassword" type="password" autocomplete="new-password" minlength="8" placeholder="At least 8 characters"></label><label class="league-password-field">Confirm password<input id="leaguePasswordConfirm" type="password" autocomplete="new-password" minlength="8" placeholder="Type it again"></label></div><div class="league-account-note" id="leagueAccountNote"><strong>Invite only:</strong> each code belongs to one of the 12 league members and can only be claimed once.</div><div class="league-account-actions"><span class="league-account-status" id="leagueAccountStatus"></span><button type="button" class="btn btn-ghost" id="leagueAccountCancel">Cancel</button><button type="button" class="btn btn-primary" id="leagueAccountSubmit">Create Account</button></div></div>`;document.body.appendChild(modal);

  const title=modal.querySelector('#leagueAccountTitle'),intro=modal.querySelector('#leagueAccountIntro'),note=modal.querySelector('#leagueAccountNote'),status=modal.querySelector('#leagueAccountStatus'),submit=modal.querySelector('#leagueAccountSubmit');
  const codeInput=modal.querySelector('#leagueInviteCode'),usernameInput=modal.querySelector('#leagueUsername'),passwordInput=modal.querySelector('#leaguePassword'),confirmInput=modal.querySelector('#leaguePasswordConfirm');
  let mode='register';

  function setStatus(message,tone=''){
    status.textContent=message||'';status.className=`league-account-status${tone?` ${tone}`:''}`;
  }

  function open(){
    const state=window.gateAuthState||{};
    const linked=Boolean(state.profile?.member_number);
    mode=state.session&&!linked?'link':'register';
    title.textContent=mode==='link'?'Link Your League Identity':'Create League Account';
    intro.textContent=mode==='link'?'Use your invite code to connect this existing staff login to your 1048 Gate member identity.':'Use the one-time invite code from league staff. No email address or phone number is required.';
    note.innerHTML=linked?'<strong>Already linked:</strong> this login is already connected to a league member.':'<strong>Invite only:</strong> each code belongs to one of the 12 league members and can only be claimed once.';
    modal.querySelectorAll('.league-password-field').forEach(x=>x.hidden=mode==='link'||linked);
    submit.hidden=linked;
    submit.textContent=mode==='link'?'Link Account':'Create Account';
    codeInput.value='';usernameInput.value=state.profile?.username||'';passwordInput.value='';confirmInput.value='';setStatus('');
    modal.classList.add('open');setTimeout(()=>codeInput.focus(),0);
  }
  function close(){modal.classList.remove('open');setStatus('')}

  createLink.addEventListener('click',open);
  modal.querySelector('#leagueAccountCancel').addEventListener('click',close);
  modal.addEventListener('click',e=>{if(e.target===modal)close()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal.classList.contains('open'))close()});

  submit.addEventListener('click',async()=>{
    const inviteCode=codeInput.value.trim();const username=usernameInput.value.trim().toLowerCase();
    if(!inviteCode||!username){setStatus('Invite code and username are required.','error');return}
    if(!/^[a-z0-9][a-z0-9._-]{2,23}$/.test(username)){setStatus('Username must be 3-24 letters/numbers with . _ or -.','error');return}
    const payload={action:mode,inviteCode,username};
    if(mode==='register'){
      const password=passwordInput.value,confirm=confirmInput.value;
      if(password.length<8){setStatus('Password must be at least 8 characters.','error');return}
      if(password!==confirm){setStatus('Passwords do not match.','error');return}
      payload.password=password;
    }
    submit.disabled=true;setStatus(mode==='link'?'Linking account…':'Creating account…');
    try{
      const {data,error}=await supabase.functions.invoke('register-league-member',{body:payload});
      if(error)throw error;
      if(data?.error)throw new Error(data.error);
      if(mode==='register'){
        const {error:loginError}=await supabase.auth.signInWithPassword({email:usernameEmail(username),password:payload.password});
        if(loginError)throw loginError;
        setStatus(`Welcome, ${data?.profile?.display_name||username}.`,'success');
      }else{
        await supabase.auth.refreshSession();
        setStatus(`Linked to ${data?.profile?.display_name||'your league profile'}.`,'success');
      }
      setTimeout(()=>{close();document.getElementById('authModal')?.classList.remove('open')},800);
    }catch(error){
      const message=error?.context?.json?.error||error?.message||'Account setup failed.';setStatus(message,'error');
    }finally{submit.disabled=false}
  });

  window.openLeagueAccountSignup=open;
})();
