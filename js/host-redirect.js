(function(){
  'use strict';

  if(window.location.hostname.toLowerCase() !== '1048gate.github.io') return;

  const path = window.location.pathname === '/index.html' ? '/' : window.location.pathname;
  window.location.replace(`https://1048gate.com${path}${window.location.search}${window.location.hash}`);
})();
