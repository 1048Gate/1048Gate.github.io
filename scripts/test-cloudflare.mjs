import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFile, readdir} from 'node:fs/promises';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';

const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
// Reserve an available port so this check can run beside `npm run dev`.
const socket = createServer();
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [
  fileURLToPath(new URL('node_modules/wrangler/bin/wrangler.js', root)),
  'dev', '--local', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', '0'
], {cwd:root, env:{...process.env, WRANGLER_SEND_METRICS:'false'}, stdio:['ignore', 'pipe', 'pipe']});
let logs = '';
for(const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { logs = (logs + chunk).slice(-16000); });
const exited = once(child, 'exit');

async function request(path, options = {}){
  return fetch(`${origin}${path}`, {redirect:'manual', signal:AbortSignal.timeout(10000), ...options});
}
async function files(directory, prefix = ''){
  const result = [];
  for(const entry of await readdir(directory, {withFileTypes:true})){
    if(entry.isDirectory()) result.push(...await files(new URL(`${entry.name}/`, directory), `${prefix}${entry.name}/`));
    else result.push(`${prefix}${entry.name}`);
  }
  return result;
}

try{
  let ready = false;
  for(let attempt = 0; attempt < 120; attempt++){
    if(child.exitCode !== null) throw new Error(`Wrangler exited with ${child.exitCode}`);
    try { if((await request('/')).status === 200){ ready = true; break; } } catch {}
    await delay(250);
  }
  assert.ok(ready, 'Wrangler did not become ready');
  const html = await readFile(new URL('index.html', dist), 'utf8');
  const home = await request('/');
  assert.equal(await home.text(), html);
  assert.match(home.headers.get('content-type'), /text\/html/);
  assert.match(home.headers.get('cache-control'), /max-age=0/);
  const index = await request('/index.html?check=1');
  assert.ok([307, 308].includes(index.status));
  assert.equal(new URL(index.headers.get('location'), origin).pathname, '/');
  assert.equal(new URL(index.headers.get('location'), origin).search, '?check=1');
  const redirected = await request('/index.html?check=1', {redirect:'follow'});
  assert.equal(redirected.status, 200);
  assert.equal(await redirected.text(), html, 'Index redirect must serve HTML with query parameters');
  assert.equal((await request('/', {method:'HEAD'})).status, 200);

  const manifest = JSON.parse(await readFile(new URL('asset-manifest.json', dist), 'utf8'));
  const hashed = new Set(Object.values(manifest));
  const artifactFiles = await files(dist);
  for(const match of html.matchAll(/(?:href|src)="((?:images|css|js)\/[^"?#]+)(?:[?#][^"]*)?"/g)){
    assert.ok(artifactFiles.includes(match[1]), `HTML references an asset missing from the build: ${match[1]}`);
  }
  let served = 0;
  for(const path of artifactFiles){
    if(path === '_headers') continue;
    const response = await request(path === 'index.html' ? '/' : `/${path}`);
    assert.equal(response.status, 200, `${path} must be served`);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.deepEqual(bytes, await readFile(new URL(path, dist)), `${path} content changed in transit`);
    if(path.endsWith('.json')){
      assert.match(response.headers.get('content-type'), /application\/json/, path);
      JSON.parse(bytes.toString());
      assert.match(response.headers.get('cache-control'), /max-age=0/, path);
    }
    if(hashed.has(path)){
      assert.match(response.headers.get('content-type'), path.endsWith('.css') ? /text\/css/ : /javascript/, path);
      assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable', path);
    }
    if(path.startsWith('data/')) assert.deepEqual(bytes, await readFile(new URL(path, root)), `${path} archive must remain unchanged`);
    served++;
  }
  // Includes lazy staff assets that are not linked directly from index.html.
  for(const path of hashed) assert.ok(artifactFiles.includes(path), `Missing manifest asset ${path}`);
  for(const path of ['/missing', '/trades', '/newspaper', '/data/missing.json', '/js/missing.js', '/images/missing.png', '/_headers', '/.env', '/.dev.vars', '/package.json', '/wrangler.jsonc', '/supabase/schema.sql', '/scripts/build-site.mjs', '/archive/legacy-board-production-export-2026-08-25.json']){
    const response = await request(path, {headers:{'Sec-Fetch-Mode':'navigate'}});
    assert.equal(response.status, 404, `${path} must be a real 404, never the application HTML`);
  }
  const json = await request('/data/current-season.json?cache-check=1');
  assert.equal(json.status, 200);
  const etag = json.headers.get('etag');
  assert.ok(etag, 'JSON must support conditional revalidation');
  assert.equal((await request('/data/current-season.json?cache-check=1', {headers:{'If-None-Match':etag}})).status, 304);
  console.log(`Cloudflare checks passed: ${served} public files, ${hashed.size} hashed assets, unchanged archive data, MIME types, caching, redirects, HEAD, conditional GET, and private/missing-file 404s.`);
}catch(error){
  console.error(logs);
  throw error;
}finally{
  child.kill('SIGTERM');
  await exited;
}
