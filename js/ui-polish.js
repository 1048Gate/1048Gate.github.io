(function(){
  const KICKERS = {
    home:'League HQ',
    board:'Community',
    votes:'League Decisions',
    history:'The Archive',
    transactions:'The League Wire',
    playoffs:'Postseason',
    rules:'League Handbook',
    members:'The League'
  };

  document.querySelectorAll('main > .view > .section-title').forEach(title => {
    if(title.querySelector('.section-kicker')) return;
    const heading = title.querySelector('h2');
    if(!heading) return;

    const kicker = document.createElement('span');
    kicker.className = 'section-kicker';
    kicker.textContent = KICKERS[title.closest('.view')?.id] || '1048 Gate';
    heading.insertAdjacentElement('beforebegin', kicker);
  });
})();
