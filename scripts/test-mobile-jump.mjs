import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const formMarkup=html.match(/<form class="mobile-section-jump"[\s\S]*?<\/form>/)?.[0];
assert.ok(formMarkup,'Homepage needs a compact, labeled section form.');
assert.match(formMarkup,/<label for="homeJumpTarget">Jump to<\/label>/);
assert.match(formMarkup,/<button type="submit">Go<\/button>/);
const targets=[...formMarkup.matchAll(/<option value="([^"]+)">/g)].map(match=>match[1]);
assert.deepEqual(targets,['weekBoard','deskStandings','deskLeaders','deskPlayoff','deskTransactions','deskHistory','championshipOdds','newspaper']);
for(const id of targets)assert.ok(html.includes(`id="${id}"`),`Jump target ${id} must exist.`);
let submit,focused=0,scrolled=0,prevented=0;
const heading={focus(options){assert.equal(options.preventScroll,true);focused++;}};
const target={scrollIntoView(options){assert.equal(options.block,'start');assert.equal(options.behavior,'instant');scrolled++;},querySelector:()=>heading};
const select={value:'deskStandings'};
const nodes={homeJumpForm:{addEventListener(name,handler){assert.equal(name,'submit');submit=handler;}},homeJumpTarget:select,deskStandings:target,home:{contains:node=>node===target}};
const context={window:{location:{hash:'#unknown'},addEventListener(){},gateSupabaseReady:new Promise(()=>{})},
  document:{getElementById:id=>nodes[id]||null,querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){}}};
runInNewContext(readFileSync(new URL('../js/shared.js',import.meta.url),'utf8'),context);
runInNewContext(readFileSync(new URL('../js/app.js',import.meta.url),'utf8'),context);
submit({preventDefault(){prevented++;}});
assert.equal(prevented,1);assert.equal(scrolled,1);assert.equal(focused,1);assert.equal(heading.tabIndex,-1);
select.value='missing';submit({preventDefault(){}});assert.equal(scrolled,1);
nodes.outside=target;nodes.home.contains=()=>false;select.value='outside';submit({preventDefault(){}});assert.equal(scrolled,1);
console.log('Mobile Jump to: existing section targets, explicit submit, real app scroll/focus behavior and invalid-target guards passed.');
