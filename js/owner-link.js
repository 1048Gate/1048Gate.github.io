(function(){
  let generation = 0;
  window.addEventListener('gate-auth-changed',async event => {
    const token = ++generation;
    document.getElementById('ownerDeskLink')?.remove();
    const user = event.detail.user;
    if(!user || !window.gateSupabase) return;
    const {data,error} = await window.gateSupabase.from('fantasy_owner_access').select('user_id').eq('user_id',user.id).maybeSingle();
    if(token !== generation || error || !data) return;
    const link = document.createElement('a');link.id='ownerDeskLink';link.href='/owner/';link.textContent='Owner Desk';link.className='btn btn-ghost';
    document.getElementById('authControlMount')?.appendChild(link);
  });
})();
