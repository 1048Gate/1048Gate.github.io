// A failed private collection/probe must not hide a successful public publisher.
// Query the exact upstream run attempt, never a prior attempt or another run.
module.exports = async function publicationAllowed({github, context}) {
  if(context.eventName !== 'workflow_run') return true;
  const run = context.payload.workflow_run;
  if(run.name !== 'Data health and current-season fetch') return run.conclusion === 'success';
  if(!['success', 'failure'].includes(run.conclusion)) return false;
  const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRunAttempt, {
    ...context.repo, run_id:run.id, attempt_number:run.run_attempt, per_page:100
  });
  return jobs.some(job => job.name === 'Publish current-season.json from ESPN' && job.conclusion === 'success');
};
