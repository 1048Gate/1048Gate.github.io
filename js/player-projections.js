(async function(){
  const $ = id => document.getElementById(id), esc = window.gateShared.escapeHtml;
  try{
    const response = await fetch('/data/current-season.json',{cache:'no-store'});
    if(!response.ok)throw new Error('Unavailable');
    const data = await response.json();
    if(!Array.isArray(data.teamProjections) || !data.teamProjections.length){$('projectionStatus').textContent='Weekly team projections will appear after the next ESPN refresh.';return;}
    const stamp = new Date(data.projectionsFetchedAt);
    const updated = new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'}).format(stamp);
    $('projectionStatus').textContent=`${data.season} · Week ${data.week} · ESPN · Updated ${updated} ET${Date.now()-stamp.getTime()>24*3600*1000?' · Saved snapshot is over 24 hours old.':''}`;
    const rows=[...data.teamProjections].sort((a,b)=>(b.projectedScore??-999)-(a.projectedScore??-999));
    $('projectionTable').innerHTML=`<table><caption>Current starters · ${rows.length} teams</caption><thead><tr><th>Team</th><th>Manager</th><th class="num">Projected points</th></tr></thead><tbody>${rows.map(row=>{const team=(data.standings||[]).find(t=>String(t.teamId)===String(row.teamId));return `<tr><td>${esc(team?.team||'Team')}</td><td>${esc(team?.owner||'')}</td><td class="num">${row.projectedScore==null?'—':esc(Number(row.projectedScore).toFixed(2))}</td></tr>`;}).join('')}</tbody></table><p>Totals require a complete starting lineup and all starter projections. Player projections are available in Owner Desk.</p>`;
  }catch{$('projectionStatus').textContent='Team projections are temporarily unavailable. Please try again shortly.';}
})();
