(function(){
  const scripts = ['js/admin.js', 'js/league-admin.js', 'js/playoffs-admin.js'];
  const styles = ['css/admin.css', 'css/playoffs-admin.css'];
  let loading = null;

  function alreadyPresent(src){
    return [...document.querySelectorAll('script[src],link[rel="stylesheet"]')]
      .some(node => (node.getAttribute('src') || node.getAttribute('href') || '').replace(/^\//, '') === src);
  }

  function loadStyle(href){
    if(alreadyPresent(href)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = () => resolve();
      link.onerror = () => reject(new Error(`Unable to load ${href}`));
      document.head.appendChild(link);
    });
  }

  function loadScript(src){
    if(alreadyPresent(src)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Unable to load ${src}`));
      document.head.appendChild(script);
    });
  }

  function loadStaffTools(){
    if(loading) return loading;
    loading = (async () => {
      for(const href of styles) await loadStyle(href);
      for(const src of scripts) await loadScript(src);
    })().catch(error => {
      console.error('Unable to load staff tools:', error);
      loading = null;
    });
    return loading;
  }

  function maybeLoad(name){
    if(name === 'staff' || window.location.hash === '#staff') loadStaffTools();
  }

  document.addEventListener('gate:viewchange', event => maybeLoad(event.detail?.name));
  window.addEventListener('gate-auth-changed', event => {
    if(event.detail?.session || event.detail?.user) loadStaffTools();
  });
  document.addEventListener('click', event => {
    if(event.target.closest('[data-view="staff"],[data-staff-login],#authButton')) loadStaffTools();
  });

  if(window.location.hash === '#staff') loadStaffTools();
})();
