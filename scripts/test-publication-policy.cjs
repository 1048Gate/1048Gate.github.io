const assert = require('node:assert/strict');
const publicationAllowed = require('./publication-policy.cjs');

(async () => {
  for(const publicResult of ['success', 'failure']){
    for(const privateResult of ['success', 'failure']){
      const context = {eventName:'workflow_run', repo:{owner:'fixture', repo:'site'}, payload:{workflow_run:{
        id:42, run_attempt:2, name:'Data health and current-season fetch',
        conclusion:publicResult === 'success' && privateResult === 'success' ? 'success' : 'failure'
      }}};
      const api = () => {};
      const github = {rest:{actions:{listJobsForWorkflowRunAttempt:api}}, async paginate(method, args){
        assert.equal(method, api);
        assert.equal(args.run_id, 42);
        assert.equal(args.attempt_number, 2);
        return [{name:'Publish current-season.json from ESPN', conclusion:publicResult},
          {name:'Report private collection failure', conclusion:privateResult}];
      }};
      assert.equal(await publicationAllowed({github, context}), publicResult === 'success', `${publicResult}/${privateResult}`);
    }
  }
  const context = {eventName:'workflow_run', repo:{}, payload:{workflow_run:{
    id:43, run_attempt:1, name:'Data health and current-season fetch', conclusion:'failure'
  }}};
  const github = {rest:{actions:{}}, paginate:async () => [{name:'Publish current-season.json from ESPN', conclusion:'skipped'}]};
  assert.equal(await publicationAllowed({github, context}), false);
  github.paginate = async () => [];
  assert.equal(await publicationAllowed({github, context}), false);
  github.paginate = async () => {throw new Error('fixture API failure');};
  await assert.rejects(publicationAllowed({github, context}), /fixture API failure/);
  context.payload.workflow_run.conclusion = 'cancelled';
  assert.equal(await publicationAllowed({github, context}), false);
  context.payload.workflow_run.name = 'Publish completed weekly newspaper';
  context.payload.workflow_run.conclusion = 'failure';
  assert.equal(await publicationAllowed({github, context}), false);
  context.payload.workflow_run.conclusion = 'success';
  assert.equal(await publicationAllowed({github, context}), true);
  context.eventName = 'pull_request';
  assert.equal(await publicationAllowed({github, context}), true);
  console.log('Publication policy passed: all four public/private outcomes, missing/skipped publisher, cancellation, exact run attempt, and newspaper gating.');
})().catch(error => {console.error(error); process.exitCode = 1;});
