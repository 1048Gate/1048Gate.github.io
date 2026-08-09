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
  const ROLE_OVERRIDES={'10':'Admin'};

  if(!document.querySelector('link[data-member-logo-patch-styles]')){
    const css=document.createElement('link');
    css.rel='stylesheet';
    css.href='css/member-logos.css?v=20260809c';
    css.dataset.memberLogoPatchStyles='true';
    document.head.appendChild(css);
  }

  function bindImageFallback(shell,img){
    img.addEventListener('error',()=>{
      img.hidden=true;
      shell.classList.add('logo-missing');
    });
  }

  function applyRoleOverride(card,number){
    const role=ROLE_OVERRIDES[number];
    if(!role)return;
    const label=card?.querySelector('.mgr');
    if(label&&label.textContent!==role)label.textContent=role;
  }

  function patchCards(){
    document.querySelectorAll('#membersGrid .member-card').forEach(card=>{
      const existingShell=card.querySelector('.member-logo-shell');
      if(existingShell){
        const existingNumber=(existingShell.querySelector('.member-logo-fallback')?.textContent||'').trim().padStart(2,'0');
        if(existingNumber){card.dataset.memberNumber=existingNumber;applyRoleOverride(card,existingNumber)}
        return;
      }

      const head=card.querySelector('.member-head');
      const locker=head?.querySelector('.locker-num');
      const number=(locker?.textContent||'').trim().padStart(2,'0');
      const src=LOGOS[number];
      if(!head||!locker||!src)return;

      card.dataset.memberNumber=number;
      applyRoleOverride(card,number);
      const shell=document.createElement('div');
      shell.className='member-logo-shell';
      shell.innerHTML=`<img class="member-logo" src="${src}" alt="Member ${number} team logo" loading="lazy"><span class="member-logo-fallback">${number}</span>`;
      const img=shell.querySelector('img');
      bindImageFallback(shell,img);

      head.classList.add('member-head-with-logo');
      locker.replaceWith(shell);
    });
  }

  function ensureModalProfile(){
    const modalHead=document.querySelector('#memberModal .member-modal-head');
    const name=document.getElementById('memberModalName');
    const identity=name?.parentElement;
    if(!modalHead||!identity)return null;

    let profile=modalHead.querySelector('.member-modal-profile');
    if(!profile){
      profile=document.createElement('div');
      profile.className='member-modal-profile';

      const shell=document.createElement('div');
      shell.className='member-modal-logo-shell';
      shell.innerHTML='<img class="member-modal-logo" alt="" loading="eager"><span class="member-modal-logo-fallback"></span>';
      bindImageFallback(shell,shell.querySelector('img'));

      identity.classList.add('member-modal-identity');
      const team=document.createElement('div');
      team.className='member-modal-team';
      team.id='memberModalTeam';
      identity.appendChild(team);

      profile.appendChild(shell);
      profile.appendChild(identity);
      modalHead.insertBefore(profile,modalHead.firstChild);
    }

    return profile;
  }

  function patchModal(number,card){
    const src=LOGOS[number];
    if(!src)return;
    const profile=ensureModalProfile();
    if(!profile)return;

    const shell=profile.querySelector('.member-modal-logo-shell');
    const img=profile.querySelector('.member-modal-logo');
    const fallback=profile.querySelector('.member-modal-logo-fallback');
    const name=document.getElementById('memberModalName')?.textContent?.trim()||`Member ${number}`;

    shell.classList.remove('logo-missing');
    img.hidden=false;
    img.src=src;
    img.alt=`${name} team logo`;
    fallback.textContent=number;

    const roleOverride=ROLE_OVERRIDES[number];
    const roleEl=document.getElementById('memberModalRole');
    if(roleOverride&&roleEl){
      const parts=roleEl.textContent.split(' • ');
      if(parts[0]!==roleOverride){
        parts[0]=roleOverride;
        roleEl.textContent=parts.join(' • ');
      }
    }

    const cardTeam=card?.querySelector('.member-latest span')?.textContent?.trim();
    const latestTableTeam=document.querySelector('#seasonRows tr:first-child td:nth-child(3)')?.textContent?.trim();
    const team=cardTeam||latestTableTeam||'';
    const teamEl=document.getElementById('memberModalTeam');
    if(teamEl){
      teamEl.textContent=team;
      teamEl.hidden=!team;
    }
  }

  function scheduleModalPatch(card){
    const number=card?.dataset.memberNumber;
    if(!number)return;
    [0,40,120].forEach(ms=>setTimeout(()=>patchModal(number,card),ms));
  }

  patchCards();
  const grid=document.getElementById('membersGrid');
  if(grid){
    new MutationObserver(patchCards).observe(grid,{childList:true,subtree:true});
    grid.addEventListener('click',event=>{
      const card=event.target.closest('.member-card');
      if(card)scheduleModalPatch(card);
    });
    grid.addEventListener('keydown',event=>{
      if(event.key!=='Enter'&&event.key!==' ')return;
      const card=event.target.closest('.member-card');
      if(card)scheduleModalPatch(card);
    });
  }
  [100,300,700,1500,3000].forEach(ms=>setTimeout(patchCards,ms));
})();
