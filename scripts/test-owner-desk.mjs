import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

class Element{
  constructor(id){this.id=id;this.value='';this.hidden=false;this.disabled=false;this.textContent='';this.innerHTML='';this.children=[];this.listeners={};}
  replaceChildren(...children){this.children=children;this.innerHTML='';if(this.id.endsWith('Select'))this.value=children[0]?.value || '';}
  addEventListener(name,fn){this.listeners[name]=fn;}
}
const ids=['ownerStatus','ownerContent','ownerData','snapshotJson','snapshotSummary','snapshotSelect','teamSelect','datasetSelect','playerSearch','downloadSnapshot','refreshSnapshots','olderSnapshots'];
const elements=Object.fromEntries(ids.map(id=>[id,new Element(id)]));
elements.datasetSelect.value='roster'; elements.ownerContent.hidden=true;
let session={user:{id:'owner'}}, delayedPayload=null;
const payload={season:2026,week:5,fetched_at:'2026-10-07T00:00:00Z',settings:{},teams:[{id:10,name:'Private Team',roster:[{name:'<img src=x onerror=alert(1)>',position:'RB',lineup_slot:'Bench',projected_points:0}]}],available_players:[]};
const client={auth:{getSession:async()=>({data:{session}})},from(table){
  const filters={};
  const query={select(){return query},eq(key,value){filters[key]=value;return query},order(){return query},
    async range(){return {data:[{id:'snapshot',season:2026,week:5,fetched_at:payload.fetched_at}]}},
    async maybeSingle(){
      if(table==='fantasy_owner_access')return {data:filters.user_id==='owner' ? {user_id:'owner'} : null};
      if(delayedPayload)return delayedPayload;
      return {data:{payload}};
    }};
  return query;
}};
const events={};
const context={window:{gateShared:{escapeHtml:value=>String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')},gateSupabaseReady:Promise.resolve(client),addEventListener:(event,fn)=>{events[event]=fn;}},
  document:{getElementById:id=>elements[id],createElement:()=>new Element('new')},Option:function(text,value){this.text=text;this.value=String(value)},Intl,Date,JSON,Number,String,setTimeout,Blob,URL};
await runInNewContext(readFileSync(new URL('../js/owner-desk.js',import.meta.url),'utf8'),context);
assert.equal(elements.ownerContent.hidden,false);
assert.match(elements.ownerData.innerHTML,/Private Team/);
assert.match(elements.ownerData.innerHTML,/&lt;img/);
assert.doesNotMatch(elements.ownerData.innerHTML,/<img/);
assert.match(elements.ownerData.innerHTML,/0\.00/);
assert.equal(elements.downloadSnapshot.disabled,false);
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
session={user:{id:'commissioner'}};
events['gate-auth-changed']({detail:{session}});await flush();
assert.equal(elements.ownerContent.hidden,true);
assert.equal(elements.snapshotJson.textContent,'');
assert.match(elements.ownerStatus.textContent,/does not have access/);
// A request authorized earlier cannot restore private data after sign-out.
session={user:{id:'owner'}};events['gate-auth-changed']({detail:{session}});await flush();
let release;
delayedPayload=new Promise(resolve=>{release=resolve;});
const pending=elements.snapshotSelect.listeners.change();
session=null;events['gate-auth-changed']({detail:{session}});
assert.equal(elements.ownerContent.hidden,true);
assert.equal(elements.snapshotJson.textContent,'');
release({data:{payload}});await pending;await flush();
assert.equal(elements.snapshotJson.textContent,'');
assert.equal(elements.ownerData.innerHTML,'');
assert.equal(elements.downloadSnapshot.disabled,true);
console.log('Owner Desk: authorized data, HTML escaping, zero projection, commissioner denial, sign-out clearing, and late-response isolation passed.');
