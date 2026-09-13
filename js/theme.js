(function(){
  'use strict';

  const storageKey = '1048-gate-theme';
  const root = document.documentElement;

  function storedTheme(){
    try{
      const value = localStorage.getItem(storageKey);
      return value === 'light' || value === 'dark' ? value : null;
    }catch(error){
      return null;
    }
  }

  function updateControls(theme){
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      const label = `Switch to ${nextTheme} mode`;
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
      button.setAttribute('aria-pressed', String(theme === 'dark'));
    });
  }

  function updateBrowserChrome(theme){
    const meta = document.querySelector('meta[name="theme-color"]');
    if(meta) meta.setAttribute('content', theme === 'dark' ? '#070b0c' : '#f4f0e8');
  }

  function applyTheme(theme, persist){
    const safeTheme = theme === 'dark' ? 'dark' : 'light';
    root.dataset.theme = safeTheme;
    root.style.colorScheme = safeTheme;
    updateBrowserChrome(safeTheme);
    updateControls(safeTheme);
    if(persist){
      try{ localStorage.setItem(storageKey, safeTheme); }catch(error){}
    }
    document.dispatchEvent(new CustomEvent('gate:theme-change', {detail:{theme:safeTheme}}));
  }

  function bindControls(){
    updateControls(root.dataset.theme);
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      button.addEventListener('click', () => {
        applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true);
      });
    });
  }

  applyTheme(storedTheme() || 'light', false);

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindControls, {once:true});
  else bindControls();

  window.addEventListener('storage', event => {
    if(event.key === storageKey) applyTheme(storedTheme() || 'light', false);
  });

  window.gateTheme = Object.freeze({
    current: () => root.dataset.theme,
    set: theme => applyTheme(theme, true)
  });
})();
