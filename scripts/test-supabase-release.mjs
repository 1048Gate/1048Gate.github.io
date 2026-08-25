const baseUrl = process.env.SUPABASE_TEST_URL;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;

if(!baseUrl || !anonKey){
  throw new Error('SUPABASE_TEST_URL and SUPABASE_TEST_ANON_KEY are required for API-level release tests.');
}

const headers = {
  apikey:anonKey,
  Authorization:`Bearer ${anonKey}`,
  'Content-Type':'application/json'
};

async function request(path, options = {}){
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers:{...headers, ...(options.headers || {})}
  });
  const text = await response.text();
  let body = null;
  try{body = text ? JSON.parse(text) : null;}catch{body = text;}
  return {response, body};
}

async function expectDenied(path){
  const {response, body} = await request(path);
  if(response.ok){
    throw new Error(`Anonymous request unexpectedly succeeded for ${path}: ${JSON.stringify(body)}`);
  }
}

async function expectRpc(name, payload){
  const {response, body} = await request(`/rest/v1/rpc/${name}`, {
    method:'POST',
    body:JSON.stringify(payload)
  });
  if(!response.ok){
    throw new Error(`${name} failed with HTTP ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

await expectDenied('/rest/v1/league_transactions?select=id&limit=1');
await expectDenied('/rest/v1/league_transaction_items?select=id&limit=1');
await expectDenied('/rest/v1/league_transaction_archive_items?select=id&limit=1');
await expectDenied('/rest/v1/poll_votes?select=id,voter_id&limit=1');
await expectDenied('/rest/v1/board_posts?select=id&limit=1');
await expectDenied('/rest/v1/board_comments?select=id&limit=1');
await expectDenied('/rest/v1/rpc/current_user_role');

const archive = await expectRpc('get_transaction_archive', {
  p_page:1,
  p_page_size:2,
  p_season_year:2099,
  p_category:'all',
  p_search:null,
  p_sort:'newest'
});
if(typeof archive?.total_count !== 'number' || !Array.isArray(archive?.items) || archive.items.length > 2){
  throw new Error('Paginated transaction RPC returned an invalid page payload.');
}
if(JSON.stringify(archive).includes('raw_data')){
  throw new Error('Paginated transaction RPC exposed raw_data.');
}

const voterId = '00000000-0000-4000-8000-000000000999';
const polls = await expectRpc('get_informal_polls', {p_voter_id:voterId});
if(!Array.isArray(polls) || JSON.stringify(polls).includes('voter_id')){
  throw new Error('Informal poll RPC exposed voter identifiers or returned an invalid payload.');
}

console.log('Supabase anonymous API release tests passed.');
