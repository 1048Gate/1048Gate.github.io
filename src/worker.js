const REPOSITORY = '1048Gate/1048Gate.github.io';

function isRefreshDay(date = new Date()) {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short'
  }).format(date);
  return ['Thu', 'Fri', 'Sat', 'Sun', 'Mon'].includes(weekday);
}

async function dispatchRefresh(env) {
  if (!isRefreshDay()) return;
  if (!env.GITHUB_DISPATCH_TOKEN) {
    console.error('GITHUB_DISPATCH_TOKEN is not configured; GitHub cron remains the refresh fallback.');
    return;
  }
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/dispatches`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': '1048-gate-cloudflare-scheduler',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify({event_type: 'current-season-refresh'})
  });
  if (!response.ok) throw new Error(`GitHub repository dispatch failed with HTTP ${response.status}`);
}

export default {
  fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(dispatchRefresh(env));
  }
};

export {dispatchRefresh, isRefreshDay};
