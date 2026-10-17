import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

let now=0;
const pending=[];
const context={URL,document:{baseURI:'https://example.test/'},window:{location:{origin:'https://example.test'}},Date:{now:()=>now},
  fetch:(url,options)=>new Promise((resolve,reject)=>pending.push({url,options,resolve,reject}))};
runInNewContext(readFileSync(new URL('../js/data-loader.js',import.meta.url),'utf8'),context);
const loader=context.window.gateData;
const respond=(i,value={season:2026})=>pending[i].resolve(Response.json(value));
const a=loader.fetch('data/seasons.json'),b=loader.fetch('/data/seasons.json');
assert.equal(pending.length,1);respond(0);
const [first,second]=await Promise.all([a,b]);
assert.deepEqual(await first.json(),await second.json(),'each consumer needs its own readable Response');
await (await loader.fetch('data/seasons.json')).json();assert.equal(pending.length,1);
loader.invalidate('data/seasons.json');
const invalidated=loader.fetch('data/seasons.json');assert.equal(pending.length,2);respond(1,{season:2025});assert.equal((await(await invalidated).json()).season,2025);
now+=300001;
const expired=loader.fetch('data/seasons.json');assert.equal(pending.length,3);respond(2);await expired;
// A forced new generation cannot be overwritten by an old in-flight response.
loader.invalidate();
const old=loader.fetch('data/seasons.json');const oldResult=assert.rejects(old,{name:'AbortError'});
loader.invalidate('data/seasons.json');const fresh=loader.fetch('data/seasons.json');respond(4,{season:2024});await fresh;respond(3,{season:2023});await oldResult;
assert.equal((await(await loader.fetch('data/seasons.json')).json()).season,2024);
for(const path of ['current-season.json','homepage-week.json','site.json','newspaper_editions/index.json']){
  const start=pending.length;
  const one=loader.fetch(`data/${path}`),two=loader.fetch(`data/${path}`);assert.equal(pending.length,start+1);respond(start);await Promise.all([one,two]);
  const later=loader.fetch(`data/${path}`);assert.equal(pending.length,start+2);respond(start+1);await later;
}
const badIndex=pending.length,bad=loader.fetch('data/seasons.json'); // invalidate cached archive first below
await bad; // valid cached response
loader.invalidate('data/seasons.json');const malformed=loader.fetch('data/seasons.json');const rejected=assert.rejects(malformed,SyntaxError);pending[badIndex].resolve(new Response('{bad'));await rejected;
const retry=loader.fetch('data/seasons.json');respond(badIndex+1);await retry;
loader.invalidate();const failed=loader.fetch('data/members.json');const failure=assert.rejects(failed,/offline/);pending.at(-1).reject(new Error('offline'));await failure;
const start=pending.length;const external=loader.fetch('https://other.test/data/seasons.json');respond(start);await external;
assert.equal(pending[start].url,'https://other.test/data/seasons.json');
const failedIndex=pending.length;const serverFailure=loader.fetch('data/seasons.json');pending[failedIndex].resolve(new Response('unavailable',{status:503}));assert.equal((await serverFailure).status,503);
const retryServer=loader.fetch('data/seasons.json');assert.equal(pending.length,failedIndex+2);respond(failedIndex+1);await retryServer;
console.log('Shared data loader: concurrent deduplication, independent responses, TTL, invalidation, stale generations, dynamic no-retention, malformed JSON and network recovery passed.');
