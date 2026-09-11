# Cloudflare hosting migration

This migration deploys the existing website to **Cloudflare Workers Static Assets**, retaining the existing Supabase project and GitHub Pages rollback site. There is no database migration, server-side application, Worker fetch handler, or deprecated Workers Sites configuration.

## Deployment and verification record

- Primary domain: **https://1048gate.com/**; `https://www.1048gate.com/` serves the same site.
- Parallel test address: **https://1048-gate.twohoundsrun.workers.dev**
- Retained GitHub Pages site: **https://1048gate.github.io/**
- Worker: `1048-gate`; Wrangler pinned to `4.131.0` in the lockfile.
- Final deployment version: `5143a789-d481-462d-89e9-4da9e4755ec5`.
- Cloudflare deployment completed through the existing local OAuth login. The user-supplied `1048gate.com` domain and `www.1048gate.com` were attached and are managed as Worker custom domains in Wrangler. Supabase and GitHub settings remain unchanged.

| Check | Result |
| --- | --- |
| Before edits: original `npm test` | Passed site checks, nine-season playoff checks, newspaper tests, and build. |
| Before edits: Python discovery | All 10 tests passed across five files. |
| Before/after: Supabase anonymous API release regression | Passed using the configured public publishable key; no backend writes. |
| Final `npm test` | Passed complete source checks, newspaper/playoff suites, all 10 Python tests, and build. |
| Final `npm run cloudflare:check` | Passed: 80 public files; 39 hashed assets including lazy staff files; HTML reference completeness; archive byte equality; MIME types; caching/ETags; HEAD; redirects with query strings; missing/private-file 404s; Wrangler dry run. |
| Dependency audit | Wrangler 4.131.0 installation audited all 39 packages with zero vulnerabilities; production-only audit also passed. |
| Browser on Cloudflare local runtime | All 18 hash aliases rendered expected views; desktop and 390px mobile layouts; mobile More menu; live members, transactions and accepted trades; career modal; nine historical newspaper stories and one weekly demonstration story; sources drawer; login/recovery controls. |
| Live browser | Direct `#trades`, Trade Board guest controls, and `/index.html?verification=1#weekly` worked on workers.dev. On `1048gate.com`, live Supabase trade history rendered without console/JavaScript errors. |
| Purchased-domain DNS and TLS | Cloudflare public DNS-over-HTTPS resolves both hostnames; both return HTTP 200 over HTTPS with trusted certificates. This environment retained stale negative system-DNS responses, so the custom-domain browser check used the current public DNS IP while retaining normal certificate validation. |
| Final live artifact comparison | All 80 public files, including the corrected footer image, matched the final local build byte for byte. |
| Live playoff probes | Passed on both Cloudflare and GitHub Pages, including 2025 bracket counts and seeds. |
| Credential scan | No detected embedded secrets in 229 text source/build files. See the scope and limits below. |

The first npm installation's native subprocess check was blocked by the execution sandbox; rerunning with the required permissions fixed it. Browser CDN/font requests were initially intermittent and loaded on retry. A preview running during replacement of `dist/` acquired stale asset state; restarting after builds fixed it. These environment issues required no frontend or Supabase changes. Browser request logs did identify the original missing footer mark; that build omission was fixed and regression coverage added.

Modified original files: `.gitignore`, `README.md`, `package.json`, `scripts/build-site.mjs`, and `index.html` (canonical and social-sharing URLs only). Added: `wrangler.jsonc`, `package-lock.json`, `_headers`, `scripts/test-cloudflare.mjs`, `.github/workflows/cloudflare.yml`, and this runbook. All other 155 original files are byte-identical to the supplied ZIP, including application code, historical data, SQL, and existing workflows.

## Source inspection

The starting source is `1048gate.zip`, extracted as `1048Gate.github.io-main`. The GitHub ZIP identifies source commit `01bcabdde6647f652204a3d76de80a112a9ad375`. It has no `.git` history, local database, `.env` file, lockfile, dependencies, or prebuilt `dist/`. The original ZIP is retained. The inspection covered all source directories, data file schemas, assets, workflow definitions, SQL migrations, tests, and release documentation.

| Area | Existing behavior and migration decision |
| --- | --- |
| Frontend | One `index.html`, ordered classic/deferred scripts in `js/`, CSS in `css/`. No framework, bundler, SSR, or API server. Preserve application logic and layout; update only canonical/social metadata for the purchased domain. |
| Build | `scripts/build-site.mjs` recreates `dist/`, hashes linked CSS/JS, rewrites the staff loader's lazy asset references, copies all `data/`, public images, `.nojekyll`, and a manifest. Now also copies `_headers` and the footer mark omitted by the original build. |
| Assets | Relative URLs at the domain root. The 12 old team logos remain in source; the existing production build excludes them and uses initials. The footer does reference `two-hounds-mark.png`; browser verification found the original build's 404, now fixed by copying that file. All previously deployed asset paths remain intact. |
| Navigation | `js/app.js` maps 18 hash aliases onto seven top-level views; its existing check reports 17 public views. Preserve `#home`, `#league`, `#members`, `#memberskeepers`, `#homekeepers`, `#wire`, `#transactions`, `#trades`, `#history`, `#playoffs`, `#book`, `#intel`, `#office`, `#rules`, `#votes`, `#newspaper`, `#weekly`, and `#staff`. |
| Newspaper | `#newspaper` loads nine historical stories from `historical_2023.json`; `#weekly` loads the labeled archive demonstration. JSON and CSV artifacts stay unchanged. These are hash views, not separate HTML pages. |
| Supabase | One shared client in `js/auth.js`, imported from jsDelivr's `@supabase/supabase-js@2/+esm`, using `js/supabase-config.js`. Browser calls go directly to the same Supabase domain. No Cloudflare database bindings or secrets. |
| Data access | Members, champions, records, shame, and playoffs use live tables with static fallbacks. Transaction and accepted-trade archives use `get_transaction_archive` and `get_transaction_archive_seasons`. Polls use aggregate RPCs; votes use the existing write RPC. |
| Trade Board | Separate `trade_board_posts` / `trade_board_comments` tables, authenticated posting, author/staff moderation, existing RLS and Realtime. Nothing is moved or reimported. |
| Authentication | Password login, profile roles, recovery, and local browser sessions. Recovery redirects already use `location.origin + location.pathname`; new origins need Supabase redirect allow-list entries. |
| External resources | Google Fonts, jsDelivr, and Supabase HTTPS/WebSocket traffic remain direct. No CSP, cross-origin isolation, proxy, or caching rule is introduced that would block them. |
| Data generation | Python standard-library scripts read a separately maintained SQLite archive or authenticated ESPN APIs. Existing scheduled GitHub jobs remain responsible for scoreboard, futures, and transaction updates. |
| GitHub assumptions | `.nojekyll`, the Pages workflow, and default live-probe URL retain GitHub Pages support. The three social metadata URLs now use `1048gate.com`, with a canonical link added. No repository-name URL prefix, CNAME, service worker, `_redirects`, or HTML 404 fallback exists. |
| Backend history | Seventeen versioned SQL migrations plus original setup SQL and a legacy board export are retained. Neither SQL nor the private legacy export is copied to the hosting artifact. Do not rerun the old setup/seed SQL against production for this hosting migration. |

Workers Static Assets matches this build directly and supports deployment, managed asset caching, and custom domains. Cloudflare Pages provides no architectural advantage here. See [Cloudflare Static Assets](https://developers.cloudflare.com/workers/static-assets/).

## Routing and caching

`wrangler.jsonc` serves only `dist/`, with `html_handling: "auto-trailing-slash"` and `not_found_handling: "none"`. `/` serves the site. `/index.html` redirects to `/`, preserving query parameters; browsers retain the fragment. Hash navigation stays entirely in the browser. `/trades` is not an existing application URL; use `/#trades`.

There is deliberately no blanket SPA fallback: missing JSON, scripts, and unknown paths return actual 404s. This preserves the application's existing JSON error/fallback handling. Cloudflare automatically determines content types. See [HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/).

`_headers` makes only the build's hashed `/css/*` and `/js/*` immutable for one year. HTML, data, images, and the manifest retain Cloudflare's default `public, max-age=0, must-revalidate` behavior and ETags. Do not add a dashboard Cache Everything rule or a long browser TTL for HTML/JSON. If future build changes add unhashed files to `/js/` or `/css/`, revise these rules. See [Cloudflare headers](https://developers.cloudflare.com/workers/static-assets/headers/).

## Local commands and deployment

Run from the repository root with Node.js 22+ and Python 3:

```bash
npm ci
npm test
npm run cloudflare:check
npm run cloudflare:dev
```

`npm test` runs the original site/newspaper/playoff checks, all ten Python tests, and the full build. `cloudflare:check` rebuilds, starts a temporary local Wrangler server, tests every public file, HTML-linked asset completeness, and caching/routing behavior, stops that server, then runs a deployment dry run. `cloudflare:dev` serves the built site at `http://localhost:8787`; restart after edits to rebuild. `npm run dev` is an alias. Stop the preview before running other build/deploy commands: the build replaces `dist/`, which can invalidate a running Wrangler asset manifest; restart the preview afterward.

For a first CLI deployment, authenticate if needed, then deploy:

```bash
npx wrangler login
npx wrangler whoami
npm run cloudflare:deploy
```

The exact deploy command is **`npm run cloudflare:deploy`**. It rebuilds before deploying Worker `1048-gate`. No separate Worker creation, assets upload, Pages project, or database setup is necessary. The `routes` entries also maintain the two purchased-domain hostnames. Wrangler prints the new `https://1048-gate.twohoundsrun.workers.dev` URL. `workers_dev` remains enabled, and version preview URLs are disabled to keep the initial rollout to one explicit test origin.

In Cloudflare **Workers & Pages → 1048-gate**, confirm the deployment is active and inspect **Settings → Domains & Routes** for the workers.dev address. No Cloudflare runtime variables or database bindings are required. Do not configure an origin pointing at GitHub Pages.

## Variables and credentials

| Variable/configuration | Location | Required? |
| --- | --- | --- |
| Existing Supabase URL and publishable key | `js/supabase-config.js` | Already supplied; public browser configuration, unchanged. |
| `CLOUDFLARE_API_TOKEN` | GitHub Actions secret, or local deployment shell for unattended CLI | Only for token-based deployment. OAuth via `wrangler login` is sufficient locally. |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions secret, or deployment shell when selecting an account | Use account `9f99f068882ff62fff142655f4c9f0cc`, as shown by `wrangler whoami`. |
| `CLOUDFLARE_DEPLOY_ENABLED` = `true` | GitHub repository Actions **variable** | Opts into automated deployment; unset means checks only. |
| `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY` | Shell for `npm run test:release` | Only for the existing anonymous API tests. Use the same public project URL and publishable key. |
| `SITE_URL` | Shell for `npm run probe:live` | Optional; alternatively pass the target URL after `--`. Default remains GitHub Pages. |
| `ESPN_LEAGUE_ID`, `ESPN_S2`, `ESPN_SWID` | Existing GitHub data workflow secrets | Keep intact. Not needed by Cloudflare hosting. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Existing GitHub transaction importer secrets | Keep intact. **Never add the service-role key to frontend code, `dist/`, Wrangler vars, or hosting build substitution.** |

`.gitignore` now excludes dependencies, Wrangler state, local secret files, and raw import artifacts. The ZIP/source/build credential scan found a public `sb_publishable_…` key, with no detected service-role JWT, Supabase secret key, private key, or GitHub token. This is a source snapshot audit, not a claim about unavailable Git history or account-wide secrets. The anonymous API regression confirmed denial of raw transaction, voter, and retired board reads while the intended public RPCs succeeded.

## Supabase dashboard changes before member testing

In the **existing** Supabase project, go to **Authentication → URL Configuration**:

1. Keep the current GitHub Pages Site URL and redirects during parallel verification.
2. Add exact redirect URLs `https://1048-gate.twohoundsrun.workers.dev/` and `https://1048-gate.twohoundsrun.workers.dev/index.html`. The second supports recovery initiated through an explicit index URL.
3. For local recovery tests, optionally add `http://localhost:8787/` and `http://127.0.0.1:8787/`.
4. Add `https://1048gate.com/`, `https://1048gate.com/index.html`, `https://www.1048gate.com/`, and `https://www.1048gate.com/index.html`. Set **Site URL** to `https://1048gate.com/` when ready to use the purchased domain for account emails. Keep the old GitHub redirects for rollback and already-issued links.
5. If custom email templates hardcode GitHub URLs, update them at cutover; templates using confirmation URLs should preserve the requested redirect. Review [Supabase redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).

No tables, data, RLS, Realtime publications, API keys, or Supabase project URL need changing. Sessions and informal voter IDs live in browser storage scoped to an origin: members must sign in again on the new domain, and the existing informal device-based vote identity does not automatically transfer. Historical server data is unaffected. Verify a real member login, recovery email, authorized Trade Board post/comment/edit/delete, and staff controls with an account you own before cutover.

## Optional GitHub automation

The new `.github/workflows/cloudflare.yml` runs verification for pull requests/main pushes, supports manual dispatch, and follows successful completion of the three existing data workflows. The `workflow_run` path checks out the latest `main` so the data job's newly committed JSON is deployed. This addresses GitHub's rule that pushes made with `GITHUB_TOKEN` do not trigger another push workflow; see [GitHub workflow triggers](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

After manual Cloudflare verification:

1. Use the existing `1048Gate/1048Gate.github.io` repository. The migration was transferred from the ZIP into a clone preserving the original Git history; do not initialize a replacement repository.
2. Create a token using Cloudflare’s **Edit Cloudflare Workers** template, restricting account resources to this account and zone resources to `1048gate.com`. Keep its Worker script and route permissions so Wrangler can maintain the custom domains; a token limited to scripts alone is insufficient for the configured domain deployment.
3. In GitHub **Settings → Secrets and variables → Actions**, add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as secrets, and set repository variable `CLOUDFLARE_DEPLOY_ENABLED` to `true`.
4. Dispatch **Verify and deploy Cloudflare** and confirm it succeeds. Existing Pages and data workflows remain enabled and unchanged.

Do not also enable Cloudflare Git builds if using this workflow, to avoid duplicate deployments. If you prefer Cloudflare's native Git integration instead, leave `CLOUDFLARE_DEPLOY_ENABLED` unset, connect the repository under **1048-gate → Settings → Builds**, select production branch `main`, root directory `/`, build command `npm test`, and deploy command `npm run cloudflare:deploy`; verify a scheduled data commit triggers the expected build. The Cloudflare project name must match `1048-gate`. See [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/).

## Purchased domain and rollback

`1048gate.com` was already an active zone in the existing Cloudflare account, using `ajay.ns.cloudflare.com` and `heather.ns.cloudflare.com`. Before attachment, neither the apex nor `www` had a website address, and neither hostname was attached to a Worker. No registrar transfer or nameserver change is needed.

Both hostnames are declared in `wrangler.jsonc` as `custom_domain: true`, with `workers_dev: true` retained. Deploying provisions the Worker domain records and managed HTTPS certificates. See [Cloudflare Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/). In the dashboard, inspect **Workers & Pages → 1048-gate → Settings → Domains & Routes**. Future CLI/CI deployments keep these domain attachments in source control.

**Required dashboard follow-up:** in the `1048gate.com` zone, open **SSL/TLS → Edge Certificates → Always Use HTTPS** and turn it **On**. Both HTTPS endpoints have valid certificates, but the current HTTP endpoints return 200 instead of redirecting. The available OAuth token cannot read/change zone settings (the API returned 403), so this setting was not changed. Verify `http://1048gate.com/?test=1#weekly` upgrades to HTTPS before sharing the new domain widely.

Cloudflare’s existing zone configuration injects its Web Analytics beacon into custom-domain HTML. Apart from that platform-added script, the HTML matches the build; the workers.dev artifact remains byte-identical. No analytics code or token was added to the repository.

The canonical and three social-sharing metadata URLs now point to `https://1048gate.com/`. The `www` hostname also serves the site. The local OAuth login does not have access to the DNS/redirect-rule APIs, so no `www` redirect rule was created. Optionally configure one in the dashboard:

1. Select the `1048gate.com` zone → **Rules → Redirect Rules → Create rule** (Single Redirect).
2. Match expression `(http.host eq "www.1048gate.com")`.
3. Set dynamic target `concat("https://1048gate.com", http.request.uri.path)`, status **301**, and enable **Preserve query string**.
4. Deploy and test `https://www.1048gate.com/?test=1#weekly`; it should become `https://1048gate.com/?test=1#weekly`. The browser preserves the fragment when the redirect supplies none. The existing Worker custom domain supplies proxied routing for `www`; do not add a conflicting CNAME. See [Cloudflare’s www-to-root example](https://developers.cloudflare.com/rules/url-forwarding/examples/redirect-www-to-root/).

Complete the Supabase redirect configuration above before account-recovery testing. Members will need to sign in on the new origin. Use an account you own to verify login, recovery, Trade Board post/comment/edit/delete, and staff controls before announcing the cutover.

Keep `1048gate.github.io` and its workflow online through a stable observation period. GitHub's `github.io` hostname cannot be moved to Cloudflare; existing bookmarks continue working through the retained Pages deployment. If eventually redirecting the old site, use a tested client redirect preserving `location.search` and `location.hash`.

Only after acceptance consider disabling the Pages workflow and changing the data-health probe to `https://1048gate.com`. Keep all scoreboard, futures, and Supabase import workflows. For a Cloudflare rollback, choose a prior deployment in the dashboard or run `npx wrangler rollback`. The original GitHub Pages address remains the independent hosting fallback. No database restoration is needed.

## Verification limits

The existing `supabase/tests/security_performance_assertions.sql` explicitly requires an isolated staging project and **commits fixture inserts**. It is not run against production during a hosting migration. The ZIP does not include a staging database or the original SQLite archive. All runnable local tests and read-only public API tests are exercised; authenticated writes and real recovery emails require the owner's test account and redirect configuration. No live posts, votes, imports, or database migrations are created merely to test hosting.
