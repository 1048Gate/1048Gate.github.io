// 1048 Gate Vote Booth — informal device-based league feedback.
(async function(){
  const votesSection = document.getElementById('votes');
  if(!votesSection) return;

  const {escapeHtml:esc} = window.gateShared;
  const supabase = window.gateSupabase || await (window.gateSupabaseReady || Promise.resolve(null));
  const voterKey = '1048GateVoterId';
  let voterId = localStorage.getItem(voterKey);
  if(!voterId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(voterId)){
    voterId = crypto.randomUUID();
    localStorage.setItem(voterKey, voterId);
  }

  votesSection.innerHTML = `
    <div class="section-title"><span class="section-kicker">League pulse</span><h2>Informal Vote Booth</h2><span class="see-all">One device, one response</span></div>
    <div class="community-intro"><div><strong>Take the league’s temperature</strong><p>These are informal feedback polls for draft plans, rule discussion, payouts, and punishments. Official league votes will use authenticated voting in a future release.</p></div><div class="community-count"><b id="pollCount">0</b>polls</div></div>
    <div id="pollNotice" role="status"></div><div class="poll-grid" id="livePolls"></div>`;

  const notice = (text, type='live') => {
    const host = document.getElementById('pollNotice');
    if(host) host.innerHTML = text ? `<div class="community-preview-note ${type === 'error' ? 'community-notice-error' : ''}">${esc(text)}</div>` : '';
  };

  async function loadPolls(){
    const host = document.getElementById('livePolls');
    const {data, error} = await supabase.rpc('get_informal_polls', {p_voter_id:voterId});
    if(error){
      document.getElementById('pollCount').textContent = '0';
      notice('Informal polls could not load. Please try again shortly.', 'error');
      host.innerHTML = '<div class="panel community-empty">Voting is temporarily unavailable.</div>';
      return;
    }

    const polls = Array.isArray(data) ? data : [];
    document.getElementById('pollCount').textContent = String(polls.length);
    notice('Informal feedback only · aggregate results are public · your response stays on this device.');
    if(!polls.length){
      host.innerHTML = '<div class="panel community-empty">No informal polls are posted yet.</div>';
      return;
    }

    host.innerHTML = polls.map((poll, index) => {
      const options = [...(poll.options || [])].sort((a,b) => Number(a.sort_order) - Number(b.sort_order));
      const total = options.reduce((sum, option) => sum + Number(option.vote_count || 0), 0);
      const myVote = poll.my_option_id;
      const starter = Boolean(poll.is_starter);
      return `<article class="panel poll-card live-poll ${index === 0 ? 'poll-featured' : ''}" data-poll="${poll.id}"><div class="poll-head"><div>${starter ? '<span class="community-starter-badge">Starter poll</span>' : ''}<h3>${esc(poll.question)}</h3><div class="poll-meta">${total} response${total === 1 ? '' : 's'} · ${myVote ? 'response recorded' : poll.is_open ? 'choose one option' : 'final result'}</div></div><span class="${poll.is_open ? 'status-live' : 'status-closed'}">${poll.is_open ? 'Informal' : 'Closed'}</span></div>${options.map(option => {
        const count = Number(option.vote_count || 0);
        const pct = total ? Math.round(count / total * 100) : 0;
        const selected = myVote === option.id;
        return `<button class="poll-vote-option ${selected ? 'selected' : ''}" data-option="${option.id}" ${!poll.is_open || myVote ? 'disabled' : ''}><div class="option-top"><span>${esc(option.label)}${selected ? ' ✓' : ''}</span><span class="pct">${pct}%</span></div><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div></button>`;
      }).join('')}<div class="poll-foot"><span>${starter ? 'Starter example · staff can delete it' : poll.is_open ? 'Informal feedback only' : 'Final result'}</span><span>${total} total</span></div></article>`;
    }).join('');

    host.querySelectorAll('.poll-vote-option:not(:disabled)').forEach(button => button.addEventListener('click', async () => {
      const pollId = button.closest('.live-poll').dataset.poll;
      button.disabled = true;
      const {data:result, error:voteError} = await supabase.rpc('cast_informal_poll_vote', {
        p_poll_id:pollId,
        p_option_id:button.dataset.option,
        p_voter_id:voterId
      });
      if(voteError) alert(voteError.message);
      else if(!result?.accepted) alert('You already responded to this informal poll from this device.');
      await loadPolls();
    }));
  }

  if(!supabase){
    document.getElementById('pollCount').textContent = '0';
    document.getElementById('livePolls').innerHTML = '<div class="panel community-empty">Voting is temporarily unavailable.</div>';
    return;
  }

  await loadPolls();
  supabase.channel('1048-community')
    .on('postgres_changes', {event:'*', schema:'public', table:'polls'}, loadPolls)
    .on('postgres_changes', {event:'*', schema:'public', table:'poll_options'}, loadPolls)
    .subscribe();
})();
