import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/1048gate-data-health.yml', import.meta.url), 'utf8');

assert.match(workflow, /repository_dispatch:\s*\n\s*types: \[current-season-refresh\]/);
assert.match(workflow, /cron: '7,37 \* \* \* 0,1,4,5,6'/);

const rolloverStep = workflow.match(/- name: Finalize outgoing newspaper before week rollover[\s\S]*?(?=\n\s*- name: Publish standings and scoreboard)/)?.[0] || '';
assert.ok(rolloverStep, 'rollover finalization step should exist before the public board publish');
assert.match(rolloverStep, /--output "\$CANDIDATE" --no-sync-site-phase/);
assert.match(rolloverStep, /--week "\$SAVED_WEEK"/);
assert.match(rolloverStep, /FINAL_STATUS/);
assert.match(rolloverStep, /verified_final/);
assert.match(rolloverStep, /refusing to advance the public board/);
assert.ok(
  workflow.indexOf('- name: Finalize outgoing newspaper before week rollover') < workflow.indexOf('- name: Publish standings and scoreboard into data/current-season.json'),
  'outgoing newspaper must finalize before current-season.json advances to the next week',
);

const newspaperStep = workflow.match(/- name: Generate weekly newspaper[\s\S]*?(?=\n\s*- name: Refresh championship odds)/)?.[0] || '';
assert.ok(newspaperStep, 'newspaper step should exist');
assert.match(newspaperStep, /github\.event_name == 'workflow_dispatch'/);
assert.match(newspaperStep, /github\.event\.schedule == '15 8 \* \* \*'/);
assert.match(newspaperStep, /github\.event\.schedule == '20 12 \* \* 2'/);
assert.doesNotMatch(newspaperStep, /repository_dispatch/);
assert.doesNotMatch(newspaperStep, /7,37/);

console.log('Data-health workflow checks passed: rollover finalizes the outgoing paper before the public board advances, while routine live refreshes stay score-only.');
