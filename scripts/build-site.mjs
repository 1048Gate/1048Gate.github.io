import {createHash} from 'node:crypto';
import {cp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {basename, dirname, extname, join} from 'node:path';

const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
await rm(dist, {recursive:true, force:true});
await mkdir(dist, {recursive:true});

let html = await readFile(new URL('index.html', root), 'utf8');
const assetPattern = /(?:href|src)="((?:css|js)\/[^"?]+\.(?:css|js))(?:\?[^"#]*)?"/g;
const assets = [...new Set([...html.matchAll(assetPattern)].map(match => match[1]))];
const manifest = {};

for(const asset of assets){
  const source = new URL(asset, root);
  const contents = await readFile(source);
  const extension = extname(asset);
  const filename = basename(asset, extension);
  const hash = createHash('sha256').update(contents).digest('hex').slice(0, 10);
  const hashedAsset = join(dirname(asset), `${filename}.${hash}${extension}`).replaceAll('\\', '/');

  await mkdir(new URL(`${dirname(hashedAsset)}/`, dist), {recursive:true});
  await writeFile(new URL(hashedAsset, dist), contents);
  const escapedAsset = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  html = html.replace(new RegExp(`"${escapedAsset}(?:\\?[^"#]*)?"`, 'g'), `"${hashedAsset}"`);
  manifest[asset] = hashedAsset;
}

await cp(new URL('data/', root), new URL('data/', dist), {recursive:true});
await mkdir(new URL('images/', dist), {recursive:true});
await cp(new URL('images/1048-gate-logo.webp', root), new URL('images/1048-gate-logo.webp', dist));
await cp(new URL('images/apple-touch-icon.png', root), new URL('images/apple-touch-icon.png', dist));
await cp(new URL('.nojekyll', root), new URL('.nojekyll', dist));
await writeFile(new URL('index.html', dist), html);
await writeFile(new URL('asset-manifest.json', dist), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Built dist with ${assets.length} content-hashed CSS/JS assets.`);
