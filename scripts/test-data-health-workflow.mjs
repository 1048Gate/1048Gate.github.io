import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const scores = read('.github/workflows/1048gate-data-health.yml');
const paper = read('.github/workflows/1048gate-newspaper.yml');
assert.match(scores, /types: \[current-season-refresh\]/);
assert.match(scores, /cron: '7,37 \* \* \* 0,1,4,5,6'/);
assert.doesNotMatch(scores, /python3 scripts\/generate_newspaper\.py|newspaper_due|Finalize outgoing|20 12/);
assert.match(paper, /cron: '0 11 \* \* 2'/);
assert.match(paper, /cron: '0 12 \* \* 2'/);
assert.doesNotMatch(paper, /cron: '[^']+\* \* \*'/);
assert.match(paper, /newspaper_publication\.py --schedule/);
assert.match(paper, /if: needs\.publication-window\.outputs\.due == 'true'/);
assert.match(paper, /--week "\$WEEK" --output data\/current-season\.json --no-sync-site-phase/);
assert.match(paper, /source_status'\] == 'verified_final'/);
assert.match(paper, /git restore data\/current-season\.json/);
assert.match(scores, /python3 scripts\/backfill_completed_weeks\.py/);
const catchup = scores.split(/^      - /m).find(step => /run: python3 scripts\/backfill_completed_weeks\.py/.test(step));
assert.ok(catchup, 'Keep the historical catch-up step');
assert.doesNotMatch(catchup, /continue-on-error:/, 'Catch-up handles historical failures and surfaces live-board corruption');
assert.ok(scores.indexOf('python3 scripts/backfill_completed_weeks.py') < scores.indexOf('id: score_source'), 'Catch up before replacing the saved live week');
for(const restore of paper.matchAll(/^\s*git restore (.+)$/gm)){
  assert.equal(restore[1].trim(), 'data/current-season.json', 'Retain the archive merge and rebuild derived data');
}
const restored = paper.slice(paper.indexOf('git restore data/current-season.json'));
const commands = ['npm run futures', 'node scripts/build-homepage-week.mjs', 'node scripts/build-static-week-board.mjs', 'npm run check', 'git add'];
for(let i=0; i<commands.length; i++){
  assert.ok(restored.indexOf(commands[i]) >= 0, `After restoring live board: ${commands[i]}`);
  if(i) assert.ok(restored.indexOf(commands[i-1]) < restored.indexOf(commands[i]), 'Rebuild in dependency order before staging');
}
const staged = paper.match(/^\s*git add (.+)$/m)?.[1].split(/\s+/) || [];
for(const file of ['data/newspaper_editions', 'data/matchups.json', 'data/streaks.json', 'data/site.json', 'data/power-rankings.json', 'data/homepage-week.json', 'index.html']){
  assert.ok(staged.includes(file), `Stage consistent newspaper output: ${file}`);
}
for(const workflow of [scores, paper]) assert.match(workflow, /group: data-health-current-season/);
for(const name of ['pages','cloudflare']) assert.match(read(`.github/workflows/${name}.yml`), /- Publish completed weekly newspaper/);
assert.match(scores, /always\(\) && steps\.fantasy_collect\.outcome == 'failure'/);
const publisher = scores.split('  publish-current-season:')[1].split('  private-collection-status:')[0];
assert.doesNotMatch(publisher, /exit 1/);
assert.match(publisher, /id: fantasy_collect[\s\S]*?continue-on-error: true/);
assert.match(publisher, /private_collection: \$\{\{ steps.fantasy_collect.outcome \}\}/);
assert.match(scores, /needs: publish-current-season/);
assert.match(scores, /needs.publish-current-season.outputs.private_collection == 'failure'/);
assert.ok(publisher.indexOf('--validate-only') < publisher.indexOf('git push'));
assert.ok(publisher.indexOf('npm run check') < publisher.indexOf('git push'));
for(const name of ['pages','cloudflare']){
  const deployment = read(`.github/workflows/${name}.yml`);
  assert.match(deployment, /actions: read/);
  assert.match(deployment, /scripts\/publication-policy.cjs/);
  assert.match(deployment, /needs: publication-permission/);
  assert.match(deployment, /if: needs.publication-permission.outputs.allowed == 'true'/);
}
assert.equal((scores.match(/python3 scripts\/collect_fantasy_data.py/g) || []).length, 1);
console.log('Data-health checks passed: score publishing and Tuesday final editorial are independent.');

// Validate dependency setup per job: an install in a different job cannot help
// a clean runner. Keep this inventory open to new workflows that run checks.
const {readdirSync}=await import('node:fs');
for(const file of readdirSync(new URL('../.github/workflows/',import.meta.url)).filter(name=>/\.ya?ml$/.test(name))){
  const jobs=read(`.github/workflows/${file}`).split(/^jobs:\s*$/m)[1] || '';
  for(const match of jobs.matchAll(/^  ([\w-]+):\s*\n([\s\S]*?)(?=^  [\w-]+:|$(?![\s\S]))/gm)){
    const [,job,source]=match;
    const steps=source.split(/^      - /m).slice(1);
    const check=steps.findIndex(step=>/\bnpm run check\b/.test(step));
    if(check<0)continue;
    const label=`${file}:${job}`;
    assert.doesNotMatch(steps[check],/continue-on-error:\s*true/,`${label}: validation must fail closed`);
    if(file==='1048gate-import-transactions.yml')assert.doesNotMatch(steps[check],/^\s*if:/m,`${label}: precheck must not be skipped`);
    const install=steps.findIndex(step=>/run:\s*npm ci\s*$/m.test(step));
    assert.ok(install>=0&&install<check,`${label}: npm ci must precede site checks in the same job`);
    assert.doesNotMatch(steps[install],/continue-on-error:\s*true/,`${label}: dependency installation must fail closed`);
    const installGuard=steps[install].match(/^\s*if:\s*(.+)$/m)?.[1];
    const checkGuard=steps[check].match(/^\s*if:\s*(.+)$/m)?.[1];
    if(installGuard)assert.equal(installGuard,checkGuard,`${label}: install must run whenever checks run`);
    const setup=steps.findIndex(step=>/uses: actions\/setup-node@/.test(step));
    assert.ok(setup>=0&&setup<install,`${label}: set up Node before installation`);
    assert.match(steps[setup],/node-version: 22\b/,`${label}: use the working data-health Node version`);
  }
}

for(const [file,job,work] of [
  ['1048gate-newspaper.yml','publish-newspaper','Fetch completed week for editorial only'],
  ['futures.yml','refresh','Recompute odds from season data'],
  ['1048gate-import-transactions.yml','import-transactions','Fetch ESPN player-card transactions']
]){
  const source=read(`.github/workflows/${file}`).split(`  ${job}:`)[1];
  assert.ok(source.indexOf('run: npm ci')<source.indexOf(`- name: ${work}`),`${file}: install before collection/generation`);
}
const transactions=read('.github/workflows/1048gate-import-transactions.yml');
const precheck=transactions.indexOf('run: npm run check');
assert.ok(precheck>=0&&precheck<transactions.indexOf('- name: Fetch ESPN'), 'Transaction precheck must finish before collection or database import');
assert.equal((transactions.match(/npm run check/g)||[]).length,1,'Do not leave a misleading post-import precheck');
assert.doesNotMatch(transactions.slice(precheck),/if:.*always\(\)|continue-on-error:\s*true/,'Do not bypass transaction precheck failures');
console.log('Workflow dependency checks passed: same-job locked installs and pre-import validation.');
