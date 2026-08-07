// 1048 Gate shared Message Board + Vote Booth
// This file is ready to connect once js/supabase-config.js contains your project URL + anon key.

(async function(){
  const boardSection=document.getElementById('board');
  const votesSection=document.getElementById('votes');
  if(!boardSection||!votesSection)return;

  const config=window.SUPABASE_CONFIG||{};
  if(!config.url||!config.anonKey){
    boardSection.insertAdjacentHTML('beforeend','<div class="panel community-note"><strong>Message board setup pending.</strong> Add your Supabase project URL and anon key to <span class="mono">js/supabase-config.js</span>.</div>');
    votesSection.insertAdjacentHTML('beforeend','<div class="panel community-note"><strong>Voting setup pending.</strong> Add your Supabase project URL and anon key to <span class="mono">js/supabase-config.js</span>.</div>');
    return;
  }

  const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const supabase=createClient(config.url,config.anonKey);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const relativeTime=iso=>{const s=Math.max(1,Math.floor((Date.now()-new Date(iso))/1000));if(s<60)return `${s}s ago`;const m=Math.floor(s/60);if(m<60)return `${m}m ago`;const h=Math.floor(m/60);if(h<24)return `${h}h ago`;const d=Math.floor(h/24);return `${d}d ago`};
  const voterKey='1048GateVoterId';
  let voterId=localStorage.getItem(voterKey);if(!voterId){voterId=crypto.randomUUID();localStorage.setItem(voterKey,voterId)}

  boardSection.innerHTML=`
    <div class="section-title"><h2>Message Board</h2><span class="see-all">Live league chatter</span></div>
    <div class="panel community-compose">
      <div class="community-fields">
        <input id="boardAuthor" maxlength="40" placeholder="Your name">
        <select id="boardCategory"><option>General</option><option>Trash Talk</option><option>Trade Talk</option><option>Waiver Wire</option></select>
        <input id="boardTitle" maxlength="120" placeholder="Thread title">
      </div>
      <textarea id="boardBody" maxlength="2000" placeholder="Say what you came here to say…"></textarea>
      <div class="community-actions"><span id="boardStatus" class="community-status"></span><button class="btn btn-primary" id="boardPostBtn">Post Thread</button></div>
    </div>
    <div class="filter-pills" id="liveBoardFilters"><span class="pill active" data-cat="All">All</span><span class="pill" data-cat="Trash Talk">Trash Talk</span><span class="pill" data-cat="Trade Talk">Trade Talk</span><span class="pill" data-cat="Waiver Wire">Waiver Wire</span><span class="pill" data-cat="General">General</span></div>
    <div id="liveThreads"></div>`;

  let posts=[];let activeCategory='All';
  async function loadPosts(){
    const {data,error}=await supabase.from('board_posts').select('*,board_comments(id,author,body,created_at)').order('created_at',{ascending:false}).order('created_at',{foreignTable:'board_comments',ascending:true});
    if(error){document.getElementById('liveThreads').innerHTML=`<div class="panel community-error">${esc(error.message)}</div>`;return}
    posts=data||[];renderPosts();
  }
  function renderPosts(){
    const host=document.getElementById('liveThreads');
    const visible=activeCategory==='All'?posts:posts.filter(p=>p.category===activeCategory);
    if(!visible.length){host.innerHTML='<div class="panel community-empty">No threads here yet. Be the first one to start something.</div>';return}
    host.innerHTML=visible.map(p=>`<article class="panel community-thread">
      <div class="community-thread-top"><span class="tag-cat cat-general">${esc(p.category)}</span><span>${relativeTime(p.created_at)}</span></div>
      <h3>${esc(p.title)}</h3><div class="community-byline">${esc(p.author)}</div><p>${esc(p.body).replace(/\n/g,'<br>')}</p>
      <div class="community-comments">${(p.board_comments||[]).map(c=>`<div class="community-comment"><strong>${esc(c.author)}</strong><span>${relativeTime(c.created_at)}</span><p>${esc(c.body)}</p></div>`).join('')}</div>
      <form class="comment-form" data-post="${p.id}"><input name="author" maxlength="40" placeholder="Name" required><input name="body" maxlength="1000" placeholder="Reply…" required><button class="btn btn-ghost" type="submit">Reply</button></form>
    </article>`).join('');
    host.querySelectorAll('.comment-form').forEach(form=>form.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(form);const btn=form.querySelector('button');btn.disabled=true;const {error}=await supabase.from('board_comments').insert({post_id:form.dataset.post,author:String(fd.get('author')).trim(),body:String(fd.get('body')).trim()});btn.disabled=false;if(!error)form.reset();else alert(error.message)}));
  }
  document.getElementById('liveBoardFilters').addEventListener('click',e=>{const pill=e.target.closest('.pill');if(!pill)return;activeCategory=pill.dataset.cat;document.querySelectorAll('#liveBoardFilters .pill').forEach(x=>x.classList.toggle('active',x===pill));renderPosts()});
  document.getElementById('boardPostBtn').addEventListener('click',async()=>{const author=document.getElementById('boardAuthor').value.trim(),category=document.getElementById('boardCategory').value,title=document.getElementById('boardTitle').value.trim(),body=document.getElementById('boardBody').value.trim(),status=document.getElementById('boardStatus');if(!author||!title||!body){status.textContent='Name, title, and message are required.';return}status.textContent='Posting…';const {error}=await supabase.from('board_posts').insert({author,category,title,body});if(error){status.textContent=error.message;return}document.getElementById('boardTitle').value='';document.getElementById('boardBody').value='';status.textContent='Posted.';setTimeout(()=>status.textContent='',1500)});

  votesSection.innerHTML=`<div class="section-title"><h2>Vote Booth</h2><span class="see-all">One vote per browser per poll</span></div><div id="livePolls"></div>`;
  async function loadPolls(){
    const {data,error}=await supabase.from('polls').select('id,question,is_open,created_at,poll_options(id,label,sort_order),poll_votes(id,option_id,voter_id)').order('created_at',{ascending:false});
    const host=document.getElementById('livePolls');if(error){host.innerHTML=`<div class="panel community-error">${esc(error.message)}</div>`;return}
    if(!data?.length){host.innerHTML='<div class="panel community-empty">No polls are live yet.</div>';return}
    host.innerHTML=data.map(p=>{const votes=p.poll_votes||[],total=votes.length,myVote=votes.find(v=>v.voter_id===voterId),opts=[...(p.poll_options||[])].sort((a,b)=>a.sort_order-b.sort_order);return `<div class="panel poll-card live-poll" data-poll="${p.id}"><div class="poll-head"><div><h3>${esc(p.question)}</h3><div class="poll-meta">${total} vote${total===1?'':'s'}</div></div><span class="${p.is_open?'status-live':'status-closed'}">${p.is_open?'Live':'Closed'}</span></div>${opts.map(o=>{const count=votes.filter(v=>v.option_id===o.id).length,pct=total?Math.round(count/total*100):0,selected=myVote?.option_id===o.id;return `<button class="poll-vote-option ${selected?'selected':''}" data-option="${o.id}" ${!p.is_open||myVote?'disabled':''}><div class="option-top"><span>${esc(o.label)}${selected?' ✓':''}</span><span class="pct">${pct}%</span></div><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div></button>`}).join('')}</div>`}).join('');
    host.querySelectorAll('.poll-vote-option:not(:disabled)').forEach(btn=>btn.addEventListener('click',async()=>{const poll=btn.closest('.live-poll').dataset.poll;btn.disabled=true;const {error}=await supabase.from('poll_votes').insert({poll_id:poll,option_id:btn.dataset.option,voter_id:voterId});if(error){alert(error.code==='23505'?'You already voted in this poll.':error.message);loadPolls()}}));
  }

  await Promise.all([loadPosts(),loadPolls()]);
  supabase.channel('1048-community').on('postgres_changes',{event:'*',schema:'public',table:'board_posts'},loadPosts).on('postgres_changes',{event:'*',schema:'public',table:'board_comments'},loadPosts).on('postgres_changes',{event:'*',schema:'public',table:'poll_votes'},loadPolls).subscribe();
})();
