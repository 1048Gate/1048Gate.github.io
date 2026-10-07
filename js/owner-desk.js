(async function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = window.gateShared.escapeHtml;
  const status = $('ownerStatus'), content = $('ownerContent');
  let client, generation = 0, selection = 0, snapshot = null, authorized = false, snapshots = [], offset = 0;
  function clear(){
    authorized = false; snapshot = null; selection++;
    content.hidden = true; $('ownerData').replaceChildren(); $('snapshotJson').textContent = '';
    $('snapshotSummary').textContent = ''; $('snapshotSelect').replaceChildren(); $('teamSelect').replaceChildren();
    $('downloadSnapshot').disabled = true;
  }
  const stamp = value => new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'}).format(new Date(value)) + ' ET';
  async function authorize(session){
    const token = ++generation;
    clear();
    if(!session){status.textContent = 'Sign in with your owner account to view saved data.'; return;}
    status.textContent = 'Checking owner access…';
    const {data,error} = await client.from('fantasy_owner_access').select('user_id').eq('user_id',session.user.id).maybeSingle();
    if(token !== generation) return;
    if(error){status.textContent = 'Owner access could not be checked. Try signing in again.'; return;}
    if(!data){status.textContent = 'This account does not have access to the Owner Desk.'; return;}
    authorized = true; content.hidden = false;
    await loadSnapshots(token);
  }
  async function loadSnapshots(token = generation, older = false){
    if(!authorized) return;
    const {data,error} = await client.from('fantasy_snapshots').select('id,season,week,fetched_at').order('fetched_at',{ascending:false}).range(older ? offset : 0,(older ? offset : 0)+99);
    if(token !== generation) return;
    if(error){status.textContent = 'Saved data could not load. Please try Refresh.'; return;}
    const previous = $('snapshotSelect').value;
    snapshots = older ? [...snapshots,...data] : data; offset = snapshots.length;
    $('olderSnapshots').hidden = data.length < 100;
    $('snapshotSelect').replaceChildren(...snapshots.map(row => new Option(`${row.season} · Week ${row.week} · ${stamp(row.fetched_at)}`,row.id)));
    if(snapshots.some(row => row.id === previous)) $('snapshotSelect').value = previous;
    status.textContent = data.length || snapshots.length ? 'Owner access verified.' : 'Owner access verified. Your first ESPN snapshot will appear after the collector runs.';
    if(!snapshots.length){snapshot = null; $('ownerData').replaceChildren(); $('snapshotJson').textContent = ''; $('downloadSnapshot').disabled = true; return;}
    await selectSnapshot();
  }
  async function selectSnapshot(){
    const token = generation, chosen = ++selection, id = $('snapshotSelect').value;
    snapshot = null; $('downloadSnapshot').disabled = true; $('ownerData').replaceChildren(); $('snapshotJson').textContent = '';
    const {data,error} = await client.from('fantasy_snapshots').select('payload').eq('id',id).maybeSingle();
    if(token !== generation || chosen !== selection || !authorized) return;
    if(error || !data){status.textContent = 'That snapshot could not load. Please try Refresh.'; return;}
    snapshot = data.payload;
    $('snapshotSummary').textContent = `${snapshot.season} · Week ${snapshot.week} · Saved ${stamp(snapshot.fetched_at)} · ${(snapshot.teams || []).length} teams · ${(snapshot.available_players || []).length} available players`;
    $('teamSelect').replaceChildren(...(snapshot.teams || []).map(team => new Option(team.name,team.id)));
    // Default to the ESPN team id recorded for Collin in the checked-in league archive.
    if((snapshot.teams || []).some(team => String(team.id) === '10')) $('teamSelect').value = '10';
    $('snapshotJson').textContent = JSON.stringify(snapshot,null,2); $('downloadSnapshot').disabled = false; render();
  }
  function render(){
    if(!snapshot || !authorized) return;
    const kind = $('datasetSelect').value;
    $('teamSelect').disabled = kind !== 'roster'; $('playerSearch').disabled = kind === 'scoring';
    if(kind === 'scoring'){
      const pre = document.createElement('pre'); pre.textContent = JSON.stringify(snapshot.settings,null,2); $('ownerData').replaceChildren(pre); return;
    }
    const team = (snapshot.teams || []).find(row => String(row.id) === $('teamSelect').value);
    const rows = (kind === 'available' ? snapshot.available_players : team?.roster) || [];
    const query = $('playerSearch').value.toLowerCase();
    const filtered = rows.filter(player => player.name.toLowerCase().includes(query));
    $('ownerData').innerHTML = `<table><caption>${esc(kind === 'available' ? 'Available players' : team?.name || 'Roster')} · ${filtered.length} players</caption><thead><tr><th>Player</th><th>Pos</th><th>${kind === 'available' ? 'Availability' : 'Lineup'}</th><th>Status</th><th class="num">ESPN proj.</th><th class="num">Owned %</th></tr></thead><tbody>${filtered.map(player => `<tr><td>${esc(player.name)}</td><td>${esc(player.position)}</td><td>${esc(kind === 'available' ? player.availability : player.lineup_slot)}</td><td>${esc(player.injury_status || '—')}</td><td class="num">${player.projected_points == null ? '—' : esc(Number(player.projected_points).toFixed(2))}</td><td class="num">${player.percent_owned == null ? '—' : esc(Number(player.percent_owned).toFixed(1))}</td></tr>`).join('') || '<tr><td colspan="6">No matching players.</td></tr>'}</tbody></table>`;
  }
  $('snapshotSelect').addEventListener('change',selectSnapshot);
  for(const id of ['teamSelect','datasetSelect','playerSearch']) $(id).addEventListener(id === 'playerSearch' ? 'input' : 'change',render);
  $('refreshSnapshots').addEventListener('click',() => loadSnapshots());
  $('olderSnapshots').addEventListener('click',() => loadSnapshots(generation,true));
  $('downloadSnapshot').addEventListener('click',() => {
    if(!authorized || !snapshot) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)+'\n'],{type:'application/json'}));
    const link = document.createElement('a'); link.href = url; link.download = `1048gate-${snapshot.season}-week-${snapshot.week}-${snapshot.fetched_at.replace(/[^0-9]/g,'')}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  });
  // Clear private DOM synchronously on logout; ignore requests started under older sessions.
  window.addEventListener('gate-auth-changed',event => { if(client) authorize(event.detail.session); });
  client = await window.gateSupabaseReady;
  if(!client){status.textContent = 'Sign-in is temporarily unavailable. Please reload.'; return;}
  const token = generation;
  const {data:{session}} = await client.auth.getSession();
  if(token === generation) await authorize(session);
})();
