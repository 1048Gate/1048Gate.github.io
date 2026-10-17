// Local built-site / intercepted-fixture QA only. axe must already be loaded.
const assert=require('node:assert/strict');
async function checkPlayoffAccessibility(page){
  const audit=await page.evaluate(async()=>{
    const result=await axe.run('#deskPlayoff',{runOnly:{type:'rule',values:['scrollable-region-focusable']}});
    return {violations:result.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),incomplete:result.incomplete.map(v=>v.id)};
  });
  assert.deepEqual(audit.violations,[],'Playoff Race must pass scrollable-region-focusable');
  assert.deepEqual(audit.incomplete,[],'Scroll accessibility must be evaluated conclusively');
  const region=page.getByRole('region',{name:'Playoff race standings',exact:true});
  await region.scrollIntoViewIfNeeded();
  const dimensions=await region.evaluate(el=>{
    const table=el.querySelector('table');
    return {client:el.clientWidth,scroll:el.scrollWidth,columns:table.rows[0].cells.length,rows:table.tBodies[0].rows.length,tableDisplay:getComputedStyle(table).display};
  });
  assert.equal(dimensions.columns,7);assert.equal(dimensions.rows,12);
  assert.equal(dimensions.tableDisplay,'table','Keep semantic table layout; the wrapper must scroll');
  // Enter through the preceding real Tab stop, not a synthetic keyboard handler.
  await region.evaluate(el=>{
    const candidates=[...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')].filter(n=>n.tabIndex>=0&&!n.disabled&&n.getClientRects().length);
    const previous=candidates[candidates.indexOf(el)-1];
    if(!previous)throw new Error('Missing preceding Tab stop');
    previous.focus();
  });
  // Chromium can add implicit Tab stops for other scroll regions in between.
  for(let tabs=0;tabs<10&&!await region.evaluate(el=>document.activeElement===el);tabs++)await page.keyboard.press('Tab');
  assert.equal(await region.evaluate(el=>document.activeElement===el),true,'Tab must reach the scroll region');
  const focus=await region.evaluate(el=>{
    let surface=el;
    while(surface&&getComputedStyle(surface).backgroundColor==='rgba(0, 0, 0, 0)')surface=surface.parentElement;
    return {style:getComputedStyle(el).outlineStyle,width:parseFloat(getComputedStyle(el).outlineWidth),color:getComputedStyle(el).outlineColor,background:getComputedStyle(surface).backgroundColor};
  });
  const luminance=color=>color.match(/[\d.]+/g).slice(0,3).map(Number).map(value=>{value/=255;return value<=.04045?value/12.92:((value+.055)/1.055)**2.4;}).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
  const ink=luminance(focus.color),paper=luminance(focus.background);
  focus.contrast=(Math.max(ink,paper)+.05)/(Math.min(ink,paper)+.05);
  assert.ok(focus.contrast>=3,'Keyboard focus must contrast with its background');
  assert.notEqual(focus.style,'none');assert.ok(focus.width>=2,'Visible keyboard focus required');
  if(dimensions.scroll>dimensions.client+1){
    await region.evaluate(el=>{el.scrollLeft=0;});
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(()=>document.querySelector('[aria-label="Playoff race standings"]').scrollLeft>0);
  }
  await page.keyboard.press('Tab');
  assert.equal(await region.evaluate(el=>document.activeElement===el),false,'Tab must exit without a trap');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await region.evaluate(el=>document.activeElement===el),true,'Shift+Tab must return');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'No page-wide horizontal overflow');
  return {width:page.viewportSize().width,...dimensions,focus,keyboard:'Tab / exit / Shift+Tab passed',arrowScroll:dimensions.scroll>dimensions.client+1?'ArrowRight passed':'not applicable: no overflow',axe:audit};
}
module.exports={checkPlayoffAccessibility};

if(require.main===module){
  const path=require('node:path');
  const {chromium}=require(path.join(process.env.QA_NODE_MODULES,'playwright'));
  (async()=>{
    const url=new URL(process.env.QA_BASE_URL||'http://127.0.0.1:8080');
    assert.ok(['127.0.0.1','localhost'].includes(url.hostname),'QA must use a local built site');
    const browser=await chromium.launch({headless:true,...(process.env.QA_CHROMIUM_EXECUTABLE?{executablePath:process.env.QA_CHROMIUM_EXECUTABLE,args:['--no-sandbox']}:{})});
    try{for(const width of [320,390,768,1440])for(const theme of ['light','dark']){
      const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});
      await page.addInitScript(theme=>localStorage.setItem('1048-gate-theme',theme),theme);
      await page.route('**/*',route=>new URL(route.request().url()).hostname===url.hostname?route.continue():route.abort());
      await page.goto(url.href,{waitUntil:'networkidle'});
      await page.addScriptTag({path:path.join(process.env.QA_NODE_MODULES,'axe-core/axe.min.js')});
      console.log(JSON.stringify({theme,...await checkPlayoffAccessibility(page)}));
      await page.close();
    }}finally{await browser.close();}
  })().catch(error=>{console.error(error);process.exitCode=1;});
}
