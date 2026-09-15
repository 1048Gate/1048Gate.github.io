(function(){
  const panel=document.querySelector('#history [data-history-panel="records"]');
  if(!panel)return;
  const {escapeHtml:esc,formatNumber}=window.gateShared;
  const num=value=>formatNumber(value,1,2);
  const load=path=>fetch(path,{cache:'no-store'}).then(response=>{if(!response.ok)throw new Error(`${path} returned HTTP ${response.status}`);return response.json();});

  function scoreList(title,eyebrow,scope,rows){
    return `<section class="score-leaderboard"><div class="score-leaderboard-head"><div><span>${esc(eyebrow)}</span><h4>${esc(title)}</h4></div><small>${esc(scope)}</small></div><ol>${rows.map((row,index)=>{const playoff=row[7]?' · Playoffs':'';return `<li><span class="score-rank">${String(index+1).padStart(2,'0')}</span><div class="score-performance"><strong>${esc(row[1])}</strong><span>${esc(row[2])}</span><small>vs ${esc(row[3])} · ${esc(row[5])} W${esc(row[6])}${playoff}</small></div><b>${esc(num(row[0]))}</b></li>`;}).join('')}</ol></section>`;
  }
  function gameList(title,scope,rows,kind){
    return `<section class="score-leaderboard"><div class="score-leaderboard-head"><div><span>TOP THREE</span><h4>${esc(title)}</h4></div><small>${esc(scope)}</small></div><ol>${rows.map((row,index)=>{const value=kind==='combined'?`${num(row[0])} total`:`${num(row[0])} pts`;const playoff=row[9]?' · Playoffs':'';return `<li><span class="score-rank">${String(index+1).padStart(2,'0')}</span><div class="score-performance"><strong>${esc(row[1])} ${esc(num(row[3]))} – ${esc(row[4])} ${esc(num(row[6]))}</strong><span>${esc(row[2])} vs ${esc(row[5])}</span><small>${esc(row[7])} W${esc(row[8])}${playoff}</small></div><b>${esc(value)}</b></li>`;}).join('')}</ol></section>`;
  }
  function streakList(title,scope,rows,label){
    return `<section class="score-leaderboard"><div class="score-leaderboard-head"><div><span>TOP THREE</span><h4>${esc(title)}</h4></div><small>${esc(scope)}</small></div><ol>${rows.map((row,index)=>`<li><span class="score-rank">${String(index+1).padStart(2,'0')}</span><div class="score-performance"><strong>${esc(row.manager)}</strong><span>${esc(row.team)}</span><small>${esc(row.season)} W${esc(row.startWeek)}–W${esc(row.endWeek)}</small></div><b>${esc(row.games)} ${esc(label)}</b></li>`).join('')}</ol></section>`;
  }
  Promise.all([load('data/matchups.json'),load('data/streaks.json')]).then(([data,streaks])=>{
    panel.querySelectorAll('[data-record-grid],[data-record-book="cms"],[data-score-leaderboards]').forEach(node=>node.remove());
    const host=panel.querySelector('.history-content-panel')||panel;
    const boards=data.leaderboards||{};const streakBoards=streaks.leaderboards||{};
    const section=document.createElement('section');section.className='score-leaderboards';section.dataset.scoreLeaderboards='';
    section.innerHTML=`<div class="score-leaderboards-title"><div><span>THE EXTREMES</span><h3>Highest & Lowest Team Scores</h3></div><small>${esc(data.gameCount)} completed games · ${esc(data.seasonRange?.from)}–${esc(data.seasonRange?.to)}</small></div><div class="score-leaderboard-grid">${scoreList('Highest Team Scores','TOP FIVE','Regular season + playoffs',boards.highestScores||[])}${scoreList('Lowest Team Scores','BOTTOM FIVE','Regular season only',boards.lowestScores||[])}</div><div class="score-leaderboards-title record-groups-title"><div><span>LEAGUE RECORDS</span><h3>Top Performances & Streaks</h3></div><small>Calculated from the verified game archive</small></div><div class="record-category-grid">${gameList('Biggest Blowouts','Regular season + title bracket',boards.biggestBlowouts||[],'margin')}${gameList('Closest Games','All completed games',boards.closestGames||[],'margin')}${gameList('Highest Combined Scores','All completed games',boards.highestCombinedGames||[],'combined')}${streakList('Winning Streaks','All official games',streakBoards.winningStreaks||[],'wins')}${streakList('Losing Streaks','Regular season only',streakBoards.losingStreaks||[],'losses')}</div>`;
    host.appendChild(section);
  }).catch(error=>{console.error('Unable to load record book:',error);const placeholder=panel.querySelector('[data-record-grid="placeholder"]');if(placeholder)placeholder.innerHTML='<div class="history-loading">Record book could not be loaded.</div>';});
})();
