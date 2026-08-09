// Public browser configuration for the 1048 Gate Supabase project.
// This file intentionally contains only the public/anon browser credential.
window.SUPABASE_CONFIG = {
  url: "https://bnsylfokgrcmcfjeicfk.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6ImJuc3lsZm9rZ3JjbWNmamVpY2ZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMzE3OTMsImV4cCI6MjEwMTcwNzc5M30.m11g-AkbqkT9HXFGS-ha2HTrYAvfGtkkxsCeExfxZvk"
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
  polishScript.src = 'js/ui-polish.js';
  polishScript.dataset.gatePolish = 'true';
  document.head.appendChild(polishScript);
}

// Load the staff authentication layer automatically after the public config is ready.
if (!document.querySelector('script[data-gate-auth]')) {
  const authScript = document.createElement('script');
  authScript.src = 'js/auth.js';
  authScript.dataset.gateAuth = 'true';
  document.head.appendChild(authScript);
}
