# Codex instructions

## Repository skills

Codex discovers repository skills under `.agents/skills/`. Read the relevant
`SKILL.md` before using a skill and load its supporting files as needed.
Use the existing checkout; do not create a Git worktree unless requested.

Available packages:

- `agent-browser`: browser automation and functional UI checks.
- `vercel-react-best-practices`: React/Next.js performance guidance, when applicable.
- `web-design-guidelines`: UI and accessibility review.
- `frontend-design`: UI design work when requested.
- `diagnosing-bugs`: reproduce and investigate bugs with a testable feedback loop.
- `code-review`: review diffs against repository standards and the requested specification.

Skill availability does not authorize redesigns, production writes, deployments,
or changes outside the user's task. This site uses plain HTML/CSS/JavaScript;
do not introduce React or Next.js merely to apply a skill.

Package provenance is recorded in `.agents/skills/sources.json`. Preserve whole
upstream packages, including their references, scripts, templates, assets, and
licenses. The agent-browser package is pinned to the complete v0.21.4 package;
newer upstream releases replace it with a CLI discovery stub. Its CLI/browser
runtime is a separate prerequisite and is not installed by vendoring the skill.

Development checks, from the repository root:

```sh
npm ci
npm test
WRANGLER_SEND_METRICS=false XDG_CONFIG_HOME=/workspace/.config npm run cloudflare:check
```

These checks build locally and run a deployment dry run; they do not deploy.
