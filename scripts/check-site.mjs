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

const leagueContent = readFileSync(new URL('js/league-content.js', root), 'utf8');
if(leagueContent.includes("from('league_members')") || leagueContent.includes('membersGrid')){
  throw new Error('league-content.js must not implement a second member data path or renderer.');
}

const sharedSource = readFileSync(new URL('js/shared.js', root), 'utf8');
const sharedContext = {window:{}, document:{}};
runInNewContext(sharedSource, sharedContext, {filename:'js/shared.js'});
const shared = sharedContext.window.gateShared;
if(!shared?.normalizeMember || !shared?.memberPresentation || !shared?.buildAcceptedTradeArchive) throw new Error('shared.js did not publish the shared member and trade utilities.');

const canonicalTradeFixture = shared.buildAcceptedTradeArchive([
  {season_year:2025, espn_transaction_id:'accept-a', related_transaction_id:'deal-a', transaction_type:'TRADE_ACCEPT', status:null, transaction_date_ms:100, scoring_period:5},
  {season_year:2025, espn_transaction_id:'accept-b', related_transaction_id:'deal-a', transaction_type:'TRADE_ACCEPT', status:'EXECUTED', transaction_date_ms:200, scoring_period:5},
  {season_year:2025, espn_transaction_id:'accept-canceled', related_transaction_id:'deal-a', transaction_type:'TRADE_ACCEPT', status:'CANCELED', transaction_date_ms:300, scoring_period:5},
  {season_year:2025, espn_transaction_id:'accept-missing', related_transaction_id:'deal-missing', transaction_type:'TRADE_ACCEPT', status:null, transaction_date_ms:400, scoring_period:6},
  {season_year:2025, espn_transaction_id:'accept-fallback', related_transaction_id:'deal-fallback', transaction_type:'TRADE_ACCEPT', status:null, transaction_date_ms:500, scoring_period:7}
], [
  {season_year:2025, espn_transaction_id:'deal-a', item_index:0, item_type:'TRADE', player_id:1, player_name:'Correct Player', from_team_id:1, from_team_name:'Alpha', to_team_id:2, to_team_name:'Beta'},
  {season_year:2025, espn_transaction_id:'accept-a', item_index:0, item_type:'DROP', player_id:2, player_name:'Roster Cut', from_team_id:1, from_team_name:'Alpha', to_team_id:0, to_team_name:''},
  {season_year:2025, espn_transaction_id:'accept-fallback', item_index:0, item_type:'TRADE', player_id:3, player_name:'Fallback Player', from_team_id:3, from_team_name:'Gamma', to_team_id:4, to_team_name:'Delta'}
]);
const canonicalDeal = canonicalTradeFixture.find(trade => trade.deal_id === 'deal-a');
const missingDeal = canonicalTradeFixture.find(trade => trade.deal_id === 'deal-missing');
const fallbackDeal = canonicalTradeFixture.find(trade => trade.deal_id === 'deal-fallback');
if(canonicalTradeFixture.length !== 3 || canonicalDeal?.acceptance_count !== 2 || canonicalDeal?.transaction_date_ms !== 200){
  throw new Error('Trade acceptance actions were not canonicalized into one completed deal.');
}
if(canonicalDeal.items.length !== 1 || canonicalDeal.items[0].player_name !== 'Correct Player' || canonicalDeal.items.some(item => item.player_name === 'Roster Cut')){
  throw new Error('Trade archive mixed roster-space drops into the traded-player details.');
}
if(!missingDeal?.incomplete || fallbackDeal?.items[0]?.player_name !== 'Fallback Player'){
  throw new Error('Trade archive must flag source gaps and retain accepted-event trade-item fallbacks.');
}

const memberPayload = JSON.parse(readFileSync(new URL('data/members.json', root), 'utf8'));
const normalizedMembers = memberPayload.members.map(shared.normalizeMember);
if(normalizedMembers.length !== 12) throw new Error(`Expected 12 normalized members, found ${normalizedMembers.length}.`);
if(normalizedMembers.some(member => member.seasons.some(season => !('year' in season && 'team' in season && 'pointsFor' in season)))){
  throw new Error('Compact JSON seasons were not normalized to named fields.');
}
if(normalizedMembers.find(member => member.number === '10')?.role !== 'Admin') throw new Error('Collin\'s Admin role override was lost.');
const liveShape = shared.normalizeMember({member_number:'7', name:'Test', role_label:'League Member', member_seasons:[{season_year:2025, final_finish:2, team_name:'Test Team', record:'9-5', points_for:1700, points_against:1600}]});
if(liveShape.number !== '07' || liveShape.seasons[0]?.team !== 'Test Team') throw new Error('Supabase member rows were not normalized correctly.');
if(shared.memberPresentation.initialsFor('George Travis') !== 'GT' || shared.memberPresentation.initialsFor('Tommy') !== 'TO'){
  throw new Error('Member initials must use first and last initials, with a safe one-name fallback.');
}
shared.memberPresentation.setRoster(['Bryan Hunt', 'Brian Heino', 'George Travis']);
if(shared.memberPresentation.initialsFor('Bryan Hunt') !== 'BHU' || shared.memberPresentation.initialsFor('Brian Heino') !== 'BHE'){
  throw new Error('Bryan Hunt and Brian Heino must use distinct initials (BHU / BHE).');
}
if(/images\/team-logos|member-logo/.test(`${html}\n${sharedSource}`)){
  throw new Error('Public member presentation must use initials instead of team logo assets.');
}

const siteConfig = JSON.parse(readFileSync(new URL('data/site.json', root), 'utf8'));
if(!Number.isInteger(siteConfig.seasonYear) || !Number.isInteger(siteConfig.seasonNumber) || !siteConfig.phase || !siteConfig.competition){
  throw new Error('data/site.json must define the current season year, number, phase, and competition.');
}
if(!siteConfig.draftNight?.startsAt || !Number.isInteger(siteConfig.draftNight.currentPick)){
  throw new Error('data/site.json must define draftNight.startsAt and currentPick.');
}
if(siteConfig.phase !== 'Post-Draft' || siteConfig.draftNight.status !== 'complete'){
  throw new Error('Szn 10 must be marked Post-Draft with a completed draft night.');
}
if(!siteConfig.draftOrder?.[0]?.player || siteConfig.draftOrder[0].player !== 'Jahmyr Gibbs'){
  throw new Error('First-round recap must include the 1.01 player from the Szn 10 draft.');
}

const draft2026 = JSON.parse(readFileSync(new URL('data/drafts/2026.json', root), 'utf8'));
if(draft2026.year !== 2026 || !Array.isArray(draft2026.picks) || draft2026.picks.length !== 192){
  throw new Error('Szn 10 draft archive must include 192 picks.');
}
if(draft2026.keepers !== 12 || !draft2026.picks.some(pick => pick[2] === 'Bijan Robinson' && pick[3] === 1)){
  throw new Error('Szn 10 draft archive must mark 12 keepers including Bijan Robinson.');
}
const draftIndex = JSON.parse(readFileSync(new URL('data/drafts/index.json', root), 'utf8'));
if(!draftIndex.seasons.some(row => row[0] === 2026 && row[3] === 192)){
  throw new Error('Draft index must include the 2026 season.');
}
const powerRankings = JSON.parse(readFileSync(new URL('data/power-rankings.json', root), 'utf8'));
if(powerRankings.basis !== 'post-draft' || !Array.isArray(powerRankings.ratings) || powerRankings.ratings.length !== 12){
  throw new Error('Power rankings must be the post-draft 12-manager board.');
}
const draftRanks = JSON.parse(readFileSync(new URL('data/draft-ranks.json', root), 'utf8'));
if(draftRanks.season !== 2026 || !Array.isArray(draftRanks.players) || draftRanks.players.length !== 192){
  throw new Error('Draft ranks feed must include all 192 Szn 10 picks.');
}
if(!html.includes('data-site-phase') || !html.includes('data-site-season') || !scriptAssets.includes('js/site-ui.js')){
  throw new Error('The season display must be driven by data/site.json through site-ui.js.');
}
if(!html.includes('class="hero-season-card"') || !html.includes('data-site-year') || !html.includes('data-site-season-label') || !html.includes('class="home-dashboard"')){
  throw new Error('The professional home dashboard and data-driven season card are missing.');
}
if([...html.matchAll(/<button[^>]+class="quick-card"[^>]+data-quick-view=/g)].length !== 6 || /class="quick-card"[^>]+onclick=/.test(html)){
  throw new Error('All six home quick cards must be native buttons without inline handlers.');
}
if([...html.matchAll(/class="quick-kicker"/g)].length !== 6 || html.includes('class="corkboard commissioner-board"')){
  throw new Error('Home directory labels or the clean league-office presentation regressed.');
}
if([...html.matchAll(/<button[^>]+class="accordion-head"[^>]+aria-expanded=/g)].length !== 6){
  throw new Error('Every rules accordion trigger must be an accessible button with aria-expanded.');
}
if(!html.includes('§2</span>Keepers') || !html.includes('Szn 10 locked keepers') || !html.includes('Bijan Robinson')){
  throw new Error('The Rules handbook must include the Szn 10 keeper section and locked keeper list.');
}
if(!html.includes('id="homeKeepers"') || !html.includes('id="membersKeepers"') || !html.includes('id="pastMembers"')){
  throw new Error('Home and Members must expose Keepers and Past members subsections.');
}
if(!html.includes('Ronnie Coiro') || !html.includes('Joey Dwulet') || !html.includes('Brian James') || !html.includes('Chardo BRYCE') || !html.includes('Ed Perrine') || !html.includes('Thomas Connelly')){
  throw new Error('Past members must list the six alumni.');
}
if(!html.includes('>Keepers</h2>') || !html.includes('>Past members</h2>')){
  throw new Error('Keepers and Past members subsection headings are missing.');
}

if(!html.includes('Lamb Fried Rice') || !html.includes('German Haro')){
  throw new Error('Wall of Shame fallback must name 2025 last place as Lamb Fried Rice / German Haro.');
}
if(!html.includes('id="homeKeepers"') || !html.includes('id="membersKeepers"') || !html.includes('id="pastMembers"')){
  throw new Error('Home and Members must expose Keepers and Past members subsections.');
}
if(!scriptAssets.includes('js/staff-loader.js')){
  throw new Error('Staff tools must load through js/staff-loader.js.');
}
if(scriptAssets.includes('js/admin.js') || scriptAssets.includes('js/league-admin.js') || scriptAssets.includes('js/playoffs-admin.js')){
  throw new Error('Admin scripts must stay off the guest path.');
}
if(html.includes('css/playoffs-admin.css')){
  throw new Error('playoffs-admin.css must not load on the guest path.');
}
if(!html.includes('id="authControlMount"') || !html.includes('class="member-modal-card" role="dialog" aria-modal="true"')){
  throw new Error('Stable authentication and accessible member-modal markup is missing.');
}
if(!html.includes('viewport-fit=cover')) throw new Error('iOS viewport-fit=cover is missing from the document head.');
if(!html.includes('rel="apple-touch-icon"') || !html.includes('images/apple-touch-icon.png')){
  throw new Error('The 180x180 apple-touch-icon is missing from index.html.');
}
if(!html.includes('id="playoffs"') || !html.includes('id="staff"') || !html.includes('id="phoneDock"') || !html.includes('id="phoneMore"')){
  throw new Error('Playoffs, Staff, and the phone dock must be present in index.html so hash routes resolve on first paint.');
}
if(html.includes('data-countdown-seconds') || html.includes('draft-countdown') || scriptAssets.includes('js/draft-countdown.js')){
  throw new Error('The draft countdown must be gone now that Szn 10 is drafted.');
}
if(html.includes('data-draft-order') || html.includes('id="draftBoard"') || html.includes('data-draft-night')){
  throw new Error('Home must not show the draft-order board after Szn 10.');
}
if(!html.includes('id="championshipOdds"') || !html.includes('data-scroll-to="championshipOdds"') || !html.includes('class="home-pulse"')){
  throw new Error('Home must lead with the post-draft pulse and championship odds.');
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

const appleIcon = new URL('images/apple-touch-icon.png', root);
if(!existsSync(appleIcon)) throw new Error('images/apple-touch-icon.png is missing.');
const appleBytes = readFileSync(appleIcon);
if(appleBytes.length < 24 || appleBytes.toString('ascii', 1, 4) !== 'PNG'){
  throw new Error('apple-touch-icon must be a PNG.');
}
const appleWidth = appleBytes.readUInt32BE(16);
const appleHeight = appleBytes.readUInt32BE(20);
if(appleWidth !== 180 || appleHeight !== 180){
  throw new Error(`apple-touch-icon is ${appleWidth}x${appleHeight}; required 180x180.`);
}

const jsDir = new URL('js/', root);
let supabaseClientCreations = 0;
for(const entry of readdirSync(jsDir, {withFileTypes:true})){
  if(!entry.isFile() || !entry.name.endsWith('.js')) continue;
  const fileUrl = new URL(entry.name, jsDir);
  const source = readFileSync(fileUrl, 'utf8');
  if(entry.name !== 'staff-loader.js' && /createElement\(['"](?:script|link)['"]\)/.test(source)){
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
if(!appSource.includes('closePhoneMore') || !appSource.includes('phoneDock') || !appSource.includes('data-more-toggle')){
  throw new Error('Phone dock navigation handlers are missing from app.js.');
}
if(!appSource.includes('trapFocus(event') || !appSource.includes('memberReturnFocus')){
  throw new Error('The member modal must trap focus and restore it when closed.');
}
if(!appSource.includes('const initialView = window.location.hash.slice(1)') || !appSource.includes("history.replaceState({view:'home'}, '', '#home')")){
  throw new Error('The application must support direct view links and establish a default home route.');
}
const historyLayoutSource = readFileSync(new URL('js/history-layout.js', root), 'utf8');
if(!historyLayoutSource.includes('ARCHIVE EXPLORER') || !historyLayoutSource.includes('data-history-tab="overview"') || !historyLayoutSource.includes('data-archive-season')){
  throw new Error('League History must provide a guided Archive Explorer before its detailed archive tables.');
}
const managerProfilesSource = readFileSync(new URL('js/manager-profiles.js', root), 'utf8');
if(!appSource.includes("'gate:member-profile-opened'") || !managerProfilesSource.includes("addEventListener('gate:member-profile-opened'")){
  throw new Error('The complete manager résumé must follow the shared member-profile-opened event.');
}
if(managerProfilesSource.includes('[data-i]')){
  throw new Error('manager-profiles.js still depends on the retired member-card data-i attribute.');
}
const communitySource = readFileSync(new URL('js/community.js', root), 'utf8');
if(communitySource.includes('createClient') || communitySource.includes('supabase-js@')){
  throw new Error('community.js must reuse the shared Supabase client.');
}
if(/mockPosts|mockPolls|Sample threads shown/.test(communitySource)){
  throw new Error('Community starter content must come from Supabase, not hard-coded browser fallbacks.');
}
if(!communitySource.includes("rpc('get_informal_polls'") || !communitySource.includes("rpc('cast_informal_poll_vote'")){
  throw new Error('Informal polls must use aggregate-only server RPCs.');
}
if(communitySource.includes("from('poll_votes')") || /select\([^)]*voter_id/.test(communitySource)){
  throw new Error('Vote Booth must not read individual voter identifiers from the browser.');
}
if(!communitySource.includes('Informal Vote Booth') || !communitySource.includes('informal feedback')){
  throw new Error('Vote Booth must clearly label device-based polls as informal.');
}
if(!communitySource.includes('is_starter') || !html.includes('id="commissionerBoard"')){
  throw new Error('Supabase-backed starter content or the commissioner announcement mount is missing.');
}
const authSource = readFileSync(new URL('js/auth.js', root), 'utf8');
if(!authSource.includes('trapFocus(event') || !authSource.includes("setAttribute('aria-hidden'")){
  throw new Error('The staff login modal must manage focus and aria-hidden.');
}
if(!authSource.includes('resetPasswordForEmail') || !authSource.includes("event === 'PASSWORD_RECOVERY'") || !authSource.includes('auth.updateUser({password})')){
  throw new Error('Staff authentication must support password recovery and secure password updates.');
}
if(!authSource.includes("password.length < 12") || !authSource.includes('If that account exists')){
  throw new Error('Password recovery must enforce the client minimum and avoid account enumeration.');
}
const adminSource = readFileSync(new URL('js/admin.js', root), 'utf8');
if(!adminSource.includes('league-announcement') || !adminSource.includes('memberPresentation.initialsFor')){
  throw new Error('Commissioner updates must use the clean initials-based league-office cards.');
}
const transactionSource = readFileSync(new URL('js/transactions.js', root), 'utf8');
if(!html.includes('id="transactions"') || !html.includes('data-view="transactions"')){
  throw new Error('Transaction archive view or navigation is missing.');
}
if(!transactionSource.includes("rpc('get_transaction_archive'") || !transactionSource.includes("rpc('get_transaction_archive_seasons'")){
  throw new Error('Transactions must use the paginated server archive RPCs.');
}
if(transactionSource.includes("from('league_transactions')") || transactionSource.includes("from('league_transaction_archive_items')")){
  throw new Error('Transactions must not query raw archive tables from the browser.');
}
if(!transactionSource.includes("addEventListener('gate:viewchange'") || !transactionSource.includes('source_detail_status')){
  throw new Error('Transaction data must stay lazy-loaded and display server-provided trade detail status.');
}
for(const type of ['FREEAGENT','WAIVER','TRADE_ACCEPT']){
  if(!transactionSource.includes(`'${type}'`)) throw new Error(`Curated transaction archive is missing ${type}.`);
}
if(html.includes('id="transactionType"') || !transactionSource.includes('data-transaction-category') || !transactionSource.includes('renderDayGroup') || !transactionSource.includes('transaction-ledger-row')){
  throw new Error('Transactions must use category navigation and the date-grouped activity ledger.');
}
if(!html.includes('class="transaction-guide"') || !html.includes('Completed trades') || !html.includes('Vetoed trades')){
  throw new Error('Transaction archive must explain its verified-data scope and expose every supported category.');
}
const titleOddsSource = readFileSync(new URL('js/title-odds.js', root), 'utf8');
if(!titleOddsSource.includes('Math.round(value * 100)') || titleOddsSource.includes('count / SIMULATIONS')){
  throw new Error('Playoff probability labels must format normalized probability values without dividing by the simulation count twice.');
}
if(!titleOddsSource.includes('function buildSchedule') || !titleOddsSource.includes('wins[play(home, away)]++')){
  throw new Error('Playoff simulations must use shared head-to-head matchups so total wins remain zero-sum.');
}
const tradeBoardSource = readFileSync(new URL('js/trade-board.js', root), 'utf8');
if(!tradeBoardSource.includes("form.dataset.submitBound !== 'true'") || !tradeBoardSource.includes("form.dataset.submitBound = 'true'")){
  throw new Error('The Trade Board create form must bind its submit handler exactly once.');
}
if(tradeBoardSource.includes('supabase?.auth.getSession()') || !tradeBoardSource.includes('Posting is temporarily unavailable.')){
  throw new Error('The Trade Board must degrade safely when Supabase authentication is unavailable.');
}
const tradeTalkSource = readFileSync(new URL('js/trade-talk.js', root), 'utf8');
if(!tradeTalkSource.includes("rpc('get_transaction_archive'") || !tradeTalkSource.includes('source_detail_status') || !tradeTalkSource.includes('source gap')){
  throw new Error('Trade Talk must use the canonical server archive and keep incomplete trades visible.');
}
if(tradeTalkSource.includes("from('league_transactions')") || tradeTalkSource.includes("from('league_transaction_archive_items')")){
  throw new Error('Trade Talk must not query raw archive tables from the browser.');
}
const migrationDir = new URL('supabase/migrations/', root);
const migrationFiles = readdirSync(migrationDir).filter(name => name.endsWith('.sql')).sort();
if(migrationFiles.length < 13 || !migrationFiles.includes('20260825012000_013_security_performance_release.sql')){
  throw new Error('Ordered Supabase migrations, including the security-performance release, are missing.');
}
const releaseSql = readFileSync(new URL('supabase/migrations/20260825012000_013_security_performance_release.sql', root), 'utf8');
for(const required of ['private.legacy_board_posts','private.legacy_board_comments','get_transaction_archive','get_informal_polls','cast_informal_poll_vote','drop policy if exists "Public can read league transactions"']){
  if(!releaseSql.includes(required)) throw new Error(`Security-performance migration is missing ${required}.`);
}
if(!existsSync(new URL('archive/legacy-board-production-export-2026-08-25.json', root))){
  throw new Error('Legacy board export must be retained before board retirement.');
}
if(/from\('board_posts'\)|from\('board_comments'\)/.test(adminSource)){
  throw new Error('Staff Tools must not depend on retired legacy board tables.');
}

const exportAll = readFileSync(new URL('scripts/export_all.py', root), 'utf8');
for(const exporter of ['export_web_data.py', 'export_seasons.py', 'export_matchups.py', 'export_playoffs.py', 'export_drafts.py', 'export_players.py', 'export_streaks.py', 'export_manager_profiles.py']){
  if(!exportAll.includes(`"${exporter}"`)) throw new Error(`export_all.py does not run ${exporter}.`);
}
for(const entry of readdirSync(new URL('scripts/', root), {withFileTypes:true})){
  if(!entry.isFile() || !entry.name.endsWith('.py')) continue;
  execFileSync('python3', ['-c', 'from pathlib import Path; import sys; source=Path(sys.argv[1]).read_text(encoding="utf-8"); compile(source, sys.argv[1], "exec")', new URL(`scripts/${entry.name}`, root).pathname], {stdio:'pipe'});
}

const views = new Set([...html.matchAll(/<section[^>]+id="([^"]+)"/g)].map(match => match[1]));
for(const [, view] of html.matchAll(/<button[^>]+data-view="([^"]+)"/g)){
  if(!views.has(view)) throw new Error(`Navigation target does not exist: ${view}`);
}

const buildSource = readFileSync(new URL('scripts/build-site.mjs', root), 'utf8');
if(!buildSource.includes('apple-touch-icon.png')){
  throw new Error('build-site.mjs must copy apple-touch-icon.png into dist.');
}

console.log(`Site checks passed: ${localAssets.length} ordered CSS/JS assets, ${normalizedMembers.length} normalized members, 1 optimized image, and ${views.size} public views.`);
