// 1048 Gate Trade Board — message board for trade discussions
(async function(){
  const tradeSection = document.getElementById('trades');
  if(!tradeSection) return;

  const {escapeHtml:esc} = window.gateShared;
  const supabase = window.gateSupabase || await (window.gateSupabaseReady || Promise.resolve(null));
  let currentUser = null;
  let currentProfile = null;

  // Sub-navigation for Trade History / Trade Board
  const tradeIntro = tradeSection.querySelector('.trade-intro');
  const subNav = document.createElement('nav');
  subNav.className = 'trade-subnav';
  subNav.setAttribute('role', 'tablist');
  subNav.setAttribute('aria-label', 'Trade sections');
  subNav.innerHTML = `
    <button type="button" class="active" data-trade-tab="history" role="tab" aria-selected="true">Trade History</button>
    <button type="button" data-trade-tab="board" role="tab" aria-selected="false">Trade Board</button>
  `;
  tradeIntro?.insertAdjacentElement('afterend', subNav);

  // Create tab panels
  const historyPanel = document.createElement('div');
  historyPanel.className = 'trade-tab-panel active';
  historyPanel.dataset.tradePanel = 'history';
  historyPanel.setAttribute('role', 'tabpanel');
  historyPanel.innerHTML = `
    <nav class="trade-year-nav" id="tradeYearNav" aria-label="Trade archive seasons"></nav>
    <div class="trade-season-meta" id="tradeSeasonMeta" role="status"></div>
    <div class="trade-feed" id="tradeFeed" aria-live="polite">
      <div class="panel transaction-empty"><strong>Loading trade archive…</strong><span>Connecting to the league database.</span></div>
    </div>
  `;

  const boardPanel = document.createElement('div');
  boardPanel.className = 'trade-tab-panel';
  boardPanel.dataset.tradePanel = 'board';
  boardPanel.setAttribute('role', 'tabpanel');
  boardPanel.innerHTML = `
    <div class="trade-board-header">
      <div class="trade-board-intro">
        <strong>Propose, discuss, and gauge interest</strong>
        <p>Post trade ideas, find partners, and work out frameworks before sending offers on ESPN.</p>
      </div>
      <div id="tradeBoardAuthStatus"></div>
    </div>
    <form class="trade-board-form panel" id="tradeBoardForm" hidden>
      <div class="form-row">
        <label for="tbTitle">Title</label>
        <input type="text" id="tbTitle" name="title" maxlength="120" placeholder="e.g., Shopping my RB2, targeting WR1" required>
      </div>
      <div class="form-row">
        <label for="tbBody">Details</label>
        <textarea id="tbBody" name="body" maxlength="2000" rows="5" placeholder="Players involved, what you're looking for, framework…" required></textarea>
      </div>
      <div class="form-actions">
        <span class="form-status" id="tbFormStatus" role="status"></span>
        <button type="submit" class="btn btn-primary">Post to Trade Board</button>
      </div>
    </form>
    <div class="trade-board-feed" id="tradeBoardFeed" aria-live="polite">
      <div class="panel community-empty">Loading Trade Board…</div>
    </div>
  `;

  // Replace the existing content after trade-intro
  const existingContent = tradeSection.querySelectorAll(':scope > *:not(.section-title):not(.trade-intro)');
  existingContent.forEach(el => el.remove());
  tradeSection.appendChild(historyPanel);
  tradeSection.appendChild(boardPanel);

  // Tab switching
  subNav.querySelectorAll('[data-trade-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tradeTab;
      subNav.querySelectorAll('[data-trade-tab]').forEach(b => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-selected', b === btn);
      });
      tradeSection.querySelectorAll('.trade-tab-panel').forEach(p => {
        p.classList.toggle('active', p.dataset.tradePanel === tab);
        p.setAttribute('aria-hidden', p.dataset.tradePanel !== tab);
      });
      if (tab === 'board') loadBoard();
    });
  });

  // Auth state handling
  async function updateAuthUI() {
    const {data: {session}} = await supabase?.auth.getSession();
    currentUser = session?.user || null;
    if (currentUser) {
      const {data: profile} = await supabase.from('profiles').select('role,display_name').eq('id', currentUser.id).maybeSingle();
      currentProfile = profile;
    } else {
      currentProfile = null;
    }
    renderAuthStatus();
    renderFormVisibility();
  }

  function renderAuthStatus() {
    const host = document.getElementById('tradeBoardAuthStatus');
    if (!host) return;
    if (currentUser) {
      host.innerHTML = `<span class="trade-board-user">Signed in as <strong>${esc(currentProfile?.display_name || currentUser.email)}</strong></span>`;
    } else {
      host.innerHTML = `<button class="btn btn-ghost" id="tbSignInBtn">Sign in to post</button>`;
      host.querySelector('#tbSignInBtn')?.addEventListener('click', () => {
        const authBtn = document.getElementById('authButton');
        authBtn?.click();
      });
    }
  }

  function renderFormVisibility() {
    const form = document.getElementById('tradeBoardForm');
    if (!form) return;
    if (currentUser) {
      form.hidden = false;
    } else {
      form.hidden = true;
    }
  }

  // Load board posts
  async function loadBoard() {
    const feed = document.getElementById('tradeBoardFeed');
    if (!feed) return;

    if (!supabase) {
      feed.innerHTML = '<div class="panel community-empty">Trade Board is temporarily unavailable.</div>';
      return;
    }

    feed.innerHTML = '<div class="panel community-empty"><div class="history-loading">Loading Trade Board…</div></div>';

    try {
      const {data: posts, error} = await supabase
        .from('trade_board_posts')
        .select(`
          id, title, body, is_closed, is_starter, created_at, updated_at,
          author_id, author_name,
          trade_board_comments (id, body, author_name, author_id, created_at)
        `)
        .order('created_at', {ascending: false});

      if (error) throw error;

      renderBoardPosts(posts || []);
    } catch (err) {
      console.error('Unable to load Trade Board:', err);
      feed.innerHTML = `<div class="panel community-empty community-error"><strong>Trade Board could not load.</strong><span>${esc(err.message)}</span></div>`;
    }
  }

  function renderBoardPosts(posts) {
    const feed = document.getElementById('tradeBoardFeed');
    if (!feed) return;

    if (!posts.length) {
      feed.innerHTML = '<div class="panel community-empty">No trade discussions yet. Be the first to post!</div>';
      return;
    }

    feed.innerHTML = posts.map(post => renderPostCard(post)).join('');
    attachPostListeners();
  }

  function renderPostCard(post) {
    const isAuthor = currentUser && post.author_id === currentUser.id;
    const isStaff = currentProfile && ['commissioner', 'site_admin'].includes(currentProfile.role);
    const canManage = isAuthor || isStaff;
    const comments = (post.trade_board_comments || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const commentCount = comments.length;

    return `
      <article class="panel trade-board-post${post.is_closed ? ' closed' : ''}" data-post-id="${post.id}">
        <header class="trade-board-post-head">
          <div class="trade-board-post-meta">
            <span class="trade-board-author">${esc(post.author_name)}${post.is_starter ? ' <span class="trade-starter-badge">Starter</span>' : ''}</span>
            <time datetime="${post.created_at}">${formatDate(post.created_at)}</time>
            ${post.updated_at !== post.created_at ? `<span class="trade-board-edited">edited ${formatDate(post.updated_at)}</span>` : ''}
          </div>
          <div class="trade-board-post-actions">
            ${canManage ? `
              <button type="button" class="btn btn-ghost btn-sm tb-toggle-close" data-post-id="${post.id}" aria-label="${post.is_closed ? 'Reopen' : 'Close'} post">
                ${post.is_closed ? 'Reopen' : 'Close'}
              </button>
              <button type="button" class="btn btn-ghost btn-sm tb-edit" data-post-id="${post.id}" aria-label="Edit post">Edit</button>
              <button type="button" class="btn btn-ghost btn-sm staff-danger tb-delete" data-post-id="${post.id}" aria-label="Delete post">Delete</button>
            ` : ''}
          </div>
        </header>
        <h3 class="trade-board-post-title">${esc(post.title)}</h3>
        <div class="trade-board-post-body">${esc(post.body).replace(/\n/g, '<br>')}</div>
        ${post.is_closed ? '<div class="trade-board-closed-notice"><span>🔒</span> This discussion is closed.</div>' : ''}
        <section class="trade-board-comments">
          <div class="trade-board-comments-head">
            <span>Replies <strong>${commentCount}</strong></span>
          </div>
          <div class="trade-board-comment-list">
            ${comments.map(comment => renderComment(comment, canManage)).join('')}
          </div>
          <form class="trade-board-comment-form" data-post-id="${post.id}" ${post.is_closed && !isStaff ? 'hidden' : ''}>
            <textarea name="body" maxlength="1000" rows="2" placeholder="${post.is_closed && !isStaff ? 'This discussion is closed.' : 'Write a reply…'}" ${post.is_closed && !isStaff ? 'disabled' : 'required'}></textarea>
            <div class="form-actions">
              <span class="form-status"></span>
              <button type="submit" class="btn btn-primary btn-sm" ${post.is_closed && !isStaff ? 'disabled' : ''}>Reply</button>
            </div>
          </form>
        </section>
      </article>
    `;
  }

  function renderComment(comment, canManage) {
    const isAuthor = currentUser && comment.author_id === currentUser.id;
    const isStaff = currentProfile && ['commissioner', 'site_admin'].includes(currentProfile.role);
    const canDelete = isAuthor || isStaff;

    return `
      <div class="trade-board-comment" data-comment-id="${comment.id}">
        <div class="trade-board-comment-meta">
          <span class="trade-board-comment-author">${esc(comment.author_name)}</span>
          <time datetime="${comment.created_at}">${formatDate(comment.created_at)}</time>
        </div>
        <p class="trade-board-comment-body">${esc(comment.body)}</p>
        ${canDelete ? `<button type="button" class="btn btn-ghost btn-sm tb-delete-comment" data-comment-id="${comment.id}" data-post-id="${comment.post_id}" aria-label="Delete reply">Delete</button>` : ''}
      </div>
    `;
  }

  function formatDate(iso) {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'});
  }

  function attachPostListeners() {
    const feed = document.getElementById('tradeBoardFeed');
    if (!feed) return;

    // Create post
    const form = document.getElementById('tradeBoardForm');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const statusEl = form.querySelector('.form-status');
      const title = form.title.value.trim();
      const body = form.body.value.trim();
      if (!title || !body) return;
      if (!currentUser) return alert('Please sign in first.');

      statusEl.textContent = 'Posting…';
      try {
        const {error} = await supabase.from('trade_board_posts').insert({
          author_id: currentUser.id,
          author_name: currentProfile?.display_name || currentUser.email,
          title,
          body
        });
        if (error) throw error;
        form.reset();
        statusEl.textContent = 'Posted!';
        setTimeout(() => statusEl.textContent = '', 1500);
        loadBoard();
      } catch (err) {
        statusEl.textContent = err.message;
        statusEl.style.color = 'var(--danger)';
      }
    });

    // Edit post
    feed.querySelectorAll('.tb-edit').forEach(btn => {
      btn.addEventListener('click', async () => {
        const postId = btn.dataset.postId;
        const postCard = feed.querySelector(`[data-post-id="${postId}"]`);
        const titleEl = postCard.querySelector('.trade-board-post-title');
        const bodyEl = postCard.querySelector('.trade-board-post-body');
        const currentTitle = titleEl.textContent;
        const currentBody = bodyEl.innerHTML.replace(/<br>/g, '\n');

        const newTitle = prompt('Edit title:', currentTitle);
        if (newTitle === null) return;
        const newBody = prompt('Edit body:', currentBody);
        if (newBody === null) return;

        const trimmedTitle = newTitle.trim();
        const trimmedBody = newBody.trim();
        if (!trimmedTitle || !trimmedBody) return alert('Title and body cannot be empty.');

        try {
          const {error} = await supabase
            .from('trade_board_posts')
            .update({title: trimmedTitle, body: trimmedBody})
            .eq('id', postId);
          if (error) throw error;
          loadBoard();
        } catch (err) {
          alert(err.message);
        }
      });
    });

    // Toggle close/reopen
    feed.querySelectorAll('.tb-toggle-close').forEach(btn => {
      btn.addEventListener('click', async () => {
        const postId = btn.dataset.postId;
        const postCard = feed.querySelector(`[data-post-id="${postId}"]`);
        const isClosed = postCard.classList.contains('closed');
        try {
          const {error} = await supabase
            .from('trade_board_posts')
            .update({is_closed: !isClosed})
            .eq('id', postId);
          if (error) throw error;
          loadBoard();
        } catch (err) {
          alert(err.message);
        }
      });
    });

    // Delete post
    feed.querySelectorAll('.tb-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const postId = btn.dataset.postId;
        if (!confirm('Delete this post and all its replies?')) return;
        try {
          const {error} = await supabase.from('trade_board_posts').delete().eq('id', postId);
          if (error) throw error;
          loadBoard();
        } catch (err) {
          alert(err.message);
        }
      });
    });

    // Add comment
    feed.querySelectorAll('.trade-board-comment-form').forEach(form => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const postId = form.dataset.postId;
        const body = form.body.value.trim();
        if (!body) return;
        if (!currentUser) return alert('Please sign in first.');

        const statusEl = form.querySelector('.form-status');
        statusEl.textContent = 'Posting…';
        try {
          const {error} = await supabase.from('trade_board_comments').insert({
            post_id: postId,
            author_id: currentUser.id,
            author_name: currentProfile?.display_name || currentUser.email,
            body
          });
          if (error) throw error;
          form.reset();
          statusEl.textContent = 'Replied!';
          setTimeout(() => statusEl.textContent = '', 1500);
          loadBoard();
        } catch (err) {
          statusEl.textContent = err.message;
          statusEl.style.color = 'var(--danger)';
        }
      });
    });

    // Delete comment
    feed.querySelectorAll('.tb-delete-comment').forEach(btn => {
      btn.addEventListener('click', async () => {
        const commentId = btn.dataset.commentId;
        if (!confirm('Delete this reply?')) return;
        try {
          const {error} = await supabase.from('trade_board_comments').delete().eq('id', commentId);
          if (error) throw error;
          loadBoard();
        } catch (err) {
          alert(err.message);
        }
      });
    });
  }

  // Initial auth check
  window.addEventListener('gate-auth-changed', updateAuthUI);
  updateAuthUI();

  // Realtime updates
  if (supabase) {
    supabase.channel('1048-trade-board')
      .on('postgres_changes', {event: '*', schema: 'public', table: 'trade_board_posts'}, loadBoard)
      .on('postgres_changes', {event: '*', schema: 'public', table: 'trade_board_comments'}, loadBoard)
      .subscribe();
  }
})();