// Public browser configuration for the 1048 Gate Supabase project.
// This file intentionally contains only the public/publishable browser credential.
window.SUPABASE_CONFIG = {
  url: "https://bnsylfokgrcmcfjeicfk.supabase.co",
  anonKey: "sb_publishable_NCYuEoNM-nzOkOjgqMYqjA_3GhnfVuZ"
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
  memberLogoPatch.src = 'js/member-logo-patch.js?v=20260809f';
  memberLogoPatch.dataset.memberLogoPatch = 'true';
  document.head.appendChild(memberLogoPatch);
}

// Load authentication. This version includes invite-only league accounts while
// preserving existing staff email logins.
if (!document.querySelector('script[data-gate-auth]')) {
  const authScript = document.createElement('script');
  authScript.src = 'js/auth.js?v=20260809a';
  authScript.dataset.gateAuth = 'true';
  document.head.appendChild(authScript);
}
