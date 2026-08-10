// 1048 Gate shared Message Board + Vote Booth
// Live Supabase content takes over automatically once posts and polls exist.

(async function(){
  const boardSection=document.getElementById('board');
  const votesSection=document.getElementById('votes');
  if(!boardSection||!votesSection)return;

  const {escapeHtml:esc,relativeTime}=window.gateShared;
  const supabase=window.gateSupabase||await (window.gateSupabaseReady||Promise.resolve(null));
  const voterKey='1048GateVoterId';
  let voterId=localStorage.getItem(voterKey);
  if(!voterId){voterId=crypto.randomUUID();localStorage.setItem(voterKey,voterId)}

  const mockPosts=[
    {
      id:'mock-1',author:'George',category:'General',title:'Szn 10 roll call — what weekend works best?',
      body:'Drop your best weekend below so we can narrow down the draft date before the official vote goes live.',
      displayTime:'18 min ago',isMock:true,
      board_comments:[
        {author:'German',body:'Saturday night works best for me. I can make Sunday work if we draft a little earlier.',displayTime:'11 min ago'},
        {author:'Bryan',body:'I am good either day as long as we lock it in soon.',displayTime:'6 min ago'}
      ]
    },
    {
      id:'mock-2',author:'Jared',category:'Trade Talk',title:'Putting an early pick on the trade block',
      body:'Open to moving my second-round pick for the right keeper upgrade. Send an actual offer—not a screenshot of your bench.',
      displayTime:'1 hr ago',isMock:true,
      board_comments:[
        {author:'JD',body:'Define “actual offer” because your counteroffers usually require legal review.',displayTime:'46 min ago'},
        {author:'Jared',body:'That sounds like somebody who cannot afford the pick.',displayTime:'39 min ago'}
      ]
    },
    {
      id:'mock-3',author:'Kyle',category:'Waiver Wire',title:'We need a real FAAB debate before draft night',
      body:'Inverse standings is simple, but FAAB makes every waiver claim a decision. I want to hear the case against switching.',
      displayTime:'Yesterday',isMock:true,
      board_comments:[
        {author:'Brian',body:'FAAB is better until I spend 70% on a Week 2 running back who disappears by Sunday.',displayTime:'Yesterday'},
        {author:'Trevor',body:'That is not a flaw in FAAB. That is a scouting report on you.',displayTime:'Yesterday'}
      ]
    },
    {
      id:'mock-4',author:'Tommy',category:'Trash Talk',title:'Preseason power rankings are already disrespectful',
      body:'I have seen enough. Put me first, put everybody else in any order you want, and save us all some time.',
      displayTime:'2 days ago',isMock:true,
      board_comments:[
        {author:'George',body:'Power rankings have been delayed while we search for evidence supporting this claim.',displayTime:'2 days ago'}
      ]
    }
  ];

  const mockPolls=[
    {
      id:'mock-poll-1',question:'Which night should host the Szn 10 draft?',status:'preview',featured:true,total:12,
      options:[['Saturday at 7:00 PM',6],['Sunday at 6:00 PM',4],['Friday at 8:00 PM',2]],foot:'Sample poll · full league turnout'
    },
    {
      id:'mock-poll-2',question:'Should 1048 Gate switch to FAAB waivers?',status:'preview',total:11,
      options:[['Yes — $100 seasonal budget',7],['No — keep inverse standings',4]],foot:'Sample poll · 1 vote remaining'
    },
    {
      id:'mock-poll-3',question:'Choose the Szn 10 last-place punishment',status:'closed',total:12,
      options:[['NFL combine at the park',5],['Calendar photo shoot',4],['Open-mic comedy set',3]],foot:'Sample result · voting closed'
    }
  ];

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
      <div class="community-actions"><span id="boardStatus" class="community-status">${supabase?'':'Preview mode — live posting will unlock with the league database.'}</span><button class="btn btn-primary" id="boardPostBtn" ${supabase?'':'disabled'}>Post Thread</button></div>
    </div>
    <div class="filter-pills" id="liveBoardFilters"><button type="button" class="pill active" data-cat="All">All</button><button type="button" class="pill" data-cat="Trash Talk">Trash Talk</button><button type="button" class="pill" data-cat="Trade Talk">Trade Talk</button><button type="button" class="pill" data-cat="Waiver Wire">Waiver Wire</button><button type="button" class="pill" data-cat="General">General</button></div>
    <div id="boardPreviewNote"></div><div id="liveThreads"></div>`;

  votesSection.innerHTML=`
    <div class="section-title"><span class="section-kicker">League decisions</span><h2>Vote Booth</h2><span class="see-all">One manager, one vote</span></div>
    <div class="community-intro"><div><strong>Settle it with the league</strong><p>Draft plans, rule changes, payouts, and punishments belong here—not buried in the group chat.</p></div><div class="community-count"><b id="pollCount">0</b>polls</div></div>
    <div id="pollPreviewNote"></div><div class="poll-grid" id="livePolls"></div>`;

  let posts=[];
  let activeCategory='All';

  const className=value=>String(value||'General').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const previewNote=(id,text)=>{const host=document.getElementById(id);if(host)host.innerHTML=`<div class="community-preview-note">${esc(text)}</div>`};

  function renderPosts({preview=false}={}){
    const host=document.getElementById('liveThreads');
    const visible=activeCategory==='All'?posts:posts.filter(post=>post.category===activeCategory);
    document.getElementById('boardThreadCount').textContent=String(posts.length);
    previewNote('boardPreviewNote',preview?'Sample threads shown until real league messages are posted.':'Live league chatter');
    if(!visible.length){host.innerHTML='<div class="panel community-empty">No threads in this category yet. Be the first one to start something.</div>';return}

    host.innerHTML=visible.map(post=>{
      const categoryClass=className(post.category);
      const comments=post.board_comments||[];
      const when=post.displayTime||relativeTime(post.created_at);
      return `<article class="panel community-thread cat-${categoryClass}">
        <div class="community-thread-main">
          <div class="community-thread-top"><span class="tag-cat cat-${categoryClass}">${esc(post.category)}</span><span>${esc(when)}</span></div>
          <h3>${esc(post.title)}</h3><div class="community-byline">Posted by ${esc(post.author)} · ${comments.length} repl${comments.length===1?'y':'ies'}</div>
          <p>${esc(post.body).replace(/\n/g,'<br>')}</p>
        </div>
        ${comments.length?`<div class="community-comments">${comments.map(comment=>`<div class="community-comment"><strong>${esc(comment.author)}</strong><span>${esc(comment.displayTime||relativeTime(comment.created_at))}</span><p>${esc(comment.body)}</p></div>`).join('')}</div>`:''}
        ${post.isMock?'':`<form class="comment-form" data-post="${post.id}"><input name="author" maxlength="40" placeholder="Name" required><input name="body" maxlength="1000" placeholder="Write a reply…" required><button class="btn btn-ghost" type="submit">Reply</button></form>`}
      </article>`;
    }).join('');

    if(!supabase)return;
    host.querySelectorAll('.comment-form').forEach(form=>form.addEventListener('submit',async event=>{
      event.preventDefault();
      const data=new FormData(form),button=form.querySelector('button');
      button.disabled=true;
      const {error}=await supabase.from('board_comments').insert({post_id:form.dataset.post,author:String(data.get('author')).trim(),body:String(data.get('body')).trim()});
      button.disabled=false;
      if(!error)form.reset();else alert(error.message);
    }));
  }

  function showMockPosts(){posts=mockPosts;renderPosts({preview:true})}

  async function loadPosts(){
    const {data,error}=await supabase.from('board_posts').select('*,board_comments(id,author,body,created_at)').order('created_at',{ascending:false}).order('created_at',{foreignTable:'board_comments',ascending:true});
    if(error||!data?.length){showMockPosts();return}
    posts=data;renderPosts();
  }

  function renderMockPolls(){
    const host=document.getElementById('livePolls');
    document.getElementById('pollCount').textContent=String(mockPolls.length);
    previewNote('pollPreviewNote','Sample polls shown until George publishes official league votes.');
    host.innerHTML=mockPolls.map(poll=>`<article class="panel poll-card ${poll.featured?'poll-featured':''}">
      <div class="poll-head"><div><h3>${esc(poll.question)}</h3><div class="poll-meta">${poll.total} sample vote${poll.total===1?'':'s'}</div></div><span class="${poll.status==='closed'?'status-closed':'status-preview'}">${poll.status==='closed'?'Closed':'Preview'}</span></div>
      ${poll.options.map(([label,count])=>{const pct=poll.total?Math.round(count/poll.total*100):0;return `<div class="mock-poll-option"><div class="option-top"><span>${esc(label)}</span><span class="pct">${pct}%</span></div><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div></div>`}).join('')}
      <div class="poll-foot"><span>${esc(poll.foot)}</span><span>${poll.total} total</span></div>
    </article>`).join('');
  }

  async function loadPolls(){
    const {data,error}=await supabase.from('polls').select('id,question,is_open,created_at,poll_options(id,label,sort_order),poll_votes(id,option_id,voter_id)').order('created_at',{ascending:false});
    if(error||!data?.length){renderMockPolls();return}
    const host=document.getElementById('livePolls');
    document.getElementById('pollCount').textContent=String(data.length);
    previewNote('pollPreviewNote','Official league polls · your vote is saved to this browser.');
    host.innerHTML=data.map((poll,index)=>{
      const votes=poll.poll_votes||[],total=votes.length,myVote=votes.find(vote=>vote.voter_id===voterId);
      const options=[...(poll.poll_options||[])].sort((a,b)=>a.sort_order-b.sort_order);
      return `<article class="panel poll-card live-poll ${index===0?'poll-featured':''}" data-poll="${poll.id}">
        <div class="poll-head"><div><h3>${esc(poll.question)}</h3><div class="poll-meta">${total} vote${total===1?'':'s'} · ${myVote?'Vote recorded':'Choose one option'}</div></div><span class="${poll.is_open?'status-live':'status-closed'}">${poll.is_open?'Live':'Closed'}</span></div>
        ${options.map(option=>{const count=votes.filter(vote=>vote.option_id===option.id).length,pct=total?Math.round(count/total*100):0,selected=myVote?.option_id===option.id;return `<button class="poll-vote-option ${selected?'selected':''}" data-option="${option.id}" ${!poll.is_open||myVote?'disabled':''}><div class="option-top"><span>${esc(option.label)}${selected?' ✓':''}</span><span class="pct">${pct}%</span></div><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div></button>`}).join('')}
        <div class="poll-foot"><span>${poll.is_open?'Voting open':'Final result'}</span><span>${total} total</span></div>
      </article>`;
    }).join('');

    host.querySelectorAll('.poll-vote-option:not(:disabled)').forEach(button=>button.addEventListener('click',async()=>{
      const poll=button.closest('.live-poll').dataset.poll;
      button.disabled=true;
      const {error:voteError}=await supabase.from('poll_votes').insert({poll_id:poll,option_id:button.dataset.option,voter_id:voterId});
      if(voteError){alert(voteError.code==='23505'?'You already voted in this poll.':voteError.message);loadPolls()}
    }));
  }

  document.getElementById('liveBoardFilters').addEventListener('click',event=>{
    const pill=event.target.closest('.pill');if(!pill)return;
    activeCategory=pill.dataset.cat;
    document.querySelectorAll('#liveBoardFilters .pill').forEach(item=>item.classList.toggle('active',item===pill));
    renderPosts({preview:posts.some(post=>post.isMock)});
  });

  if(!supabase){showMockPosts();renderMockPolls();return}

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
    document.getElementById('boardTitle').value='';document.getElementById('boardBody').value='';status.textContent='Posted.';
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
