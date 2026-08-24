// 1048 Gate championship banner wall — one hanging banner per title.
(function(){
  const host = document.querySelector('[data-banner-wall]');
  if(!host) return;

  const {escapeHtml:esc} = window.gateShared;

  async function load(){
    try{
      const response = await fetch('data/seasons.json', {cache:'no-store'});
      if(!response.ok) throw new Error(`seasons.json returned HTTP ${response.status}`);
      const seasons = (await response.json()).seasons || [];
      const banners = seasons
        .filter(s => Array.isArray(s) && s.length >= 5)
        .map(s => {
          const champRow = Array.isArray(s[4]) ? s[4].find(t => Number(t[0]) === 1) : null;
          return {year:Number(s[0]), owner:String(s[2] || ''), team:String(s[3] || ''), record:champRow ? String(champRow[4] || '') : ''};
        })
        .sort((a,b) => b.year - a.year);
      if(!banners.length) throw new Error('No champions found');

      host.innerHTML = banners.map(banner => `
        <div class="champ-banner" role="img" aria-label="${esc(banner.year)} champions: ${esc(banner.team)}, ${esc(banner.owner)}${banner.record ? `, ${esc(banner.record)}` : ''}">
          <span class="champ-banner-hook" aria-hidden="true"></span>
          <span class="champ-banner-year">${esc(banner.year)}</span>
          <strong class="champ-banner-team">${esc(banner.team)}</strong>
          <span class="champ-banner-owner">${esc(banner.owner)}</span>
          ${banner.record ? `<span class="champ-banner-record">${esc(banner.record)}</span>` : ''}
        </div>`).join('');
    }catch(error){
      console.error('Unable to load banner wall:', error);
      host.innerHTML = '<div class="banner-wall-empty">Banners could not be loaded.</div>';
    }
  }

  load();
})();
