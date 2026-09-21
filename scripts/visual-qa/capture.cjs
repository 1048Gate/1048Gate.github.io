// QA only: localhost, checked-in public fixtures, no production writes.
const {readFileSync,writeFileSync,mkdirSync}=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require(path.join(process.env.QA_NODE_MODULES,'playwright'));
const root=path.resolve('dist'), output=path.resolve('qa-artifacts');
mkdirSync(output,{recursive:true});
const json=p=>JSON.parse(readFileSync(path.join(root,p),'utf8'));
const mime={'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/\/$/,'/index.html'));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(readFileSync(file));}catch{res.writeHead(404).end();}
});
(async()=>{
 await new Promise(r=>server.listen(8080,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true});
 const report={sha:process.env.GITHUB_SHA,notes:'Live uses checked-in data. Final/offseason are intercepted QA fixtures, not actual league results. Supabase requests are stubbed; no production API access. Google Fonts and jsDelivr assets allowed.',cases:[]};
 try{
 for(const state of ['live','recap','offseason'])for(const width of [1440,390])for(const theme of ['light','dark']){
  const name=`${state}-${width===1440?'desktop':'mobile'}-${theme}`;
  const context=await browser.newContext({viewport:{width,height:width===1440?1000:844},deviceScaleFactor:1,reducedMotion:'reduce'});
  await context.addInitScript(t=>localStorage.setItem('1048-gate-theme',t),theme);
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const board=json('data/current-season.json'),config=json('data/site.json'),index=json('data/newspaper_editions/index.json');
  const entry=index.editions.find(e=>e.season===board.season&&e.week===board.week);
  const edition=json(entry.path);
  if(state==='recap'){
    board.matchups.forEach(g=>g.state='final');board.note='QA fixture: finalized week; scores retained from checked-in snapshot.';
    edition.source_status=entry.source_status='verified_final';edition.status='final';
    edition.headline=`Week ${board.week} final — visual QA fixture`;
    edition.standfirst='Representative finalized-week layout. These are test fixtures, not newly published league results.';
  }
  if(state==='offseason')config.phase='Offseason';
  const fixtures={'/data/site.json':config,'/data/current-season.json':board,'/data/newspaper_editions/index.json':index,['/'+entry.path]:edition};
  await page.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.hostname==='127.0.0.1'){
      if(fixtures[u.pathname])return route.fulfill({json:fixtures[u.pathname]});
      return route.continue();
    }
    if(['fonts.googleapis.com','fonts.gstatic.com','cdn.jsdelivr.net'].includes(u.hostname))return route.continue();
    if(u.hostname.endsWith('.supabase.co'))return route.fulfill({json:[],headers:{'access-control-allow-origin':'*'}});
    return route.abort();
  });
  await page.goto('http://127.0.0.1:8080',{waitUntil:'networkidle'});
  await page.waitForFunction(s=>document.querySelector('#home')?.dataset.homeState===s,state);
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:path.join(output,name+'-viewport.png')});
  await page.locator('#home').screenshot({path:path.join(output,name+'-homepage.png')});
  const metrics=await page.evaluate(()=>{
    const rect=s=>{const n=document.querySelector(s),r=n.getBoundingClientRect();return {top:r.top+scrollY,height:r.height,width:r.width};};
    const standings=[...document.querySelectorAll('.week-standings-wrap')].map(n=>({
      clientWidth:n.clientWidth,scrollWidth:n.scrollWidth,scrollable:n.scrollWidth>n.clientWidth+1,
      overflowX:getComputedStyle(n).overflowX
    }));
    return {theme:document.documentElement.dataset.theme,state:document.querySelector('#home').dataset.homeState,viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,
      pageOverflow:document.documentElement.scrollWidth>innerWidth+1,
      standingsScroll:standings,
      sections:Object.fromEntries(['.hero','#weekBoard','#homeWeeklyFeature','#homeSeasonPrep','#championshipOdds','.home-band-now','.home-band-story','.home-band-archive','.orientation-panel'].map(s=>[s,rect(s)])),
      unexpectedOverflow:[...document.querySelectorAll('#home *')].filter(n=>{const r=n.getBoundingClientRect();return r.width&&r.right>innerWidth+1&&!n.closest('.week-standings-wrap')}).map(n=>({tag:n.tagName,class:n.className,text:n.textContent.slice(0,90)})),
      teamNames:[...document.querySelectorAll('.week-game-side strong')].map(n=>({text:n.textContent,width:n.clientWidth,scrollWidth:n.scrollWidth,height:n.clientHeight}))};
  });
  const anchors=[];
  for(const selector of ['[data-home-primary]','.hero [data-scroll-to="championshipOdds"]']){
    await page.locator(selector).click();
    await page.waitForTimeout(800); // let the user-facing smooth scroll settle
    anchors.push(await page.locator(selector).evaluate(button=>{
      const target=document.getElementById(button.dataset.scrollTo),r=target.getBoundingClientRect();
      return {target:target.id,top:r.top,headerBottom:document.querySelector('.topbar').getBoundingClientRect().bottom,visibleHeading:r.top>=document.querySelector('.topbar').getBoundingClientRect().bottom};
    }));
  }
  await page.addScriptTag({path:path.join(process.env.QA_NODE_MODULES,'axe-core/axe.min.js')});
  const a11y=await page.evaluate(async()=>{const r=await axe.run('#home',{runOnly:{type:'rule',values:['color-contrast']}});return {violations:r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:r.incomplete.map(v=>({id:v.id,count:v.nodes.length}))};});
  let draftArchive=null;
  if(state==='offseason'&&width===1440&&theme==='light'){
    await page.locator('[data-home-draft]').click();
    await page.waitForFunction(()=>document.getElementById('history')?.classList.contains('active'));
    draftArchive=await page.evaluate(()=>({
      historyActive:document.getElementById('history')?.classList.contains('active')||false,
      historyTab:document.getElementById('history')?.dataset.historyTab||null,
      draftTabActive:document.querySelector('[data-history-tab="drafts"]')?.classList.contains('active')||false,
      draftPanelActive:document.querySelector('[data-history-panel="drafts"]')?.classList.contains('active')||false
    }));
  }
  report.cases.push({name,metrics,anchors,a11y,draftArchive,errors});
  writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(name,JSON.stringify({pageOverflow:metrics.pageOverflow,standingsScroll:metrics.standingsScroll,anchors,contrastNodes:a11y.violations.reduce((a,v)=>a+v.nodes.length,0),draftArchive,errors}));
  await context.close();
 }
 const failures=[];
 for(const item of report.cases){
   if(item.errors.length)failures.push(`${item.name}: page errors: ${item.errors.join(' | ')}`);
   if(item.metrics.pageOverflow)failures.push(`${item.name}: page-level horizontal overflow (${item.metrics.scrollWidth}px > ${item.metrics.viewport}px)`);
   if(item.a11y.violations.length)failures.push(`${item.name}: accessibility violations: ${item.a11y.violations.map(v=>v.id).join(', ')}`);
   if(item.draftArchive&&(!item.draftArchive.historyActive||item.draftArchive.historyTab!=='drafts'||!item.draftArchive.draftTabActive||!item.draftArchive.draftPanelActive)){
     failures.push(`${item.name}: Draft archive did not open the Drafts history panel`);
   }
 }
 report.failures=failures;
 writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
 if(failures.length)throw new Error(`Visual QA failed:\n- ${failures.join('\n- ')}`);
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
