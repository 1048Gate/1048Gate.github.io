// 1048 Gate Trade Board — message board for trade discussions
(async function(){
  const tradeSection = document.getElementById('trades');
  if(!tradeSection) return;

  const {escapeHtml:esc} = window.gateShared;
  const supabase = window.gateSupabase || await (window.gateSupabaseReady || Promise.resolve(null));
  let currentUser = null;
  let currentProfile = null;
  let activeFilter = 'all';
  let authAvailable = Boolean(supabase);

  // Find existing panels (authoritative markup from index.html)
  const historyPanel = tradeSection.querySelector('[data-trade-panel="history"]');
  const boardPanel = tradeSection.querySelector('[data-trade-panel="board"]');
  const subNav = tradeSection.querySelector('.trade-subnav');
  const filterNav = boardPanel?.querySelector('.trade-board-filters');
  const form = boardPanel?.querySelector('#tradeBoardForm');
  const feed = boardPanel?.querySelector('#tradeBoardFeed');
  const authStatusHost = boardPanel?.querySelector('#tradeBoardAuthStatus');

  if (!historyPanel || !boardPanel || !subNav || !filterNav || !form || !feed) return;

  // Tab switching - use existing subNav
  subNav.querySelectorAll('[data-trade-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tradeTab;
      subNav.querySelectorAll('[data-trade-tab]').forEach(b => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-selected', b === btn);
      });
      historyPanel.classList.toggle('active', tab === 'history');
      historyPanel.setAttribute('aria-hidden', tab !== 'history');
      boardPanel.classList.toggle('active', tab === 'board');
      boardPanel.setAttribute('aria-hidden', tab !== 'board');
      if (tab === 'history') historyPanel.hidden = false;
      else historyPanel.hidden = true;
      boardPanel.hidden = tab !== 'board';
      if (tab === 'board') loadBoard();
    });
  });

  // Filter switching
  filterNav.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter;
      filterNav.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active', b === btn));
      renderFilteredBoard();
    });
  });

  // Auth state handling
  async function updateAuthUI() {
    if (!supabase) {
      authAvailable = false;
      currentUser = null;
      currentProfile = null;
    } else {
      try {
        const {data: {session}, error: sessionError} = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        authAvailable = true;
        currentUser = session?.user || null;
        if (currentUser) {
          const {data: profile, error: profileError} = await supabase.from('profiles').select('role,display_name').eq('id', currentUser.id).maybeSingle();
          if (profileError) throw profileError;
          currentProfile = profile;
        } else {
          currentProfile = null;
        }
      } catch (_) {
        authAvailable = false;
        currentUser = null;
        currentProfile = null;
      }
    }
    renderAuthStatus();
    renderFormVisibility();
    renderFilteredBoard(); // re-render to show/hide delete buttons
  }

  function renderAuthStatus() {
    if (!authStatusHost) return;
    if (!authAvailable) {
      authStatusHost.innerHTML = '<span class="trade-board-user" role="status">Posting is temporarily unavailable.</span>';
    } else if (currentUser) {
      authStatusHost.innerHTML = `<span class="trade-board-user">Signed in as <strong>${esc(currentProfile?.display_name || currentUser.email)}</strong></span>`;
    } else {
      authStatusHost.innerHTML = `<button class="btn btn-ghost" id="tbSignInBtn">Sign in to post</button>`;
      authStatusHost.querySelector('#tbSignInBtn')?.addEventListener('click', () => {
        const authBtn = document.getElementById('authButton');
        authBtn?.click();
      });
    }
  }

  function renderFormVisibility() {
    if (!form) return;
    if (currentUser) {
      form.hidden = false;
    } else {
      form.hidden = true;
    }
  }

  // Post type display helpers
  const POST_TYPES = {
    on_the_block: {label: 'ON THE BLOCK', class: 'type-on-the-block'},
    looking_for: {label: 'LOOKING FOR', class: 'type-looking-for'},
    open_to_offers: {label: 'OPEN TO OFFERS', class: 'type-open-to-offers'},
    trade_discussion: {label: 'TRADE DISCUSSION', class: 'type-trade-discussion'}
  };

  function getPostTypeInfo(type) {
    return POST_TYPES[type] || {label: type?.toUpperCase() || 'UNKNOWN', class: ''};
  }

  // Load board posts
  async function loadBoard() {
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
          author_id, author_name, post_type, player_name, position,
          trade_board_comments (id, body, author_name, author_id, created_at)
        `)
        .order('created_at', {ascending: false});

      if (error) throw error;

      boardPanel.dataset.allPosts = JSON.stringify(posts || []);
      renderFilteredBoard();
    } catch (err) {
      console.error('Unable to load Trade Board:', err);
      feed.innerHTML = `<div class="panel community-empty community-error"><strong>Trade Board could not load.</strong><span>${esc(err.message)}</span></div>`;
    }
  }

  function renderFilteredBoard() {
    if (!feed) return;
    const posts = JSON.parse(boardPanel.dataset.allPosts || '[]');
    const filtered = activeFilter === 'all' ? posts : posts.filter(p => p.post_type === activeFilter);
    renderBoardPosts(filtered);
  }

  function renderBoardPosts(posts) {
    if (!feed) return;

    if (!posts.length) {
      const emptyMsg = activeFilter === 'all'
        ? 'No trade discussions yet. Be the first to post!'
        : `No ${POST_TYPES[activeFilter]?.label?.toLowerCase() || activeFilter} posts yet.`;
      feed.innerHTML = `<div class="panel community-empty">${esc(emptyMsg)}</div>`;
      attachPostListeners();
      return;
    }

    feed.innerHTML = posts.map(post => renderPostCard(post)).join('');
    attachPostListeners();
  }

  function renderPostCard(post) {
    const isAuthor = currentUser && post.author_id === currentUser.id;
    const isStaff = currentProfile && ['commissioner', 'site_admin'].includes(currentProfile.role);
    const canManagePost = isAuthor || isStaff;
    const typeInfo = getPostTypeInfo(post.post_type);
    const comments = (post.trade_board_comments || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const commentCount = comments.length;

    const playerLine = post.player_name ? `<span class="trade-board-player">${esc(post.player_name)}${post.position ? ` · ${esc(post.position)}` : ''}</span>` : '';

    return `
      <article class="panel trade-board-post${post.is_closed ? ' closed' : ''}" data-post-id="${post.id}" data-post-type="${esc(post.post_type)}">
        <header class="trade-board-post-head">
          <div class="trade-board-post-meta">
            <span class="trade-board-type-badge ${typeInfo.class}">${esc(typeInfo.label)}</span>
            <span class="trade-board-author">${esc(post.author_name)}${post.is_starter ? ' <span class="trade-starter-badge">Starter</span>' : ''}</span>
            <time datetime="${post.created_at}">${formatDate(post.created_at)}</time>
            ${post.updated_at !== post.created_at ? `<span class="trade-board-edited">edited ${formatDate(post.updated_at)}</span>` : ''}
          </div>
          <div class="trade-board-post-actions">
            ${canManagePost ? `
              <button type="button" class="btn btn-ghost btn-sm tb-toggle-close" data-post-id="${post.id}" aria-label="${post.is_closed ? 'Reopen' : 'Close'} post">
                ${post.is_closed ? 'Reopen' : 'Close'}
              </button>
              <button type="button" class="btn btn-ghost btn-sm tb-edit" data-post-id="${post.id}" aria-label="Edit post">Edit</button>
              <button type="button" class="btn btn-ghost btn-sm staff-danger tb-delete" data-post-id="${post.id}" aria-label="Delete post">Delete</button>
            ` : ''}
          </div>
        </header>
        ${playerLine}
        <h3 class="trade-board-post-title">${esc(post.title)}</h3>
        <div class="trade-board-post-body">${esc(post.body).replace(/\n/g, '<br>')}</div>
        ${post.is_closed ? '<div class="trade-board-closed-notice"><span>🔒</span> This discussion is closed.</div>' : ''}
        <section class="trade-board-comments">
          <div class="trade-board-comments-head">
            <span>Replies <strong>${commentCount}</strong></span>
          </div>
          <div class="trade-board-comment-list">
            ${comments.map(comment => renderComment(comment, isStaff)).join('')}
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

  function renderComment(comment, isStaff) {
    const isAuthor = currentUser && comment.author_id === currentUser.id;
    const canDelete = isAuthor || isStaff;

    return `
      <div class="trade-board-comment" data-comment-id="${comment.id}">
        <div class="trade-board-comment-meta">
          <span class="trade-board-comment-author">${esc(comment.author_name)}</span>
          <time datetime="${comment.created_at}">${formatDate(comment.created_at)}</time>
        </div>
        <p class="trade-board-comment-body">${esc(comment.body)}</p>
        ${canDelete ? `<button type="button" class="btn btn-ghost btn-sm tb-delete-comment" data-comment-id="${comment.id}" aria-label="Delete reply">Delete</button>` : ''}
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
    if (!feed) return;

    // Create post
    if (form.dataset.submitBound !== 'true') form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const statusEl = form.querySelector('.form-status');
      const postType = form.post_type.value;
      const playerName = form.player_name.value.trim();
      const position = form.position.value;
      const title = form.title.value.trim();
      const body = form.body.value.trim();
      if (!postType || !title || !body) return;
      if (!currentUser) return alert('Please sign in first.');

      statusEl.textContent = 'Posting…';
      try {
        const {error} = await supabase.from('trade_board_posts').insert({
          author_id: currentUser.id,
          post_type: postType,
          player_name: playerName || null,
          position: position || null,
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
    form.dataset.submitBound = 'true';

    // Edit post
    feed.querySelectorAll('.tb-edit').forEach(btn => {
      btn.addEventListener('click', async () => {
        const postId = btn.dataset.postId;
        const postCard = feed.querySelector(`[data-post-id="${postId}"]`);
        const titleEl = postCard.querySelector('.trade-board-post-title');
        const bodyEl = postCard.querySelector('.trade-board-post-body');
        const currentTitle = titleEl.textContent;
        const currentBody = bodyEl.innerText;

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
