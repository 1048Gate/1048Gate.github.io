(function(){
  const LOGOS={
    '01':'images/team-logos/01-george-travis.png',
    '02':'images/team-logos/02-jared-hall.png',
    '03':'images/team-logos/03-kyle-fowler.png',
    '04':'images/team-logos/04-bryan-hunt.png',
    '05':'images/team-logos/05-brian-heino.png',
    '06':'images/team-logos/06-vincent-cannarozzi.png',
    '07':'images/team-logos/07-james-brochu.png',
    '08':'images/team-logos/08-jd-daley.png',
    '09':'images/team-logos/09-thomas-speer.png',
    '10':'images/team-logos/10-collin-krum.png',
    '11':'images/team-logos/%2011-german-haro.png',
    '12':'images/team-logos/12-trevor-hash.png'
  };

  if(!document.querySelector('link[data-member-logo-patch-styles]')){
    const css=document.createElement('link');
    css.rel='stylesheet';
    css.href='css/member-logos.css?v=20260809b';
    css.dataset.memberLogoPatchStyles='true';
    document.head.appendChild(css);
  }

  function patchCards(){
    document.querySelectorAll('#membersGrid .member-card').forEach(card=>{
      if(card.querySelector('.member-logo-shell'))return;
      const head=card.querySelector('.member-head');
      const locker=head?.querySelector('.locker-num');
      const number=(locker?.textContent||'').trim().padStart(2,'0');
      const src=LOGOS[number];
      if(!head||!locker||!src)return;

      const shell=document.createElement('div');
      shell.className='member-logo-shell';
      shell.innerHTML=`<img class="member-logo" src="${src}" alt="Member ${number} team logo" loading="lazy"><span class="member-logo-fallback">${number}</span>`;
      shell.querySelector('img').addEventListener('error',()=>{
        shell.querySelector('img').hidden=true;
        shell.classList.add('logo-missing');
      });

      head.classList.add('member-head-with-logo');
      locker.replaceWith(shell);
    });
  }

  patchCards();
  const grid=document.getElementById('membersGrid');
  if(grid){
    new MutationObserver(patchCards).observe(grid,{childList:true,subtree:true});
  }
  [100,300,700,1500,3000].forEach(ms=>setTimeout(patchCards,ms));
})();
