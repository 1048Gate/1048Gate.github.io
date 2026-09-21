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
const board={season:2026,week:2,fetchedAt:'2026-09-21T15:06:30Z',matchups:[{}],standings:[{}]};
assert.equal(freshness.validWeek(board),true);
assert.equal(freshness.validWeek({...board,matchups:[]}),false);
assert.equal(freshness.saveWeek(board,storage),true);
assert.deepEqual(JSON.parse(JSON.stringify(freshness.readWeek({season:2026,week:2},storage))),board);
assert.equal(freshness.readWeek({season:2025,week:2},storage),null);
assert.equal(freshness.readWeek({season:2026,week:3},storage),null);
values.set(freshness.WEEK_CACHE_KEY,'broken');
assert.equal(freshness.readWeek({},storage),null);
const target={children:[],classList:{toggle(){}},replaceChildren(...children){this.children=children},append(child){this.children.push(child)}};
freshness.setTimestamp(target,{iso:board.fetchedAt,saved:true});
assert.match(target.children[0].textContent,/Saved snapshot · Updated/);
assert.equal(target.children[1].tagName,'TIME');
assert.equal(target.children[1].dateTime,board.fetchedAt);

const siteUi=readFileSync(new URL('../js/site-ui.js',import.meta.url),'utf8');
assert.match(siteUi,/showing the last saved snapshot/);
assert.match(siteUi,/gateFreshness\?\.readWeek/);
assert.match(siteUi,/gateFreshness\.saveWeek/);
console.log('Freshness checks: validation, last-known-good cache, and ESPN fallback paths passed.');
