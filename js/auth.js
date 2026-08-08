(async function(){
  if(!window.SUPABASE_CONFIG?.url||!window.SUPABASE_CONFIG?.anonKey)return;
  const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const supabase=createClient(window.SUPABASE_CONFIG.url,window.SUPABASE_CONFIG.anonKey);
  window.gateSupabase=supabase;

  const css=document.createElement('link');css.rel='stylesheet';css.href='css/admin.css';document.head.appendChild(css);

  const topbar=document.querySelector('.topbar-inner');
  const authControl=document.createElement('div');authControl.className='auth-control';
  authControl.innerHTML='<span class="auth-user" id="authUserLabel">Guest</span><button class="btn btn-ghost" id="authButton">Staff Login</button>';
  topbar?.appendChild(authControl);

  const modal=document.createElement('div');modal.className='auth-modal';modal.id='authModal';modal.innerHTML=`<div class="auth-card"><h2>Staff Login</h2><p>For the site administrator and commissioner. Regular league members do not need an account to use the message board or vote.</p><div class="auth-fields"><input id="authEmail" type="email" placeholder="Email"><input id="authPassword" type="password" placeholder="Password"></div><div class="auth-actions"><span class="auth-status" id="authStatus"></span><button class="btn btn-ghost" id="authCancel">Cancel</button><button class="btn btn-primary" id="authLogin">Login</button></div></div>`;document.body.appendChild(modal);

  const state={session:null,profile:null};window.gateAuthState=state;
  const btn=document.getElementById('authButton'),label=document.getElementById('authUserLabel'),status=document.getElementById('authStatus');
  function openModal(){modal.classList.add('open');document.getElementById('authEmail').focus()}
  function closeModal(){modal.classList.remove('open');status.textContent=''}
  async function loadProfile(user){if(!user){state.profile=null;return null}const {data}=await supabase.from('profiles').select('id,display_name,role').eq('id',user.id).maybeSingle();state.profile=data||null;return state.profile}
  function emitAuth(){const user=state.session?.user||null;window.dispatchEvent(new CustomEvent('gate-auth-changed',{detail:{session:state.session,user,profile:state.profile}}))}
  async function refreshUI(session){state.session=session;const user=session?.user||null;const profile=await loadProfile(user);if(user){label.textContent=profile?.display_name||user.email;btn.textContent='Logout'}else{label.textContent='Guest';btn.textContent='Staff Login'}emitAuth()}
  btn.addEventListener('click',async()=>{if(state.session){await supabase.auth.signOut();return}openModal()});
  document.getElementById('authCancel').addEventListener('click',closeModal);modal.addEventListener('click',e=>{if(e.target===modal)closeModal()});
  document.getElementById('authLogin').addEventListener('click',async()=>{const email=document.getElementById('authEmail').value.trim(),password=document.getElementById('authPassword').value;if(!email||!password){status.textContent='Enter email and password.';return}status.textContent='Signing in…';const {error}=await supabase.auth.signInWithPassword({email,password});if(error){status.textContent=error.message;return}closeModal()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
  supabase.auth.onAuthStateChange((_event,session)=>refreshUI(session));
  const {data:{session}}=await supabase.auth.getSession();await refreshUI(session);

  function loadScript(src){return new Promise(resolve=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=resolve;document.head.appendChild(s)})}
  await loadScript('js/league-content.js');
  await loadScript('js/playoffs.js');
  await loadScript('js/admin.js');
  await loadScript('js/league-admin.js');
  await loadScript('js/playoffs-admin.js');
  emitAuth();
})();
