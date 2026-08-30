let resolveGateSupabase;
window.gateSupabaseReady = new Promise(resolve => {
  resolveGateSupabase = resolve;
});

(async function(){
  const {trapFocus} = window.gateShared;
  const config = window.SUPABASE_CONFIG || {};
  if(!config.url || !config.anonKey){
    resolveGateSupabase(null);
    return;
  }

  let createClient;
  try{
    ({createClient} = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'));
  }catch(error){
    console.error('Unable to load Supabase authentication:', error);
    resolveGateSupabase(null);
    return;
  }

  const supabase = createClient(config.url, config.anonKey);
  window.gateSupabase = supabase;
  resolveGateSupabase(supabase);
  window.dispatchEvent(new CustomEvent('gate-supabase-ready', {detail:{supabase}}));

  const authMount = document.getElementById('authControlMount') || document.querySelector('.topbar-inner');
  const authControl = document.createElement('div');
  authControl.className = 'auth-control';
  authControl.innerHTML = '<span class="auth-user" id="authUserLabel">Guest</span><button class="btn btn-ghost" id="authButton">Staff Login</button>';
  authMount?.appendChild(authControl);

  const modal = document.createElement('div');
  modal.className = 'auth-modal';
  modal.id = 'authModal';
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `<div class="auth-card" role="dialog" aria-modal="true" aria-labelledby="authModalTitle" tabindex="-1">
    <h2 id="authModalTitle">Member Login</h2>
    <p id="authModalDescription">Anyone can browse the site and vote. Sign in to post on the Trade Board or access authorized staff tools.</p>
    <div id="authLoginPanel">
      <div class="auth-fields">
        <label for="authEmail">Email</label>
        <input id="authEmail" type="email" autocomplete="username">
        <label for="authPassword">Password</label>
        <input id="authPassword" type="password" autocomplete="current-password">
      </div>
      <div class="auth-help-row"><button class="auth-help-link" id="authForgot" type="button">Forgot password?</button></div>
      <div class="auth-actions">
        <span class="auth-status" id="authStatus" role="status" aria-live="polite"></span>
        <button class="btn btn-ghost" id="authCancel" type="button">Cancel</button>
        <button class="btn btn-primary" id="authLogin" type="button">Login</button>
      </div>
    </div>
    <div id="authResetPanel" hidden>
      <div class="auth-fields">
        <label for="authResetEmail">Account email</label>
        <input id="authResetEmail" type="email" autocomplete="email">
      </div>
      <div class="auth-actions">
        <span class="auth-status" id="authResetStatus" role="status" aria-live="polite"></span>
        <button class="btn btn-ghost" id="authResetBack" type="button">Back</button>
        <button class="btn btn-primary" id="authResetSend" type="button">Send reset link</button>
      </div>
    </div>
    <div id="authUpdatePanel" hidden>
      <div class="auth-fields">
        <label for="authNewPassword">New password</label>
        <input id="authNewPassword" type="password" autocomplete="new-password" minlength="12">
        <label for="authConfirmPassword">Confirm new password</label>
        <input id="authConfirmPassword" type="password" autocomplete="new-password" minlength="12">
      </div>
      <div class="auth-actions">
        <span class="auth-status" id="authUpdateStatus" role="status" aria-live="polite"></span>
        <button class="btn btn-ghost" id="authUpdateCancel" type="button">Cancel</button>
        <button class="btn btn-primary" id="authUpdatePassword" type="button">Update password</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(modal);

  const state = {session:null, profile:null};
  window.gateAuthState = state;

  const btn = document.getElementById('authButton');
  const label = document.getElementById('authUserLabel');
  const status = document.getElementById('authStatus');
  const title = document.getElementById('authModalTitle');
  const description = document.getElementById('authModalDescription');
  const loginPanel = document.getElementById('authLoginPanel');
  const resetPanel = document.getElementById('authResetPanel');
  const updatePanel = document.getElementById('authUpdatePanel');
  const resetStatus = document.getElementById('authResetStatus');
  const updateStatus = document.getElementById('authUpdateStatus');
  let authMode = 'login';
  let authReturnFocus = null;

  function setAuthMode(mode){
    authMode = mode;
    loginPanel.hidden = mode !== 'login';
    resetPanel.hidden = mode !== 'reset';
    updatePanel.hidden = mode !== 'update';
    status.textContent = '';
    resetStatus.textContent = '';
    updateStatus.textContent = '';

    if(mode === 'reset'){
      title.textContent = 'Reset Password';
      description.textContent = 'Enter the email used for your 1048 Gate account. We will send a secure link to choose a new password.';
      document.getElementById('authResetEmail').value = document.getElementById('authEmail').value.trim();
      document.getElementById('authResetEmail').focus();
      return;
    }
    if(mode === 'update'){
      title.textContent = 'Choose a New Password';
      description.textContent = 'Use at least 12 characters. Your new password is sent directly to Supabase and is never stored by 1048 Gate.';
      document.getElementById('authNewPassword').focus();
      return;
    }
    title.textContent = 'Member Login';
    description.textContent = 'Anyone can browse the site and vote. Sign in to post on the Trade Board or access authorized staff tools.';
    document.getElementById('authEmail').focus();
  }

  function openModal(){
    authReturnFocus = document.activeElement;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    setAuthMode('login');
  }

  function openPasswordUpdate(){
    authReturnFocus = document.activeElement;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    setAuthMode('update');
  }

  function closeModal(){
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    status.textContent = '';
    if(authReturnFocus?.isConnected) authReturnFocus.focus();
    authReturnFocus = null;
  }

  async function cancelModal(){
    if(authMode === 'update') await supabase.auth.signOut();
    closeModal();
  }

  function resetRedirectUrl(){
    return `${window.location.origin}${window.location.pathname}`;
  }

  async function loadProfile(user){
    if(!user){
      state.profile = null;
      return null;
    }
    const {data} = await supabase.from('profiles').select('id,display_name,role').eq('id', user.id).maybeSingle();
    state.profile = data || null;
    return state.profile;
  }

  function emitAuth(){
    const user = state.session?.user || null;
    window.dispatchEvent(new CustomEvent('gate-auth-changed', {
      detail:{session:state.session, user, profile:state.profile}
    }));
  }

  async function refreshUI(session){
    state.session = session;
    const user = session?.user || null;
    const profile = await loadProfile(user);
    if(user){
      label.textContent = profile?.display_name || user.email;
      btn.textContent = 'Logout';
    }else{
      label.textContent = 'Guest';
      btn.textContent = 'Staff Login';
    }
    emitAuth();
  }

  btn.addEventListener('click', async () => {
    if(state.session){
      await supabase.auth.signOut();
      return;
    }
    openModal();
  });
  document.getElementById('authCancel').addEventListener('click', cancelModal);
  document.getElementById('authForgot').addEventListener('click', () => setAuthMode('reset'));
  document.getElementById('authResetBack').addEventListener('click', () => setAuthMode('login'));
  document.getElementById('authUpdateCancel').addEventListener('click', cancelModal);
  modal.addEventListener('click', async event => {
    if(event.target === modal) await cancelModal();
  });
  document.getElementById('authLogin').addEventListener('click', async () => {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    if(!email || !password){
      status.textContent = 'Enter email and password.';
      return;
    }
    status.textContent = 'Signing in…';
    const {error} = await supabase.auth.signInWithPassword({email, password});
    if(error){
      status.textContent = error.message;
      return;
    }
    closeModal();
  });
  document.getElementById('authResetSend').addEventListener('click', async () => {
    const email = document.getElementById('authResetEmail').value.trim();
    if(!email){
      resetStatus.textContent = 'Enter your account email.';
      return;
    }
    resetStatus.textContent = 'Sending secure link…';
    const {error} = await supabase.auth.resetPasswordForEmail(email, {redirectTo: resetRedirectUrl()});
    if(error){
      resetStatus.textContent = 'Unable to send the reset link right now. Please wait a moment and try again.';
      return;
    }
    resetStatus.textContent = 'If that account exists, a reset link is on its way. Check spam or junk mail too.';
  });
  document.getElementById('authUpdatePassword').addEventListener('click', async () => {
    const password = document.getElementById('authNewPassword').value;
    const confirmation = document.getElementById('authConfirmPassword').value;
    if(password.length < 12){
      updateStatus.textContent = 'Use at least 12 characters.';
      return;
    }
    if(password !== confirmation){
      updateStatus.textContent = 'The passwords do not match.';
      return;
    }
    updateStatus.textContent = 'Updating password…';
    const {error} = await supabase.auth.updateUser({password});
    if(error){
      updateStatus.textContent = error.message;
      return;
    }
    document.getElementById('authNewPassword').value = '';
    document.getElementById('authConfirmPassword').value = '';
    updateStatus.textContent = 'Password updated. You are now signed in.';
    window.setTimeout(closeModal, 900);
  });
  document.addEventListener('keydown', event => {
    if(!modal.classList.contains('open')) return;
    if(event.key === 'Escape'){
      event.preventDefault();
      cancelModal();
      return;
    }
    trapFocus(event, modal.querySelector('.auth-card'));
  });

  supabase.auth.onAuthStateChange((event, session) => {
    refreshUI(session);
    if(event === 'PASSWORD_RECOVERY'){
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#home`);
      openPasswordUpdate();
    }
  });
  const {data:{session}} = await supabase.auth.getSession();
  await refreshUI(session);
})();
