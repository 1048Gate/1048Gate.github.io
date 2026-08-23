// 1048 Gate Vote Booth
// Community content is stored in Supabase and managed through Staff Tools.

(async function(){
  const votesSection=document.getElementById('votes');
  if(!votesSection)return;

  const {escapeHtml:esc}=window.gateShared;
  const supabase=window.gateSupabase||await (window.gateSupabaseReady||Promise.resolve(null));
  const voterKey='1048GateVoterId';
  let voterId=localStorage.getItem(voterKey);
  if(!voterId){
    voterId=crypto.randomUUID();
    localStorage.setItem(voterKey,voterId);
  }

  votesSection.innerHTML=`
    <div class="section-title"><span class="section-kicker">League decisions</span><h2>Vote Booth</h2><span class="see-all">One device, one vote</span></div>
    <div class="community-intro"><div><strong>Settle it with the league</strong><p>Draft plans, rule changes, payouts, and punishments belong here—not buried in the group chat.</p></div><div class="community-count"><b id="pollCount">0</b>polls</div></div>
    <div id="pollNotice" role="status"></div><div class="poll-grid" id="livePolls"></div>`;

  const missingStarterColumn=error=>error?.code==='42703'||String(error?.message||'').includes('is_starter');
  const notice=(id,text,type='live')=>{
    const host=document.getElementById(id);
    if(host)host.innerHTML=text?`<div class="community-preview-note ${type==='error'?'community-notice-error':''}">${esc(text)}</div>`:'';
  };

  async function loadPolls(){
    const host=document.getElementById('livePolls');
    let {data,error}=await supabase.from('polls').select('id,question,is_open,is_starter,created_at,poll_options(id,label,sort_order),poll_votes(id,option_id,voter_id)').order('created_at',{ascending:false});
    if(missingStarterColumn(error)){
      ({data,error}=await supabase.from('polls').select('id,question,is_open,created_at,poll_options(id,label,sort_order),poll_votes(id,option_id,voter_id)').order('created_at',{ascending:false}));
    }
    if(error){
      document.getElementById('pollCount').textContent='0';
      notice('pollNotice','Polls could not load. Please try again shortly.','error');
      host.innerHTML='<div class="panel community-empty">Voting is temporarily unavailable.</div>';
      return;
    }

    const polls=data||[];
    document.getElementById('pollCount').textContent=String(polls.length);
    notice('pollNotice',polls.some(poll=>poll.is_starter)?'Starter polls are live examples · your vote is saved to this device.':'Official league polls · your vote is saved to this device.');
    if(!polls.length){
      host.innerHTML='<div class="panel community-empty">No polls are posted yet.</div>';
      return;
    }

    host.innerHTML=polls.map((poll,index)=>{
      const votes=poll.poll_votes||[],total=votes.length,myVote=votes.find(vote=>vote.voter_id===voterId);
      const options=[...(poll.poll_options||[])].sort((a,b)=>a.sort_order-b.sort_order);
      const starter=Boolean(poll.is_starter);
      return `<article class="panel poll-card live-poll ${index===0?'poll-featured':''}" data-poll="${poll.id}">
        <div class="poll-head"><div>${starter?'<span class="community-starter-badge">Starter poll</span>':''}<h3>${esc(poll.question)}</h3><div class="poll-meta">${total} vote${total===1?'':'s'} · ${myVote?'vote recorded':poll.is_open?'choose one option':'final result'}</div></div><span class="${poll.is_open?'status-live':'status-closed'}">${poll.is_open?'Live':'Closed'}</span></div>
        ${options.map(option=>{
          const count=votes.filter(vote=>vote.option_id===option.id).length,pct=total?Math.round(count/total*100):0,selected=myVote?.option_id===option.id;
          return `<button class="poll-vote-option ${selected?'selected':''}" data-option="${option.id}" ${!poll.is_open||myVote?'disabled':''}><div class="option-top"><span>${esc(option.label)}${selected?' ✓':''}</span><span class="pct">${pct}%</span></div><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div></button>`;
        }).join('')}
        <div class="poll-foot"><span>${starter?'Starter example · staff can delete it':poll.is_open?'Voting open':'Final result'}</span><span>${total} total</span></div>
      </article>`;
    }).join('');

    host.querySelectorAll('.poll-vote-option:not(:disabled)').forEach(button=>button.addEventListener('click',async()=>{
      const poll=button.closest('.live-poll').dataset.poll;
      button.disabled=true;
      const {error:voteError}=await supabase.from('poll_votes').insert({poll_id:poll,option_id:button.dataset.option,voter_id:voterId});
      if(voteError)alert(voteError.code==='23505'?'You already voted in this poll.':voteError.message);
      await loadPolls();
    }));
  }

  if(!supabase){
    document.getElementById('pollCount').textContent='0';
    document.getElementById('livePolls').innerHTML='<div class="panel community-empty">Voting is temporarily unavailable.</div>';
    return;
  }

  await loadPolls();
  supabase.channel('1048-community')
    .on('postgres_changes',{event:'*',schema:'public',table:'poll_votes'},loadPolls)
    .on('postgres_changes',{event:'*',schema:'public',table:'polls'},loadPolls)
    .on('postgres_changes',{event:'*',schema:'public',table:'poll_options'},loadPolls)
    .subscribe();
})();
