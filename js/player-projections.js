(async function(){
  const $ = id => document.getElementById(id), esc = window.gateShared.escapeHtml;
  let players = [];
  function render(){
    const query = $('projectionSearch').value.toLowerCase(), position = $('projectionPosition').value;
    const rows = players.filter(player => (!position || player.position === position) && player.name.toLowerCase().includes(query));
    $('projectionTable').innerHTML = `<table><caption>${rows.length} players · highest projection first</caption><thead><tr><th>Player</th><th>Position</th><th>Status</th><th class="num">Projected points</th></tr></thead><tbody>${rows.map(player => `<tr><td>${esc(player.name)}</td><td>${esc(player.position)}</td><td>${esc(player.injury_status || '—')}</td><td class="num">${player.projected_points == null ? '—' : esc(Number(player.projected_points).toFixed(2))}</td></tr>`).join('') || '<tr><td colspan="4">No matching players.</td></tr>'}</tbody></table>`;
  }
  $('projectionSearch').addEventListener('input',render); $('projectionPosition').addEventListener('change',render);
  try{
    const response = await fetch('/data/player-projections.json',{cache:'no-cache'});
    if(!response.ok) throw new Error('Unavailable');
    const data = await response.json();
    if(!Array.isArray(data.players) || !data.players.length){$('projectionStatus').textContent = 'Weekly projections will appear after the first ESPN refresh.'; return;}
    players = [...data.players].sort((a,b) => (b.projected_points ?? -999) - (a.projected_points ?? -999));
    const stamp = new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'}).format(new Date(data.fetched_at));
    const age = Date.now() - new Date(data.fetched_at).getTime();
    $('projectionStatus').textContent = `${data.season} · Week ${data.week} · ESPN · Updated ${stamp} ET${age > 24*3600*1000 ? ' · Saved snapshot is over 24 hours old.' : ''}`;
    render();
  }catch{$('projectionStatus').textContent = 'Projections are temporarily unavailable. Please try again shortly.';}
})();
