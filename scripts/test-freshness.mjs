import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const values=new Map();
const storage={setItem:(key,value)=>values.set(key,value),getItem:key=>values.get(key)??null};
const context={window:{localStorage:storage},document:{
  createTextNode:text=>({textContent:text}),
  createElement:tag=>({tagName:tag.toUpperCase(),textContent:'',dateTime:'',title:''})
}};
runInNewContext(readFileSync(new URL('../js/freshness.js',import.meta.url),'utf8'),context);
const freshness=context.window.gateFreshness;
const board={season:2026,week:2,fetchedAt:'2026-09-21T15:06:30Z',matchups:Array.from({length:6},()=>({})),standings:Array.from({length:12},()=>({}))};
assert.equal(freshness.validWeek(board),true);
assert.equal(freshness.validWeek({...board,matchups:board.matchups.slice(0,5)}),false);
assert.equal(freshness.validWeek({...board,standings:board.standings.slice(0,11)}),false);
for(const season of [undefined,0,-1,1.5,'2026','invalid']) assert.equal(freshness.validWeek({...board,season}),false);
for(const week of [undefined,0,-1,1.5,'2','invalid']) assert.equal(freshness.validWeek({...board,week}),false);
assert.equal(freshness.saveWeek(board,storage),true);
assert.deepEqual(JSON.parse(JSON.stringify(freshness.readWeek({season:2026,week:2},storage))),board);
assert.equal(freshness.readWeek({season:2025,week:2},storage),null);
assert.equal(freshness.readWeek({season:2026,week:3},storage),null);
values.set(freshness.WEEK_CACHE_KEY,'broken');
assert.equal(freshness.readWeek({},storage),null);

assert.equal(freshness.clockLabel(board.fetchedAt).endsWith(' ET'), true);
assert.match(freshness.relativeFrom(board.fetchedAt, Date.parse('2026-09-21T15:35:00Z')), /min ago/);
assert.equal(freshness.relativeFrom(board.fetchedAt, Date.parse('2026-09-21T15:06:35Z')), 'just now');

const target={children:[],classList:{toggle(){}},replaceChildren(...children){this.children=children},append(child){this.children.push(child)}};
freshness.setTimestamp(target,{iso:board.fetchedAt,saved:true});
assert.match(target.children[0].textContent,/Saved snapshot · Updated/);
assert.equal(target.children[1].tagName,'TIME');
assert.equal(target.children[1].dateTime,board.fetchedAt);
assert.match(target.children[1].textContent,/ET/);

const liveTarget={children:[],classList:{toggle(){}},replaceChildren(...children){this.children=children},append(child){this.children.push(child)}};
freshness.setTimestamp(liveTarget,{iso:board.fetchedAt,live:true});
assert.match(liveTarget.children[0].textContent,/^Live · Updated/);

const degraded={children:[],classList:{toggle(){}},replaceChildren(...children){this.children=children},append(child){this.children.push(child)}};
freshness.setTimestamp(degraded,{iso:board.fetchedAt,saved:true,degraded:true});
assert.match(degraded.children[0].textContent,/ESPN feed reconnecting/);

const siteUi=readFileSync(new URL('../js/site-ui.js',import.meta.url),'utf8');
assert.match(siteUi,/showing the last saved snapshot/);
assert.match(siteUi,/gateFreshness\?\.readWeek/);
assert.match(siteUi,/gateFreshness\.saveWeek/);
assert.match(siteUi,/data-week-refresh/);
assert.match(siteUi,/degraded:true/);

const transactions=readFileSync(new URL('../js/transactions.js',import.meta.url),'utf8');
assert.match(transactions,/readCategoryFromHash/);
assert.match(transactions,/let activeCategory = readCategoryFromHash/);
assert.match(transactions,/writeCategoryToHash/);
assert.doesNotMatch(transactions,/let activeCategory = 'TRADE_ACCEPT'/);
assert.match(transactions,/activeCategory = 'all'/);

console.log('Freshness checks: relative ET stamps, live/degraded labels, refresh control, and archive default passed.');
