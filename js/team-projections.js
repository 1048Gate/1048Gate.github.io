(function(){
  const esc = window.gateShared.escapeHtml;
  const points = value => value == null ? '—' : Number(value).toFixed(2);
  function teamHtml(board, name){
    const standing = (board.standings || []).find(team => team.owner === name);
    const team = (board.teamProjections || []).find(team => String(team.teamId) === String(standing?.teamId));
    if(!team) return '<p>Current-week team projections are unavailable.</p>';
    const stamp = new Date(board.projectionsFetchedAt);
    const updated = Number.isNaN(stamp.getTime()) ? '' : stamp.toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
    const stale = !Number.isNaN(stamp.getTime()) && Date.now() - stamp.getTime() > 24*3600*1000;
    return `<h3>Week ${esc(board.week)} · Team projection</h3><p><strong>${points(team.projectedScore)} projected points</strong>${team.complete ? '' : ' · Incomplete lineup or missing player projections'}</p><p>${esc(standing.team)} · ESPN league scoring${updated ? ` · Updated ${esc(updated)} ET` : ''}${stale ? ' · Saved snapshot is over 24 hours old' : ''}</p><p>Total based on current starters. Projections are estimates; matchup cards show actual scores once games go live.</p>`;
  }
  window.gateTeamProjections = Object.freeze({teamHtml});
  document.addEventListener('click',event => {
    const button = event.target.closest?.('[data-team-owner]');
    if(button?.dataset.teamOwner) window.gateMembers?.open(button.dataset.teamOwner);
  });
  let generation = 0;
  document.addEventListener('gate:member-profile-opened',async event => {
    const name = event.detail?.name;
    const current = ++generation;
    let node = document.getElementById('teamProjectionDetails');
    if(!node){
      const summary = document.getElementById('careerSummary');
      if(!summary)return;
      node = document.createElement('section');node.id='teamProjectionDetails';node.className='team-projection-section';
      summary.insertAdjacentElement('beforebegin',node);
    }
    node.innerHTML = '<p>Loading current-week projections…</p>';
    try{
      const response = await fetch('data/current-season.json',{cache:'no-store'});
      if(!response.ok)throw new Error('Board unavailable');
      const board = await response.json();
      if(current !== generation || document.getElementById('memberModalName')?.textContent !== name)return;
      node.innerHTML = teamHtml(board,name);
    }catch{
      if(current === generation)node.innerHTML='<p>Current-week projections are temporarily unavailable.</p>';
    }
  });
})();
