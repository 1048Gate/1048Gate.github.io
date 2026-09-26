import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const values=new Map();
const storage={setItem:(key,value)=>values.set(key,value),getItem:key=>values.get(key)??null};
const context={window:{localStorage:storage,setInterval:()=>1,clearInterval(){}},document:{
  createTextNode:text=>({textContent:text}),
  createElement:tag=>({tagName:tag.toUpperCase(),textContent:'',dateTime:'',title:''})
}};
runInNewContext(readFileSync(new URL('../js/freshness.js',import.meta.url),'utf8'),context);
const freshness=context.window.gateFreshness;
const board={season:2026,week:2,fetchedAt:'2026-09-21T15:06:30Z',matchups:Array.from({length:6},()=>({})),standings:Array.from({length:12},()=>({}))};
assert.equal(freshness.validWeek(board),true);
assert.equal(freshness.saveWeek(board,storage),true);
assert.equal(freshness.clockLabel(board.fetchedAt).endsWith(' ET'), true);
assert.match(freshness.dateTimeLabel(board.fetchedAt),/Sep 21, 2026 at 11:06 AM ET/);
assert.match(freshness.relativeFrom(board.fetchedAt, Date.parse('2026-09-21T15:35:00Z')), /min ago/);
assert.equal(freshness.liveFreshness(board.fetchedAt,Date.parse('2026-09-21T15:50:00Z')).level,'fresh');
assert.equal(freshness.liveFreshness(board.fetchedAt,Date.parse('2026-09-21T15:51:30Z')).level,'warning');
assert.equal(freshness.liveFreshness(board.fetchedAt,Date.parse('2026-09-21T16:36:30Z')).level,'critical');

const classes=new Map();
const target={children:[],dataset:{},classList:{toggle(name,value){classes.set(name,value)}},replaceChildren(...children){this.children=children},append(child){this.children.push(child)},setAttribute(){},removeAttribute(){}};
freshness.setTimestamp(target,{iso:board.fetchedAt,saved:true});
assert.match(target.children[0].textContent,/ESPN snapshot · Sep 21, 2026 at 11:06 AM ET/);

freshness.setTimestamp(target,{iso:board.fetchedAt,live:true,now:Date.parse('2026-09-21T15:35:00Z')});
assert.match(target.children[0].textContent,/^ESPN live · Updated/);
assert.equal(target.children[1].tagName,'TIME');
assert.match(target.children[1].textContent,/ET/);
freshness.setTimestamp(target,{iso:board.fetchedAt,live:true,now:Date.parse('2026-09-21T16:06:30Z')});
assert.match(target.children[0].textContent,/Live scores delayed/);
assert.equal(classes.get('is-stale-warning'),true);
freshness.setTimestamp(target,{iso:board.fetchedAt,status:'final'});
assert.match(target.children[0].textContent,/^Final · ESPN verified/);
freshness.setTimestamp(target,{iso:board.fetchedAt,status:'upcoming'});
assert.match(target.children[0].textContent,/^Upcoming · ESPN schedule/);
freshness.setTimestamp(target,{iso:board.fetchedAt,saved:true,degraded:true});
assert.match(target.children[0].textContent,/ESPN.*feed reconnecting/i);
assert.match(freshness.sourceLabel({source:'Weekly edition',state:'live',iso:board.fetchedAt}),/^Weekly edition · Live · Updated Sep 21, 2026 at 11:06 AM ET/);
freshness.setSourceLabel(target,{source:'League archive',state:'archive',detail:'through 2025'});
assert.equal(target.textContent,'League archive · Verified archive · through 2025');
assert.equal(target.dataset.sourceState,'archive');

const siteUi=readFileSync(new URL('../js/site-ui.js',import.meta.url),'utf8');
assert.match(siteUi,/gateFreshness\.saveWeek/);
assert.match(siteUi,/showing the last saved snapshot/);

const transactions=readFileSync(new URL('../js/transactions.js',import.meta.url),'utf8');
assert.match(transactions,/readCategoryFromHash/);
assert.doesNotMatch(transactions,/let activeCategory = 'TRADE_ACCEPT'/);
assert.match(transactions,/activeCategory = 'all'/);
assert.match(transactions,/#transactions\?type=/);

console.log('Freshness checks: ESPN source, ET stamps, live/final/upcoming/snapshot labels, and archive default passed.');
