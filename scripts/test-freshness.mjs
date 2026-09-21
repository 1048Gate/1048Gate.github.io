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
assert.equal(freshness.saveWeek(board,storage),true);
assert.equal(freshness.clockLabel(board.fetchedAt).endsWith(' ET'), true);
assert.match(freshness.relativeFrom(board.fetchedAt, Date.parse('2026-09-21T15:35:00Z')), /min ago/);

const target={children:[],classList:{toggle(){}},replaceChildren(...children){this.children=children},append(child){this.children.push(child)}};
freshness.setTimestamp(target,{iso:board.fetchedAt,saved:true});
assert.match(target.children[0].textContent,/Saved snapshot · Updated/);
assert.equal(target.children[1].tagName,'TIME');
assert.match(target.children[1].textContent,/ET/);

freshness.setTimestamp(target,{iso:board.fetchedAt,live:true});
assert.match(target.children[0].textContent,/^Live · Updated/);
freshness.setTimestamp(target,{iso:board.fetchedAt,saved:true,degraded:true});
assert.match(target.children[0].textContent,/ESPN feed reconnecting/);

const siteUi=readFileSync(new URL('../js/site-ui.js',import.meta.url),'utf8');
assert.match(siteUi,/gateFreshness\.saveWeek/);
assert.match(siteUi,/showing the last saved snapshot/);

const transactions=readFileSync(new URL('../js/transactions.js',import.meta.url),'utf8');
assert.match(transactions,/readCategoryFromHash/);
assert.doesNotMatch(transactions,/let activeCategory = 'TRADE_ACCEPT'/);
assert.match(transactions,/activeCategory = 'all'/);
assert.match(transactions,/#transactions\?type=/);

console.log('Freshness checks: relative ET stamps, live/degraded labels, and archive default passed.');
