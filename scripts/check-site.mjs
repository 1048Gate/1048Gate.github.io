import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

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

const scriptAssets = [...html.matchAll(/<script defer src="([^"]+)"/g)].map(match => match[1]);
const requiredScriptOrder = ['js/shared.js', 'js/supabase-config.js', 'js/auth.js', 'js/app.js'];
for(let index = 0; index < requiredScriptOrder.length; index++){
  if(scriptAssets[index] !== requiredScriptOrder[index]){
    throw new Error(`Core script order must begin: ${requiredScriptOrder.join(', ')}`);
  }
}

const leagueContent = readFileSync(new URL('js/league-content.js', root), 'utf8');
if(leagueContent.includes("from('league_members')") || leagueContent.includes('membersGrid')){
  throw new Error('league-content.js must not implement a second member data path or renderer.');
}

const sharedSource = readFileSync(new URL('js/shared.js', root), 'utf8');
const sharedContext = {window:{}, document:{}};
runInNewContext(sharedSource, sharedContext, {filename:'js/shared.js'});
const shared = sharedContext.window.gateShared;
if(!shared?.normalizeMember || !shared?.memberPresentation) throw new Error('shared.js did not publish the shared member utilities.');

const memberPayload = JSON.parse(readFileSync(new URL('data/members.json', root), 'utf8'));
const normalizedMembers = memberPayload.members.map(shared.normalizeMember);
if(normalizedMembers.length !== 12) throw new Error(`Expected 12 normalized members, found ${normalizedMembers.length}.`);
if(normalizedMembers.some(member => member.seasons.some(season => !('year' in season && 'team' in season && 'pointsFor' in season)))){
  throw new Error('Compact JSON seasons were not normalized to named fields.');
}
if(normalizedMembers.find(member => member.number === '10')?.role !== 'Admin') throw new Error('Collin\'s Admin role override was lost.');
const liveShape = shared.normalizeMember({member_number:'7', name:'Test', role_label:'League Member', member_seasons:[{season_year:2025, final_finish:2, team_name:'Test Team', record:'9-5', points_for:1700, points_against:1600}]});
if(liveShape.number !== '07' || liveShape.seasons[0]?.team !== 'Test Team') throw new Error('Supabase member rows were not normalized correctly.');

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

for(const [, imagePath] of sharedSource.matchAll(/['"](images\/team-logos\/[^'"]+)['"]/g)){
  if(!existsSync(new URL(imagePath, root))) throw new Error(`Missing member logo referenced by shared.js: ${imagePath}`);
}

const jsDir = new URL('js/', root);
let supabaseClientCreations = 0;
for(const entry of readdirSync(jsDir, {withFileTypes:true})){
  if(!entry.isFile() || !entry.name.endsWith('.js')) continue;
  const fileUrl = new URL(entry.name, jsDir);
  const source = readFileSync(fileUrl, 'utf8');
  if(/createElement\(['"](?:script|link)['"]\)/.test(source)){
    throw new Error(`${entry.name} still injects a script or stylesheet at runtime.`);
  }
  supabaseClientCreations += [...source.matchAll(/\bcreateClient\s*\(/g)].length;
  if(entry.name !== 'shared.js' && /const\s+esc\s*=.*replace\(/.test(source)){
    throw new Error(`${entry.name} defines its own HTML escaping helper instead of using shared.js.`);
  }
  execFileSync(process.execPath, ['--check', fileUrl.pathname], {stdio:'pipe'});
}
if(supabaseClientCreations !== 1) throw new Error(`Expected one shared Supabase client, found ${supabaseClientCreations}.`);

const appSource = readFileSync(new URL('js/app.js', root), 'utf8');
if(!appSource.includes("from('league_members')") || !appSource.includes("fetch('data/members.json'")){
  throw new Error('app.js must use Supabase first and members.json as its fallback.');
}
const communitySource = readFileSync(new URL('js/community.js', root), 'utf8');
if(communitySource.includes('createClient') || communitySource.includes('supabase-js@')){
  throw new Error('community.js must reuse the shared Supabase client.');
}

const views = new Set([...html.matchAll(/<section[^>]+id="([^"]+)"/g)].map(match => match[1]));
views.add('playoffs'); // Created synchronously by the explicit playoffs feature script.
for(const [, view] of html.matchAll(/<button[^>]+data-view="([^"]+)"/g)){
  if(!views.has(view)) throw new Error(`Navigation target does not exist: ${view}`);
}

console.log(`Site checks passed: ${localAssets.length} ordered CSS/JS assets, ${normalizedMembers.length} normalized members, ${teamLogos.length + 1} optimized images, and ${views.size} public views.`);
