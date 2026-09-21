const {
  escapeHtml: esc,
  formatNumber: num,
  ordinal,
  normalizeMember,
  memberTotals,
  latestSeason,
  recordText,
  trapFocus,
  memberPresentation
} = window.gateShared;

// Fixed overlays must stay under document.body (never inside .view / [hidden]).
['memberModal', 'editionSourcesDrawer', 'editionSourcesBackdrop'].forEach(id => {
  const el = document.getElementById(id);
  if (el && el.parentElement !== document.body) document.body.appendChild(el);
});

function closePhoneMore() {
  const sheet = document.getElementById('phoneMore');
  if (!sheet) return;
  sheet.hidden = true;
  sheet.classList.remove('open');
  document.querySelectorAll('[data-more-toggle]').forEach(toggle => toggle.setAttribute('aria-expanded', 'false'));
  document.body.classList.remove('phone-more-open');
}

function openPhoneMore() {
  const sheet = document.getElementById('phoneMore');
  if (!sheet) return;
  sheet.hidden = false;
  sheet.classList.add('open');
  document.querySelectorAll('[data-more-toggle]').forEach(toggle => toggle.setAttribute('aria-expanded', 'true'));
  document.body.classList.add('phone-more-open');
}

const gateRoutes = {
  home: {view: 'home', nav: 'home', event: 'home'},
  league: {view: 'league', nav: 'league', event: 'league'},
  members: {view: 'league', nav: 'league', event: 'league'},
  memberskeepers: {view: 'league', nav: 'league', event: 'league', scroll: 'membersKeepers'},
  homekeepers: {view: 'league', nav: 'league', event: 'league', scroll: 'membersKeepers'},
  wire: {view: 'wire', nav: 'wire', tab: 'transactions', event: 'transactions'},
  transactions: {view: 'wire', nav: 'wire', tab: 'transactions', event: 'transactions'},
  trades: {view: 'wire', nav: 'wire', tab: 'trades', event: 'trades'},
  history: {view: 'history', nav: 'history', tab: 'overview', event: 'history'},
  playoffs: {view: 'history', nav: 'history', tab: 'playoffs', event: 'history'},
  book: {view: 'intel', nav: 'intel', event: 'intel'},
  intel: {view: 'intel', nav: 'intel', event: 'intel'},
  office: {view: 'office', nav: 'office', tab: 'rules', event: 'office'},
  rules: {view: 'office', nav: 'office', tab: 'rules', event: 'office'},
  votes: {view: 'office', nav: 'office', tab: 'votes', event: 'votes'},
  newspaper: {view: 'office', nav: 'newspaper', tab: 'newspaper', event: 'newspaper'},
  weekly: {view: 'office', nav: 'newspaper', tab: 'newspaper', event: 'newspaper'},
  thisweek: {view: 'home', nav: 'home', event: 'home'},
  staff: {view: 'staff', nav: 'staff', event: 'staff'}
};
const dockViews = new Set(['home', 'league', 'wire', 'history']);
const primaryTabViews = new Set(['home', 'league', 'wire', 'history', 'newspaper']);

function moreMenuOwns(route, key){
  const phone = window.matchMedia('(max-width: 760px)').matches;
  if(phone) return !dockViews.has(route.view);
  return !primaryTabViews.has(key) && !primaryTabViews.has(route.nav);
}

function toggleMoreMenu(){
  const sheet = document.getElementById('phoneMore');
  if(sheet?.hidden) openPhoneMore();
  else closePhoneMore();
}

function activateSubnav(rootSelector, tabAttr, panelAttr, tab){
  const root = document.querySelector(rootSelector);
  if(!root || !tab) return;
  root.querySelectorAll(`[${tabAttr}]`).forEach(button => {
    const active = button.getAttribute(tabAttr) === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  root.querySelectorAll(`[${panelAttr}]`).forEach(panel => {
    const active = panel.getAttribute(panelAttr) === tab;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
}

function switchView(name, {updateHash = true, scroll = true, scrollTarget = null} = {}) {
  const alias = String(name || 'home').replace(/^#/, '').split(/[?#]/)[0];
  if (name === 'weekly') name = 'newspaper';
  const key = (alias.toLowerCase() === 'weekly' ? 'weekly' : String(name || 'home').replace(/^#/, '').split(/[?#]/)[0]).toLowerCase();
  const route = gateRoutes[key];
  if(!route) return;
  const target = document.getElementById(route.view);
  if(!target) return;

  document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
  target.classList.add('active');
  if(route.view === 'wire') activateSubnav('#wire', 'data-wire-tab', 'data-wire-panel', route.tab || 'transactions');
  if(route.view === 'office') activateSubnav('#office', 'data-office-tab', 'data-office-panel', route.tab || 'rules');
  if(route.view === 'history'){
    target.dataset.historyTab = route.tab || 'overview';
    window.gateHistory?.show?.(route.tab || 'overview');
  }

  const navName = route.nav;
  document.querySelectorAll('#tabs button[data-view]').forEach(button => {
    const active = button.dataset.view === navName || button.dataset.view === key;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  document.querySelectorAll('.phone-dock [data-view]').forEach(button => {
    button.classList.toggle('active', button.dataset.view === navName || button.dataset.view === key);
  });
  document.querySelectorAll('[data-more-toggle]').forEach(button => {
    button.classList.toggle('active', moreMenuOwns(route, key));
  });
  document.querySelectorAll('.phone-more [data-view]').forEach(button => {
    button.classList.toggle('active', button.dataset.view === navName || button.dataset.view === key);
  });
  closePhoneMore();
  const activeButton = [...document.querySelectorAll('#tabs button[data-view]')]
    .find(button => button.dataset.view === navName);
  activeButton?.scrollIntoView({block:'nearest', inline:'center', behavior:'smooth'});
  if(updateHash && window.location.hash !== `#${key}`) history.pushState({view:key}, '', `#${key}`);
  if(scroll && !scrollTarget && !route.scroll) window.scrollTo({top: 0, behavior: 'smooth'});
  const jump = scrollTarget || route.scroll;
  if(jump) requestAnimationFrame(() => document.getElementById(jump)?.scrollIntoView({behavior:'smooth', block:'start'}));
  document.dispatchEvent(new CustomEvent('gate:viewchange', {detail:{name:route.event, parent:route.view, tab:route.tab || null, route:key}}));
}

window.switchView = switchView;
document.getElementById('tabs')?.addEventListener('click', event => {
  if (event.target.closest('[data-more-toggle]')) {
    toggleMoreMenu();
    return;
  }
  const button = event.target.closest('button[data-view]');
  if (button) switchView(button.dataset.view);
});

document.getElementById('phoneDock')?.addEventListener('click', event => {
  const more = event.target.closest('[data-more-toggle]');
  if (more) {
    toggleMoreMenu();
    return;
  }
  const button = event.target.closest('button[data-view]');
  if (button) switchView(button.dataset.view);
});

document.getElementById('phoneMore')?.addEventListener('click', event => {
  if (event.target.closest('[data-more-close]')) {
    closePhoneMore();
    return;
  }
  const button = event.target.closest('button[data-view]');
  if (button) switchView(button.dataset.view);
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closePhoneMore();
});
