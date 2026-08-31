import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const root = new URL('../', import.meta.url);
const indexPath = new URL('index.html', root);
const html = readFileSync(indexPath, 'utf8');
const localAssets = [...html.matchAll(/(?:href|src)="((?:css|js)\/[^"?]+\.(?:css|js))(?:\?[^"#]*)?"/g)].map(match => match[1]);
const duplicateAssets = localAssets.filter((asset, index) => localAssets.indexOf(asset) !== index);

if(duplicateAssets.length) throw new Error(`Duplicate assets in index.html: ${[...new Set(duplicateAssets)].join(', ')}`);
for(const asset of localAssets){
  if(!existsSync(new URL(asset, root))) throw new Error(`Missing asset referenced by index.html: ${asset}`);
}

if(html.includes('EST. 2016')) throw new Error('The old 2016 founding year is still present in index.html.');
if(/[?&]v=20\d{6}/.test(html)) throw new Error('A manual date-based cache-busting query remains in index.html.');
if(html.includes('member-logo-patch')) throw new Error('The retired member logo patch is still referenced.');

const scriptAssets = [...html.matchAll(/<script defer src="((?:js)\/[^"?]+\.js)(?:\?[^"#]*)?"/g)].map(match => match[1]);
const requiredScriptOrder = ['js/shared.js', 'js/site-ui.js', 'js/supabase-config.js', 'js/auth.js', 'js/app.js'];
for(let index = 0; index < requiredScriptOrder.length; index++){
  if(scriptAssets[index] !== requiredScriptOrder[index]){
    throw new Error(`Core script order must begin: ${requiredScriptOrder.join(', ')}`);
  }
}
