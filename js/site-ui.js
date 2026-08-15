(async function(){
  try{
    const response = await fetch('data/site.json', {cache:'no-store'});
    if(!response.ok) throw new Error(`site.json returned HTTP ${response.status}`);
    const config = await response.json();
    if(!Number.isInteger(config.seasonYear) || !Number.isInteger(config.seasonNumber)){
      throw new Error('site.json is missing a valid season year or season number.');
    }

    const roman = String(config.seasonRoman || config.seasonNumber);
    const leagueName = String(config.leagueName || '1048 Gate');
    const phase = String(config.phase || 'Pre-Season');
    const competition = String(config.competition || 'Regular');
    const brand = `${leagueName.toUpperCase()} SZN ${roman}`;

    document.title = `${leagueName} Szn ${config.seasonNumber}`;
    document.querySelectorAll('[data-site-brand]').forEach(element => {element.textContent = brand});
    document.querySelectorAll('[data-site-edition]').forEach(element => {element.textContent = `SZN ${roman}`});
    document.querySelectorAll('[data-site-year]').forEach(element => {element.textContent = String(config.seasonYear)});
    document.querySelectorAll('[data-site-season-label]').forEach(element => {element.textContent = `Season ${config.seasonNumber}`});
    document.querySelectorAll('[data-site-phase]').forEach(element => {element.textContent = phase});
    document.querySelectorAll('[data-site-season]').forEach(element => {element.textContent = `${config.seasonYear} SEASON · ${competition.toUpperCase()}`});
    document.querySelectorAll('[data-site-footer]').forEach(element => {element.textContent = `${leagueName} Szn ${config.seasonNumber}`});
  }catch(error){
    console.warn('Unable to load site season settings; keeping the HTML fallback labels.', error);
  }
})();
