import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const sharedSource = readFileSync(new URL('../js/shared.js', import.meta.url), 'utf8');
const boardSource = readFileSync(new URL('../js/trade-board.js', import.meta.url), 'utf8');
const payloads = [
  '<img src=x onerror="window.__tradeBoardXss=1">',
  '<svg onload="window.__tradeBoardXss=1"></svg>',
  '<script>window.__tradeBoardXss=1</script>',
  '</div><iframe srcdoc="<script>parent.__tradeBoardXss=1</script>"></iframe>',
  '"><img src=x onerror="window.__tradeBoardXss=1">',
  '&lt;img src=x onerror=&quot;window.__tradeBoardXss=1&quot;&gt;',
  "O'Brien & Sons <keepers> \"PPR\" — 🏈",
];

// Run the complete production modules. Only DOM plumbing and Supabase are
// stubbed: never substitute the escaping helper or copy the render functions.
class Element {
  constructor(){ this.dataset = {}; this.classList = {toggle(){}}; this.listeners = {}; }
  addEventListener(event, callback){ this.listeners[event] = callback; }
  querySelector(){ return null; }
  querySelectorAll(){ return []; }
  setAttribute(){}
}
const history = new Element(), board = new Element(), nav = new Element();
const filters = new Element(), form = new Element(), feed = new Element(), auth = new Element();
const boardTab = new Element(); boardTab.dataset.tradeTab = 'board';
nav.querySelectorAll = () => [boardTab];
const hosts = {'#tradeBoardForm':form, '#tradeBoardFeed':feed, '#tradeBoardAuthStatus':auth, '.trade-board-filters':filters};
board.querySelector = selector => hosts[selector];
const section = new Element();
section.querySelector = selector => ({'[data-trade-panel="history"]':history, '[data-trade-panel="board"]':board, '.trade-subnav':nav})[selector];
const posts = payloads.map((text, index) => ({
  id:`post-${index}`, author_id:'fixture-user', author_name:text,
  title:text, body:`${text}\nSecond line & more`, player_name:text,
  post_type:'trade_discussion', position:'WR', is_closed:false,
  created_at:'2026-10-01T12:00:00Z', updated_at:'2026-10-01T12:00:00Z',
  trade_board_comments:[{id:`comment-${index}`, author_id:'fixture-user',
    author_name:text, body:text, created_at:'2026-10-01T12:01:00Z'}],
}));
const client = {
  auth:{getSession:async () => ({data:{session:{user:{id:'fixture-user'}}}})},
  from(table){
    assert.ok(['profiles', 'trade_board_posts'].includes(table));
    const query = {select(){return query;}, eq(){return query;},
      maybeSingle:async () => ({data:{role:'member', display_name:payloads[0]}}),
      order:async () => ({data:posts})};
    return query;
  },
  channel(){const channel = {on(){return channel;}, subscribe(){}}; return channel;},
};
const context = {window:{gateSupabase:client, addEventListener(){}},
  document:{getElementById:id => id === 'trades' ? section : null}, console};
runInNewContext(sharedSource, context);
const escapeHtml = context.window.gateShared.escapeHtml;
assert.equal(escapeHtml('&<>\'"'), '&amp;&lt;&gt;&#39;&quot;');
assert.equal(escapeHtml(null), '');
assert.equal(escapeHtml(0), '0');
assert.equal(escapeHtml('&lt;b&gt;'), '&amp;lt;b&amp;gt;');
await runInNewContext(boardSource, context);
boardTab.listeners.click();
await new Promise(resolve => setImmediate(resolve));
for(const text of payloads){
  const escaped = escapeHtml(text);
  assert.ok(feed.innerHTML.includes(`<h3 class="trade-board-post-title">${escaped}</h3>`));
  assert.ok(feed.innerHTML.includes(`<div class="trade-board-post-body">${escaped}<br>Second line &amp; more</div>`));
  assert.ok(feed.innerHTML.includes(`<p class="trade-board-comment-body">${escaped}</p>`));
  assert.ok(feed.innerHTML.includes(`<span class="trade-board-comment-author">${escaped}</span>`));
  assert.ok(feed.innerHTML.includes(`<span class="trade-board-author">${escaped}</span>`));
  assert.ok(feed.innerHTML.includes(`<span class="trade-board-player">${escaped} · WR</span>`));
}
assert.ok(auth.innerHTML.includes(escapeHtml(payloads[0])));
assert.doesNotMatch(feed.innerHTML, /<(?:img|svg|script|iframe)\b/i);

// Optional local browser fixture generated from the real renderer output.
// The browser checks parsing and event-handler execution independently of VM assertions.
if(process.argv[2]){
  writeFileSync(process.argv[2], `<!doctype html><meta charset="utf-8"><title>Trade Board escaping regression</title>${feed.innerHTML}`);
}
console.log(`Trade Board escaping passed: ${payloads.length} payloads through real shared.js and trade-board.js; post line breaks and literal text preserved.`);
