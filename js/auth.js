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
  modal.innerHTML = `<div class="auth-card" role="dialog" aria-modal="true" aria-labelledby="authModalTitle" tabindex="-1"><h2 id="authModalTitle">Member Login</h2><p>Anyone can browse the site and vote. Sign in to post on the Trade Board or access authorized staff tools.</p><div class="auth-fields"><label for="authEmail">Email</label><input id="authEmail" type="email" autocomplete="username"><label for="authPassword">Password</label><input id="authPassword" type="password" autocomplete="current-password"></div><div class="auth-actions"><span class="auth-status" id="authStatus" role="status"></span><button class="btn btn-ghost" id="authCancel" type="button">Cancel</button><button class="btn btn-primary" id="authLogin" type="button">Login</button></div></div>`;
  document.body.appendChild(modal);

  const state = {session:null, profile:null};
  window.gateAuthState = state;

  const btn = document.getElementById('authButton');
  const label = document.getElementById('authUserLabel');
  const status = document.getElementById('authStatus');
  let authReturnFocus = null;

  function openModal(){
    authReturnFocus = document.activeElement;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.getElementById('authEmail').focus();
  }

  function closeModal(){
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    status.textContent = '';
    if(authReturnFocus?.isConnected) authReturnFocus.focus();
    authReturnFocus = null;
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
  document.getElementById('authCancel').addEventListener('click', closeModal);
  modal.addEventListener('click', event => {
    if(event.target === modal) closeModal();
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
  document.addEventListener('keydown', event => {
    if(!modal.classList.contains('open')) return;
    if(event.key === 'Escape'){
      event.preventDefault();
      closeModal();
      return;
    }
    trapFocus(event, modal.querySelector('.auth-card'));
  });

  supabase.auth.onAuthStateChange((_event, session) => refreshUI(session));
  const {data:{session}} = await supabase.auth.getSession();
  await refreshUI(session);
})();
