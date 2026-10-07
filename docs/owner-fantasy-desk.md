# Owner Desk and ESPN projections

The public projections page is `/projections/`. The private data viewer is
`/owner/`, with the existing Supabase sign-in, team/player filters, historical
snapshot picker, and JSON download. An Owner Desk link appears beside the
signed-in owner's account on the main site.

## Access and storage

`fantasy_owner_access` holds exactly one account UUID. This is independent of
`profiles.role`; commissioner or site administrator status does not authorize
access. The table has no browser write grants. `fantasy_snapshots` stores
normalized JSON and permits SELECT only when `auth.uid()` matches that owner
record. No public role has read grants. Service-role credentials are used only
by the collector's GitHub Actions step. Browser access revocation takes effect
on the next query, rather than waiting for old JWT role claims to expire.

The database migration was applied to the linked Supabase project. The existing
Collin account was provisioned separately; its identity is deliberately absent
from the public migration. For a separate environment, provision its verified
owner using the Supabase dashboard or a trusted server account:

```sql
insert into public.fantasy_owner_access (user_id)
values ('VERIFIED_AUTH_USER_UUID');
```

Never infer authorization from a browser-editable display name, email input,
or user metadata. To change ownership, use trusted database administration.

## Collection

The existing current-season data-health workflow also runs
`scripts/collect_fantasy_data.py`. It reuses `ESPN_LEAGUE_ID`, `ESPN_S2`,
`ESPN_SWID`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` repository secrets.
The last two are already referenced by the transaction-import workflow; their
actual presence must be verified in GitHub settings if private saves are skipped.
The collector reports a skip when the Supabase service credentials are absent.

Each successful run checks for changes and saves a new snapshot only when the
normalized data changes. Each snapshot contains all league rosters and lineup slots, league scoring
stat IDs/weights and slot counts, ESPN injury status, weekly projections, and
up to 1,000 available/waiver players selected by ownership percentage. The pool
is labeled as bounded, not a complete player universe. Snapshots are retained
until explicitly removed by trusted administration.

Player-level projections, rosters, lineup slots, ownership, availability, and
scoring settings are stored only in the private Supabase snapshot and viewed
through Owner Desk. The collector does not write a public player projection feed.
The public `/projections/` page displays team totals only.

The public `data/current-season.json` board includes each team's starter-based
projection total, a completeness flag, and a projection timestamp. It contains
no player names, IDs, individual points, or lineup slots. Totals require a filled
starting lineup with projections for every starter; incomplete totals remain
unavailable. Zero remains zero. The collector updates this board only when
season and week match its snapshot. Pregame cards show projected totals;
live/final cards show actual scores. Team-name buttons open the manager profile's
team total above its history.

No raw ESPN response, account email, credential, or private snapshot is written
to disk or uploaded as an Actions artifact. Private save failure retains the
previous public board. No weekly projection is substituted with an actual score
or season total.

The collector is a nonblocking step: an ESPN projection failure cannot prevent
the existing score/newspaper pipeline from proceeding. Read its step logs to
confirm both outputs after an authenticated production run. A final step marks
the workflow failed if collection failed, after score updates finish. Missing totals are never fabricated.

## Verification

- `python3 -m unittest discover -s scripts -p 'test_*.py'`
- `npm run check && npm run build`
- Run `supabase/tests/owner_fantasy_desk.sql` as a trusted database administrator.
  It verifies owner read, commissioner denial, public denial, and browser write
  denial. Its test fixture and session changes are rolled back.
- `node scripts/test-owner-desk.mjs` exercises session changes and ignores late
  responses after sign-out using a minimal DOM and mocked Supabase client.

The HTML login shell is public; private payloads are obtained only from
RLS-protected database queries. `/owner/` is noindex and no-store. Private JSON
is held in page memory and cleared on account change/sign-out; it is not cached
in localStorage. A JSON explicitly downloaded by the owner remains on their
device.
