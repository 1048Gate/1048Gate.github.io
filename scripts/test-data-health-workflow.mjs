import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/1048gate-data-health.yml', import.meta.url), 'utf8');

assert.match(workflow, /repository_dispatch:\s*\n\s*types: \[current-season-refresh\]/);
assert.match(workflow, /cron: '7,37 \* \* \* 0,1,4,5,6'/);

const newspaperStep = workflow.match(/- name: Generate weekly newspaper[\s\S]*?(?=\n\s*- name: Refresh championship odds)/)?.[0] || '';
assert.ok(newspaperStep, 'newspaper step should exist');
assert.match(newspaperStep, /github\.event_name == 'workflow_dispatch'/);
assert.match(newspaperStep, /github\.event\.schedule == '15 8 \* \* \*'/);
assert.match(newspaperStep, /github\.event\.schedule == '20 12 \* \* 2'/);
assert.doesNotMatch(newspaperStep, /repository_dispatch/);
assert.doesNotMatch(newspaperStep, /7,37/);

console.log('Data-health workflow checks passed: live refresh stays score-only and newspaper runs on controlled lifecycle passes.');
