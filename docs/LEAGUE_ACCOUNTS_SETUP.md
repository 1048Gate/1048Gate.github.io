# 1048 Gate Invite-Only League Accounts

This feature converts Vote Booth identity from a browser-local UUID to one authenticated 1048 Gate member account.

## What members see

- **Login** accepts a league username or an existing staff email.
- **Create League Account** asks for a one-time invite code, username, and password.
- League members do **not** provide an email address or phone number.
- Each invite belongs to exactly one of the 12 league members and can only be claimed once.
- Votes are limited to one authenticated member per poll.

## What staff see

The Staff page gains **League Accounts & Invites**:

- 12-member account status
- Generate/Regenerate Code for unclaimed members
- Claimed username status
- **Who Voted?** on each poll
- During an open poll, staff can see who has/has not voted but not the selected choice.
- After a poll closes, the selected choice is available in the voter-status view.

## Security model

- Invite plaintext is never committed to GitHub.
- Postgres stores only a `pgcrypto` hash of the invite.
- The Supabase `service_role` key is used only inside the Edge Function.
- Browser code uses only the existing public/anon credential.
- RLS restricts `poll_votes` so authenticated users can insert only their own linked member identity.
- Database policy also rejects votes for closed polls or mismatched poll options.
- Protected profile fields prevent a regular member from changing their own member number/role to impersonate someone else.
- Public poll results come from a count-only RPC and do not expose voter identity.

## Install order

The frontend is backward compatible: until the new database RPC exists, Vote Booth continues using the old browser-vote flow. That lets the website changes be merged before the backend switch.

### 1. Apply the database migrations

In Supabase **SQL Editor**, run these files in order:

1. `supabase/migrations/20260809170000_invite_only_league_accounts.sql`
2. `supabase/migrations/20260809170100_vote_id_compat.sql`
3. `supabase/migrations/20260809170200_account_vote_hardening.sql`

Or, after linking the Supabase CLI project, run:

```bash
supabase db push
```

### 2. Deploy the registration Edge Function

The function source is:

```text
supabase/functions/register-league-member/index.ts
```

The repository includes:

```toml
[functions.register-league-member]
verify_jwt = false
```

That is required because a brand-new member is not authenticated yet when redeeming an invite. The function still requires a valid one-time league invite before it creates an Auth user.

Deploy with the Supabase CLI:

```bash
supabase functions deploy register-league-member
```

It can also be created/deployed from the Supabase Dashboard Edge Functions editor using the same `index.ts` source.

### 3. Link the existing Site Admin account

After the migration/function are live:

1. Sign in with the existing Site Admin email/password.
2. Open **Staff → League Accounts & Invites**.
3. Generate the code for member `10 — Collin Krum`.
4. Open **Vote Booth** and choose **Link league identity**.
5. Enter that invite plus the username you want to use going forward.

This keeps the existing Auth user and its Site Admin access; it only adds the league-member identity and username.

### 4. Set up George

For `01 — George Travis`, generate his invite code.

- If George already has a Commissioner staff login, he can sign in and **link** that account with his invite.
- If he does not, he can use **Create League Account** and choose a username/password. His invite automatically assigns the `commissioner` role.

### 5. Invite everyone else

Generate each member's code from the Staff page and send it privately. Do not paste codes into the public GitHub repository.

Each member then:

1. Opens **Login**.
2. Chooses **Create League Account**.
3. Enters their invite code.
4. Chooses a username/password.
5. Is automatically signed in after successful registration.

## Internal login implementation

Supabase password login is still email/password internally. League usernames are mapped to a synthetic, non-user-facing address:

```text
username@members.1048gate.invalid
```

The Edge Function creates that Auth record server-side and auto-confirms it. Members only ever enter their username and password on the website.

Because members do not provide a real recovery email/phone, forgotten-password recovery is staff-mediated rather than self-service. A future account-management pass can add a staff reset-password tool without changing this identity model.

## Voting behavior after migration

- Logged-out visitors can see poll results but cannot vote.
- Authenticated users without a linked `member_number` cannot vote.
- Each linked member can cast one vote per poll.
- The database enforces the one-member/one-poll rule independently of the browser UI.
- Closed polls reject new votes at the database level.
- Existing browser-based vote rows remain in the database for history, but future authenticated votes use `auth_user_id` + `member_number`.

## Files in this feature

```text
css/league-accounts.css
js/league-accounts.js
js/account-admin.js
js/auth.js
js/community.js
js/supabase-config.js
supabase/config.toml
supabase/functions/register-league-member/index.ts
supabase/migrations/20260809170000_invite_only_league_accounts.sql
supabase/migrations/20260809170100_vote_id_compat.sql
supabase/migrations/20260809170200_account_vote_hardening.sql
```
