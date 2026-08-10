// 1048 Gate shared Message Board + Vote Booth
// Community content is stored in Supabase and managed through Staff Tools.

(async function(){
  const boardSection=document.getElementById('board');
  const votesSection=document.getElementById('votes');
  if(!boardSection||!votesSection)return;

  const {escapeHtml:esc,relativeTime}=window.gateShared;
  const supabase=window.gateSupabase||await (window.gateSupabaseReady||Promise.resolve(null));
  const voterKey='1048GateVoterId';
  let voterId=localStorage.getItem(voterKey);
  if(!voterId){
    voterId=crypto.randomUUID();
    localStorage.setItem(voterKey,voterId);
  }

  boardSection.innerHTML=`
    <div class="section-title"><span class="section-kicker">League conversation</span><h2>Message Board</h2><span class="see-all">Trash talk encouraged</span></div>
    <div class="community-intro"><div><strong>The digital 1048 living room</strong><p>Start a thread, work a trade, argue about waivers, or leave something here to age badly.</p></div><div class="community-count"><b id="boardThreadCount">0</b>threads</div></div>
    <div class="panel community-compose${supabase?'':' is-preview'}">
      <div class="community-fields">
        <input id="boardAuthor" maxlength="40" placeholder="Your name" ${supabase?'':'disabled'}>
        <select id="boardCategory" ${supabase?'':'disabled'}><option>General</option><option>Trash Talk</option><option>Trade Talk</option><option>Waiver Wire</option></select>
        <input id="boardTitle" maxlength="120" placeholder="Thread title" ${supabase?'':'disabled'}>
      </div>
      <textarea id="boardBody" maxlength="2000" placeholder="Say what you came here to say…" ${supabase?'':'disabled'}></textarea>
      <div class="community-actions"><span id="boardStatus" class="community-status">${supabase?'':'The league database is unavailable right now.'}</span><button class="btn btn-primary" id="boardPostBtn" ${supabase?'':'disabled'}>Post Thread</button></div>
    </div>
    <div class="filter-pills" id="liveBoardFilters"><button type="button" class="pill active" data-cat="All">All</button><button type="button" class="pill" data-cat="Trash Talk">Trash Talk</button><button type="button" class="pill" data-cat="Trade Talk">Trade Talk</button><button type="button" class="pill" data-cat="Waiver Wire">Waiver Wire</button><button type="button" class="pill" data-cat="General">General</button></div>
    <div id="boardNotice" role="status"></div><div id="liveThreads"></div>`;

  votesSection.innerHTML=`
    <div class="section-title"><span class="section-kicker">League decisions</span><h2>Vote Booth</h2><span class="see-all">One device, one vote</span></div>
    <div class="community-intro"><div><strong>Settle it with the league</strong><p>Draft plans, rule changes, payouts, and punishments belong here—not buried in the group chat.</p></div><div class="community-count"><b id="pollCount">0</b>polls</div></div>
    <div id="pollNotice" role="status"></div><div class="poll-grid" id="livePolls"></div>`;

  let posts=[];
  let activeCategory='All';
  const className=value=>String(value||'General').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const missingStarterColumn=error=>error?.code==='42703'||String(error?.message||'').includes('is_starter');
  const notice=(id,text,type='live')=>{
    const host=document.getElementById(id);
    if(host)host.innerHTML=text?`<div class="community-preview-note ${type==='error'?'community-notice-error':''}">${esc(text)}</div>`:'';
  };

  function renderPosts(){
    const host=document.getElementById('liveThreads');
    const visible=activeCategory==='All'?posts:posts.filter(post=>post.category===activeCategory);
    document.getElementById('boardThreadCount').textContent=String(posts.length);
    if(!visible.length){
      host.innerHTML='<div class="panel community-empty">No threads in this category yet. Be the first one to start something.</div>';
      return;
    }

    host.innerHTML=visible.map(post=>{
      const categoryClass=className(post.category);
      const comments=post.board_comments||[];
      const starter=Boolean(post.is_starter);
      return `<article class="panel community-thread cat-${categoryClass}">
        <div class="community-thread-main">
          <div class="community-thread-top"><span class="tag-cat cat-${categoryClass}">${esc(post.category)}</span><span>${esc(relativeTime(post.created_at))}</span></div>
          ${starter?'<span class="community-starter-badge">Starter thread</span>':''}
          <h3>${esc(post.title)}</h3><div class="community-byline">Posted by ${esc(post.author)} · ${comments.length} repl${comments.length===1?'y':'ies'}</div>
          <p>${esc(post.body).replace(/\n/g,'<br>')}</p>
        </div>
        ${comments.length?`<div class="community-comments">${comments.map(comment=>`<div class="community-comment"><strong>${esc(comment.author)}</strong><span>${esc(relativeTime(comment.created_at))}</span><p>${esc(comment.body)}</p></div>`).join('')}</div>`:''}
        ${starter?'<div class="community-starter-foot">Example conversation · staff can remove it from Staff Tools</div>':`<form class="comment-form" data-post="${post.id}"><input name="author" maxlength="40" placeholder="Name" required><input name="body" maxlength="1000" placeholder="Write a reply…" required><button class="btn btn-ghost" type="submit">Reply</button></form>`}
      </article>`;
    }).join('');

    if(!supabase)return;
    host.querySelectorAll('.comment-form').forEach(form=>form.addEventListener('submit',async event=>{
      event.preventDefault();
      const data=new FormData(form),button=form.querySelector('button');
      const author=String(data.get('author')).trim(),body=String(data.get('body')).trim();
      if(!author||!body)return;
      button.disabled=true;
      const {error}=await supabase.from('board_comments').insert({post_id:form.dataset.post,author,body});
      button.disabled=false;
      if(error){alert(error.message);return}
      form.reset();
      await loadPosts();
    }));
  }

  async function loadPosts(){
    let {data,error}=await supabase.from('board_posts').select('id,author,category,title,body,created_at,is_starter,board_comments(id,author,body,created_at)').order('created_at',{ascending:false}).order('created_at',{foreignTable:'board_comments',ascending:true});
    if(missingStarterColumn(error)){
      ({data,error}=await supabase.from('board_posts').select('id,author,category,title,body,created_at,board_comments(id,author,body,created_at)').order('created_at',{ascending:false}).order('created_at',{foreignTable:'board_comments',ascending:true}));
    }
    if(error){
      posts=[];
      notice('boardNotice','Message board could not load. Please try again shortly.','error');
    }else{
      posts=data||[];
      notice('boardNotice',posts.some(post=>post.is_starter)?'Starter conversations are shown until staff removes them.':'Live league chatter');
    }
    renderPosts();
  }

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

  document.getElementById('liveBoardFilters').addEventListener('click',event=>{
    const pill=event.target.closest('.pill');if(!pill)return;
    activeCategory=pill.dataset.cat;
    document.querySelectorAll('#liveBoardFilters .pill').forEach(item=>item.classList.toggle('active',item===pill));
    renderPosts();
  });

  if(!supabase){
    posts=[];
    renderPosts();
    document.getElementById('pollCount').textContent='0';
    document.getElementById('livePolls').innerHTML='<div class="panel community-empty">Voting is temporarily unavailable.</div>';
    return;
  }

  document.getElementById('boardPostBtn').addEventListener('click',async()=>{
    const author=document.getElementById('boardAuthor').value.trim();
    const category=document.getElementById('boardCategory').value;
    const title=document.getElementById('boardTitle').value.trim();
    const body=document.getElementById('boardBody').value.trim();
    const status=document.getElementById('boardStatus');
    if(!author||!title||!body){status.textContent='Name, title, and message are required.';return}
    status.textContent='Posting…';
    const {error}=await supabase.from('board_posts').insert({author,category,title,body});
    if(error){status.textContent=error.message;return}
    document.getElementById('boardTitle').value='';
    document.getElementById('boardBody').value='';
    status.textContent='Posted.';
    await loadPosts();
    setTimeout(()=>status.textContent='',1500);
  });

  await Promise.all([loadPosts(),loadPolls()]);
  supabase.channel('1048-community')
    .on('postgres_changes',{event:'*',schema:'public',table:'board_posts'},loadPosts)
    .on('postgres_changes',{event:'*',schema:'public',table:'board_comments'},loadPosts)
    .on('postgres_changes',{event:'*',schema:'public',table:'poll_votes'},loadPolls)
    .on('postgres_changes',{event:'*',schema:'public',table:'polls'},loadPolls)
    .on('postgres_changes',{event:'*',schema:'public',table:'poll_options'},loadPolls)
    .subscribe();
})();
