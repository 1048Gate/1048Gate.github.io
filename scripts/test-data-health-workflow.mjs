import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/1048gate-data-health.yml', import.meta.url), 'utf8');

assert.match(workflow, /repository_dispatch:\s*\n\s*types: \[current-season-refresh\]/);
assert.match(workflow, /cron: '7,37 \* \* \* 0,1,4,5,6'/);

const rolloverStep = workflow.match(/- name: Finalize outgoing newspaper before week rollover[\s\S]*?(?=\n\s*- name: Publish standings and scoreboard)/)?.[0] || '';
assert.ok(rolloverStep, 'rollover finalization step should exist before the public board publish');
assert.match(rolloverStep, /--output "\$CANDIDATE" --no-sync-site-phase/);
assert.match(rolloverStep, /--week "\$SAVED_WEEK"/);
assert.match(rolloverStep, /update_matchup_leaderboards\.py[\s\S]*npm run futures[\s\S]*generate_newspaper\.py/);
assert.match(rolloverStep, /FINAL_STATUS/);
assert.match(rolloverStep, /verified_final/);
assert.match(rolloverStep, /refusing to advance the public board/);
assert.ok(
  workflow.indexOf('- name: Finalize outgoing newspaper before week rollover') < workflow.indexOf('- name: Publish standings and scoreboard into data/current-season.json'),
  'outgoing newspaper must finalize before current-season.json advances to the next week',
);

const newspaperStep = workflow.match(/- name: Generate weekly newspaper[\s\S]*?(?=\n\s*- name: Rebuild the homepage week payload)/)?.[0] || '';
assert.ok(newspaperStep, 'newspaper step should exist');
assert.ok(workflow.indexOf('- name: Refresh completed scores and weekly ratings') < workflow.indexOf('- name: Generate weekly newspaper'));
assert.match(newspaperStep, /github\.event_name == 'workflow_dispatch'/);
assert.match(newspaperStep, /steps\.newspaper_due\.outputs\.due == 'true'/);
assert.match(newspaperStep, /continue-on-error: true/);
assert.match(workflow, /ALLOW_PENDING_WEEKLY_EDITION: 'true'/);
assert.match(workflow, /- name: Check whether live newspaper needs its first publication/);
assert.match(newspaperStep, /github\.event\.schedule == '15 8 \* \* \*'/);
assert.match(newspaperStep, /github\.event\.schedule == '20 12 \* \* 2'/);
assert.doesNotMatch(newspaperStep, /repository_dispatch/);
assert.doesNotMatch(newspaperStep, /7,37/);

const collectorFailureStep = workflow.match(/- name: Fail the run when owner snapshot collection failed[\s\S]*?(?=\n  fetch-trade-history:)/)?.[0] || '';
assert.match(collectorFailureStep, /always\(\) && steps\.fantasy_collect\.outcome == 'failure'/);
assert.match(collectorFailureStep, /exit 1/);
assert.ok(workflow.indexOf('- name: Commit updated board and derived data') < workflow.indexOf('- name: Fail the run when owner snapshot collection failed'));

console.log('Data-health workflow checks passed: rollover finalizes the outgoing paper before the public board advances, while routine live refreshes stay score-only.');
