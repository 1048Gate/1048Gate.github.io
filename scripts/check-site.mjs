import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';

const root = new URL('../', import.meta.url);
const indexPath = new URL('index.html', root);
const html = readFileSync(indexPath, 'utf8');
const localAssets = [...html.matchAll(/(?:href|src)="((?:css|js)\/[^"?]+\.(?:css|js))"/g)].map(match => match[1]);
const duplicateAssets = localAssets.filter((asset, index) => localAssets.indexOf(asset) !== index);

if(duplicateAssets.length) throw new Error(`Duplicate assets in index.html: ${[...new Set(duplicateAssets)].join(', ')}`);
for(const asset of localAssets){
  if(!existsSync(new URL(asset, root))) throw new Error(`Missing asset referenced by index.html: ${asset}`);
}

if(html.includes('EST. 2016')) throw new Error('The old 2016 founding year is still present in index.html.');
if(/[?&]v=20\d{6}/.test(html)) throw new Error('A manual date-based cache-busting query remains in index.html.');
if(html.includes('member-logo-patch')) throw new Error('The retired member logo patch is still referenced.');

const leagueContent = readFileSync(new URL('js/league-content.js', root), 'utf8');
if(!leagueContent.includes('memberPresentation.logoFor') || !leagueContent.includes('member-head-with-logo')){
  throw new Error('Supabase member cards must preserve the shared member-logo presentation.');
}

function webpDimensions(fileUrl){
  const data = readFileSync(fileUrl);
  if(data.length < 30 || data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WEBP'){
    throw new Error(`${fileUrl.pathname} is not a genuine WebP image.`);
  }

  const format = data.toString('ascii', 12, 16);
  if(format === 'VP8X'){
    return {width: data.readUIntLE(24, 3) + 1, height: data.readUIntLE(27, 3) + 1};
  }
  if(format === 'VP8L'){
    const b1 = data[21], b2 = data[22], b3 = data[23], b4 = data[24];
    return {
      width: 1 + (((b2 & 0x3f) << 8) | b1),
      height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6))
    };
  }
  if(format === 'VP8 ' && data.toString('hex', 23, 26) === '9d012a'){
    return {width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff};
  }

  throw new Error(`Unsupported WebP encoding in ${fileUrl.pathname}.`);
}

function checkWebp(fileUrl, {maxBytes, maxDimension}){
  const filename = fileUrl.pathname.split('/').pop();
  if(/\s/.test(filename)) throw new Error(`Image filenames cannot contain whitespace: ${filename}`);
  if(!filename.endsWith('.webp')) throw new Error(`Web images must use WebP: ${filename}`);
  const bytes = statSync(fileUrl).size;
  if(bytes > maxBytes) throw new Error(`${filename} is ${(bytes / 1024).toFixed(1)} KB; maximum is ${maxBytes / 1024} KB.`);
  const {width, height} = webpDimensions(fileUrl);
  if(width > maxDimension || height > maxDimension){
    throw new Error(`${filename} is ${width}x${height}; maximum dimension is ${maxDimension}px.`);
  }
}

const mainLogo = new URL('images/1048-gate-logo.webp', root);
checkWebp(mainLogo, {maxBytes: 100 * 1024, maxDimension: 512});

const teamLogoDir = new URL('images/team-logos/', root);
const teamLogos = readdirSync(teamLogoDir, {withFileTypes:true}).filter(entry => entry.isFile());
if(teamLogos.length !== 12) throw new Error(`Expected 12 team logos, found ${teamLogos.length}.`);
for(const logo of teamLogos){
  checkWebp(new URL(logo.name, teamLogoDir), {maxBytes: 75 * 1024, maxDimension: 256});
}

const appSource = readFileSync(new URL('js/app.js', root), 'utf8');
for(const [, imagePath] of appSource.matchAll(/['"](images\/team-logos\/[^'"]+)['"]/g)){
  if(!existsSync(new URL(imagePath, root))) throw new Error(`Missing member logo referenced by app.js: ${imagePath}`);
}

const jsDir = new URL('js/', root);
for(const entry of readdirSync(jsDir, {withFileTypes:true})){
  if(!entry.isFile() || !entry.name.endsWith('.js')) continue;
  const fileUrl = new URL(entry.name, jsDir);
  const source = readFileSync(fileUrl, 'utf8');
  if(/createElement\(['"](?:script|link)['"]\)/.test(source)){
    throw new Error(`${entry.name} still injects a script or stylesheet at runtime.`);
  }
  execFileSync(process.execPath, ['--check', fileUrl.pathname], {stdio:'pipe'});
}

const views = new Set([...html.matchAll(/<section[^>]+id="([^"]+)"/g)].map(match => match[1]));
views.add('playoffs'); // Created synchronously by the explicit playoffs feature script.
for(const [, view] of html.matchAll(/<button[^>]+data-view="([^"]+)"/g)){
  if(!views.has(view)) throw new Error(`Navigation target does not exist: ${view}`);
}

console.log(`Site checks passed: ${localAssets.length} ordered CSS/JS assets, ${teamLogos.length + 1} optimized images, and ${views.size} public views.`);
