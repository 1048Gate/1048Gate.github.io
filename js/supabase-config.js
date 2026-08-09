// Public browser configuration for the 1048 Gate Supabase project.
// This file intentionally contains only the public/anon browser credential.
window.SUPABASE_CONFIG = {
  url: "https://bnsylfokgrcmcfjeicfk.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXAiLCJyZWYiOiJibnN5bGZva2dyY21jZmplaWNmayIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzg2MTMxNzkzLCJleHAiOjIxMDE3MDc3OTN9.m11g-AkbqkT9HXFGS-ha2HTrYAvfGtkkxsCeExfxZvk"
};

// Load the site-wide polish layer independently of Supabase/auth readiness.
if (!document.querySelector('link[data-gate-polish]')) {
  const polishCss = document.createElement('link');
  polishCss.rel = 'stylesheet';
  polishCss.href = 'css/polish.css';
  polishCss.dataset.gatePolish = 'true';
  document.head.appendChild(polishCss);
}
if (!document.querySelector('script[data-gate-polish]')) {
  const polishScript = document.createElement('script');
  polishScript.src = 'js/ui-polish.js?v=20260809e';
  polishScript.dataset.gatePolish = 'true';
  document.head.appendChild(polishScript);
}

// Compatibility loader for member logos. The patch safely no-ops when
// the current app.js renderer has already inserted the logo markup.
if (!document.querySelector('script[data-member-logo-patch]')) {
  const memberLogoPatch = document.createElement('script');
  memberLogoPatch.src = 'js/member-logo-patch.js?v=20260809d';
  memberLogoPatch.dataset.memberLogoPatch = 'true';
  document.head.appendChild(memberLogoPatch);
}

// Load the staff authentication layer automatically after the public config is ready.
if (!document.querySelector('script[data-gate-auth]')) {
  const authScript = document.createElement('script');
  authScript.src = 'js/auth.js';
  authScript.dataset.gateAuth = 'true';
  document.head.appendChild(authScript);
}
