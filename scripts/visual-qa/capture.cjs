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
  await context.addInitScript(t=>{localStorage.setItem('1048-gate-theme',t);localStorage.removeItem('1048-gate-current-week-v1')},theme);
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const board=json('data/current-season.json'),config=json('data/site.json'),index=json('data/newspaper_editions/index.json');
  const homepage=json('data/homepage-week.json');
  const entry=index.editions.find(e=>e.season===board.season&&e.week===board.week);
  const edition=json(entry.path);
  if(state==='live'){
    board.matchups.forEach(g=>{g.state='live';g.winner='UNDECIDED'});
    board.note='QA fixture: live week; scores retained from checked-in snapshot.';
    homepage.matchups=board.matchups;homepage.status='live';homepage.note=board.note;
    if(homepage.featured_story){homepage.featured_story.status='live';homepage.featured_story.source_status='verified_live';}
    edition.source_status=entry.source_status='verified_live';edition.status='live';
  }
  if(state==='recap'){
    board.matchups.forEach(g=>g.state='final');board.note='QA fixture: finalized week; scores retained from checked-in snapshot.';
    homepage.matchups=board.matchups;homepage.status='final';homepage.note=board.note;
    if(homepage.featured_story){homepage.featured_story.status='final';homepage.featured_story.source_status='verified_final';}
    edition.source_status=entry.source_status='verified_final';edition.status='final';
    edition.headline=`Week ${board.week} final — visual QA fixture`;
    edition.standfirst='Representative finalized-week layout. These are test fixtures, not newly published league results.';
  }
  if(state==='offseason'){
    config.phase='Offseason';
    homepage.phase='Offseason';
    homepage.status='offseason';
    homepage.league_pulse=[];
  }
  const exerciseFallbacks=state==='live'&&width===1440&&theme==='light';
  const exerciseArchiveFailure=width===1440&&theme==='dark';
  if(exerciseArchiveFailure) homepage.league_pulse=[];
  const fixtures={'/data/site.json':config,'/data/current-season.json':board,'/data/homepage-week.json':homepage,'/data/newspaper_editions/index.json':index,['/'+entry.path]:edition};
  let forceWeekFailure=exerciseFallbacks;
  await page.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.hostname==='127.0.0.1'){
      if((u.pathname==='/data/current-season.json'||u.pathname==='/data/homepage-week.json')&&forceWeekFailure)return route.fulfill({status:503,body:'unavailable'});
      if(u.pathname==='/data/matchups.json'&&exerciseArchiveFailure)return route.fulfill({status:503,body:'unavailable'});
      if(fixtures[u.pathname])return route.fulfill({json:fixtures[u.pathname]});
      return route.continue();
    }
    if(['fonts.googleapis.com','fonts.gstatic.com','cdn.jsdelivr.net'].includes(u.hostname))return route.continue();
    if(u.hostname.endsWith('.supabase.co'))return route.fulfill({json:[],headers:{'access-control-allow-origin':'*'}});
    return route.abort();
  });
  await page.goto('http://127.0.0.1:8080',{waitUntil:'networkidle'});
  let noCacheFallback=null;
  if(exerciseFallbacks){
    await page.waitForFunction(()=>document.getElementById('weekBoard')?.dataset.weekSource==='saved');
    noCacheFallback=await page.evaluate(()=>({
      source:document.getElementById('weekBoard')?.dataset.weekSource,
      cards:document.querySelectorAll('#weekBoard .week-card').length,
      standings:document.querySelectorAll('#weekBoard .week-standings-table tbody tr').length,
      status:document.querySelector('[data-week-stamp]')?.textContent||'',
      pulseSource:document.getElementById('leaguePulse')?.dataset.pulseSource,
      pulseStatus:document.querySelector('[data-pulse-status]')?.textContent||'',
      pulseCards:document.querySelectorAll('#leaguePulse [data-pulse-card]').length,
      ok:document.getElementById('weekBoard')?.dataset.weekSource==='saved'
        && document.querySelectorAll('#weekBoard .week-card').length===6
        && document.querySelectorAll('#weekBoard .week-standings-table tbody tr').length===12
        && document.querySelector('[data-week-stamp]')?.textContent.includes('ESPN snapshot')
        && document.getElementById('leaguePulse')?.dataset.pulseSource==='saved'
        && document.querySelector('[data-pulse-status]')?.textContent.includes('Saved league read')
        && document.querySelectorAll('#leaguePulse [data-pulse-card]').length===6
    }));
    forceWeekFailure=false;
    await page.evaluate(()=>renderWeekBoard());
  }
  await page.waitForFunction(s=>document.querySelector('#home')?.dataset.homeState===s,state);
  let archiveFallback=null;
  if(exerciseArchiveFailure){
    const expected=state==='offseason'?5:6;
    await page.waitForFunction(count=>document.querySelectorAll('#leaguePulse [data-pulse-card]').length===count,expected);
    archiveFallback=await page.evaluate(expected=>{
      const record=document.querySelector('[data-pulse-card="record"]');
      const streak=document.querySelector('[data-pulse-card="streak"]');
      const labels=[record?.querySelector('span')?.textContent,streak?.querySelector('span')?.textContent];
      const links=[record?.querySelector('[data-view-link="intel"]'),streak?.querySelector('[data-view-link="intel"]')];
      const cards=document.querySelectorAll('#leaguePulse [data-pulse-card]').length;
      return {cards,labels,bookLinks:links.filter(Boolean).length,ok:cards===expected&&labels[0]==='Record book'&&labels[1]==='Streak history'&&links.every(Boolean)};
    },expected);
  }
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:path.join(output,name+'-viewport.png')});
  await page.locator('#home').screenshot({path:path.join(output,name+'-homepage.png')});
  const metrics=await page.evaluate(()=>{
    const rect=s=>{const n=document.querySelector(s),r=n.getBoundingClientRect();return {top:r.top+scrollY,height:r.height,width:r.width};};
    const standings=[...document.querySelectorAll('.week-standings-wrap')].map(n=>({
      clientWidth:n.clientWidth,scrollWidth:n.scrollWidth,scrollable:n.scrollWidth>n.clientWidth+1,
      overflowX:getComputedStyle(n).overflowX
    }));
    const pulse=document.getElementById('leaguePulse');
    return {theme:document.documentElement.dataset.theme,state:document.querySelector('#home').dataset.homeState,viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,
      pageOverflow:document.documentElement.scrollWidth>innerWidth+1,
      leaguePulse:{present:!!pulse,source:pulse?.dataset.pulseSource||'',cards:pulse?.querySelectorAll('[data-pulse-card]').length||0},
      standingsScroll:standings,
      sections:Object.fromEntries(['.hero','#weekBoard','#homeWeeklyFeature','#homeSeasonPrep','#championshipOdds','#leaguePulse','.home-band-now','.home-band-story','.home-band-archive','.orientation-panel'].map(s=>[s,rect(s)])),
      unexpectedOverflow:[...document.querySelectorAll('#home *')].filter(n=>{const r=n.getBoundingClientRect();return r.width&&r.right>innerWidth+1&&!n.closest('.week-standings-wrap,.league-pulse-rail')}).map(n=>({tag:n.tagName,class:n.className,text:n.textContent.slice(0,90)})),
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
  let navigation=null;
  if(state==='live'&&theme==='light'){
    if(width===1440){
      await page.locator('#tabs [data-view="newspaper"]').click();
      await page.waitForFunction(()=>document.getElementById('office')?.classList.contains('active')&&!document.querySelector('[data-office-panel="newspaper"]')?.hidden);
      const newspaper=await page.evaluate(()=>({
        hash:location.hash,
        primaryActive:document.querySelector('#tabs [data-view="newspaper"]')?.classList.contains('active')||false,
        moreActive:document.querySelector('#tabs [data-more-toggle]')?.classList.contains('active')||false
      }));
      await page.locator('#tabs [data-more-toggle]').click();
      await page.waitForFunction(()=>document.getElementById('phoneMore')?.hidden===false);
      const moreOpen=await page.evaluate(()=>({
        expanded:document.querySelector('#tabs [data-more-toggle]')?.getAttribute('aria-expanded'),
        visible:document.getElementById('phoneMore')?.hidden===false
      }));
      await page.locator('#phoneMore [data-view="intel"]').click();
      await page.waitForFunction(()=>document.getElementById('intel')?.classList.contains('active'));
      const book=await page.evaluate(()=>({
        hash:location.hash,
        moreActive:document.querySelector('#tabs [data-more-toggle]')?.classList.contains('active')||false,
        sheetClosed:document.getElementById('phoneMore')?.hidden===true
      }));
      navigation={mode:'desktop',newspaper,moreOpen,book,
        ok:newspaper.hash==='#newspaper'&&newspaper.primaryActive&&!newspaper.moreActive&&moreOpen.expanded==='true'&&moreOpen.visible&&book.hash==='#intel'&&book.moreActive&&book.sheetClosed};
    }else{
      await page.locator('#phoneDock [data-more-toggle]').click();
      await page.waitForFunction(()=>document.getElementById('phoneMore')?.hidden===false);
      const menu=await page.evaluate(()=>({
        expanded:document.querySelector('#phoneDock [data-more-toggle]')?.getAttribute('aria-expanded'),
        newspaperVisible:!!document.querySelector('#phoneMore .nav-more-phone-only[data-view="newspaper"]')?.getClientRects().length
      }));
      await page.locator('#phoneMore .nav-more-phone-only[data-view="newspaper"]').click();
      await page.waitForFunction(()=>document.getElementById('office')?.classList.contains('active')&&!document.querySelector('[data-office-panel="newspaper"]')?.hidden);
      const newspaper=await page.evaluate(()=>({
        hash:location.hash,
        moreActive:document.querySelector('#phoneDock [data-more-toggle]')?.classList.contains('active')||false,
        sheetClosed:document.getElementById('phoneMore')?.hidden===true
      }));
      navigation={mode:'mobile',menu,newspaper,
        ok:menu.expanded==='true'&&menu.newspaperVisible&&newspaper.hash==='#newspaper'&&newspaper.moreActive&&newspaper.sheetClosed};
    }
    await page.evaluate(()=>{
      window.switchView('home',{updateHash:false,scroll:false});
      history.replaceState({view:'home'},'', '#home');
    });
    await page.waitForFunction(()=>document.getElementById('home')?.classList.contains('active'));
  }
  let cachedFallback=null;
  if(exerciseFallbacks){
    forceWeekFailure=true;
    await page.evaluate(()=>renderWeekBoard());
    await page.waitForFunction(()=>document.getElementById('weekBoard')?.dataset.weekSource==='saved');
    await page.waitForFunction(()=>document.getElementById('leaguePulse')?.dataset.pulseSource==='saved');
    cachedFallback=await page.evaluate(()=>({
      source:document.getElementById('weekBoard')?.dataset.weekSource,
      cards:document.querySelectorAll('#weekBoard .week-card').length,
      status:document.querySelector('[data-week-stamp]')?.textContent||'',
      pulseSource:document.getElementById('leaguePulse')?.dataset.pulseSource,
      pulseStatus:document.querySelector('[data-pulse-status]')?.textContent||'',
      pulseCards:document.querySelectorAll('#leaguePulse [data-pulse-card]').length,
      ok:document.getElementById('weekBoard')?.dataset.weekSource==='saved'
        && document.querySelectorAll('#weekBoard .week-card').length===6
        && document.querySelector('[data-week-stamp]')?.textContent.includes('ESPN snapshot')
        && document.getElementById('leaguePulse')?.dataset.pulseSource==='saved'
        && document.querySelector('[data-pulse-status]')?.textContent.includes('Saved league read')
        && document.querySelectorAll('#leaguePulse [data-pulse-card]').length===6
    }));
  }
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
  report.cases.push({name,metrics,anchors,a11y,navigation,noCacheFallback,cachedFallback,archiveFallback,draftArchive,errors:[...errors]});
  writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(name,JSON.stringify({pageOverflow:metrics.pageOverflow,standingsScroll:metrics.standingsScroll,anchors,contrastNodes:a11y.violations.reduce((a,v)=>a+v.nodes.length,0),draftArchive,errors}));
  if(state==='live'){
    for(const view of ['league','history','newspaper','transactions','rules']){
      const errorStart=errors.length;
      await page.evaluate(v=>window.switchView(v,{scroll:false}),view);
      await page.waitForLoadState('networkidle');
      // Finish navigation's smooth header scroll, then capture the top of the view.
      await page.waitForTimeout(600);
      await page.evaluate(()=>window.scrollTo({top:0,left:0,behavior:'instant'}));
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.screenshot({path:path.join(output,`${name}-${view}.png`)});
      const layout=await page.evaluate(()=>({pageOverflow:document.documentElement.scrollWidth>innerWidth+1,heading:[...document.querySelectorAll('.view.active .section-title h2')].filter(n=>n.getBoundingClientRect().height).map(n=>({text:n.textContent,size:getComputedStyle(n).fontSize}))}));
      const a11y=await page.evaluate(async()=>{const r=await axe.run('.view.active',{runOnly:{type:'rule',values:['color-contrast']}});return {violations:r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:r.incomplete.map(v=>({id:v.id,count:v.nodes.length}))};});
      const viewErrors=errors.slice(errorStart);
      (report.secondaryViews ||= []).push({name,view,...layout,a11y,errors:viewErrors});
      console.log(`${name}-${view}`,JSON.stringify({pageOverflow:layout.pageOverflow,contrastNodes:a11y.violations.reduce((a,v)=>a+v.nodes.length,0),errors:viewErrors}));
    }
    writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  }
  await context.close();
 }
 const failures=[];
 for(const item of report.cases){
   if(item.errors.length)failures.push(`${item.name}: page errors: ${item.errors.join(' | ')}`);
   if(item.metrics.pageOverflow)failures.push(`${item.name}: page-level horizontal overflow (${item.metrics.scrollWidth}px > ${item.metrics.viewport}px)`);
   if(item.a11y.violations.length)failures.push(`${item.name}: accessibility violations: ${item.a11y.violations.map(v=>v.id).join(', ')}`);
   const expectedPulseCards=item.name.startsWith('offseason-')?5:6;
   if(!item.metrics.leaguePulse.present||item.metrics.leaguePulse.source!=='current'||item.metrics.leaguePulse.cards!==expectedPulseCards){
     failures.push(`${item.name}: League Pulse did not render ${expectedPulseCards} current cards`);
   }
   if(item.navigation&&!item.navigation.ok)failures.push(`${item.name}: Phase 4 navigation interaction failed`);
   if(item.noCacheFallback&&!item.noCacheFallback.ok)failures.push(`${item.name}: Phase 5 checked-in fallback failed`);
   if(item.cachedFallback&&!item.cachedFallback.ok)failures.push(`${item.name}: Phase 5 cached fallback failed`);
   if(item.archiveFallback&&!item.archiveFallback.ok)failures.push(`${item.name}: Phase 6 archive fallback failed`);
   if(item.draftArchive&&(!item.draftArchive.historyActive||item.draftArchive.historyTab!=='drafts'||!item.draftArchive.draftTabActive||!item.draftArchive.draftPanelActive)){
     failures.push(`${item.name}: Draft archive did not open the Drafts history panel`);
   }
 }
 for(const item of report.secondaryViews || []){
   const name=`${item.name}-${item.view}`;
   if(item.errors.length)failures.push(`${name}: page errors: ${item.errors.join(' | ')}`);
   if(item.pageOverflow)failures.push(`${name}: page-level horizontal overflow`);
   if(item.a11y.violations.length)failures.push(`${name}: accessibility violations: ${item.a11y.violations.map(v=>v.id).join(', ')}`);
 }
 report.failures=failures;
 writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
 if(failures.length)throw new Error(`Visual QA failed:\n- ${failures.join('\n- ')}`);
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
