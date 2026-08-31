(function(){
  const scripts = ['js/admin.js', 'js/league-admin.js', 'js/playoffs-admin.js'];
  const styles = ['css/admin.css', 'css/playoffs-admin.css'];
  let loading = null;

  function alreadyPresent(src){
    return [...document.querySelectorAll('script[src],link[rel="stylesheet"]')]
      .some(node => (node.getAttribute('src') || node.getAttribute('href') || '').replace(/^\//, '') === src);
  }

  function appendTag(tagName, attrs){
    return new Promise((resolve, reject) => {
      const node = document.createElement(tagName);
      Object.entries(attrs).forEach(([key, value]) => { node[key] = value; });
      node.onload = () => resolve();
      node.onerror = () => reject(new Error(`Unable to load ${attrs.src || attrs.href}`));
      document.head.appendChild(node);
    });
  }

  function loadStyle(href){
    if(alreadyPresent(href)) return Promise.resolve();
    return appendTag('link', {rel:'stylesheet', href});
  }

  function loadScript(src){
    if(alreadyPresent(src)) return Promise.resolve();
    return appendTag('script', {src});
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
