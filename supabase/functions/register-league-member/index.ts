import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@^2/cors'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
})

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }
const memberDomain = 'members.1048gate.invalid'

function normalizeUsername(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function usernameEmail(username: string) {
  return `${username}@${memberDomain}`
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return response({ error: 'Method not allowed' }, 405)
  }

  try {
    const body = await req.json()
    const action = String(body?.action || 'register')
    const inviteCode = String(body?.inviteCode || '').trim().toUpperCase()
    const username = normalizeUsername(body?.username)

    if (!inviteCode) return response({ error: 'Invite code is required.' }, 400)
    if (!/^[a-z0-9][a-z0-9._-]{2,23}$/.test(username)) {
      return response({ error: 'Username must be 3-24 characters using letters, numbers, dot, dash, or underscore.' }, 400)
    }

    const { data: inviteRows, error: inviteError } = await admin.rpc('validate_league_invite', {
      p_code: inviteCode,
    })

    if (inviteError) throw inviteError
    const invite = Array.isArray(inviteRows) ? inviteRows[0] : null
    if (!invite) return response({ error: 'Invite code is invalid or already used.' }, 400)

    if (action === 'link') {
      const authHeader = req.headers.get('Authorization') || ''
      const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
      if (!jwt) return response({ error: 'You must be signed in to link an existing account.' }, 401)

      const { data: userData, error: userError } = await admin.auth.getUser(jwt)
      if (userError || !userData.user) return response({ error: 'Your login session is no longer valid.' }, 401)

      const { data: linkedRows, error: linkError } = await admin.rpc('consume_league_invite', {
        p_code: inviteCode,
        p_user_id: userData.user.id,
        p_username: username,
      })
      if (linkError) return response({ error: linkError.message }, 400)

      return response({
        ok: true,
        action: 'linked',
        profile: Array.isArray(linkedRows) ? linkedRows[0] : linkedRows,
      })
    }

    if (action !== 'register') {
      return response({ error: 'Unknown registration action.' }, 400)
    }

    const password = String(body?.password || '')
    if (password.length < 8) {
      return response({ error: 'Password must be at least 8 characters.' }, 400)
    }

    const email = usernameEmail(username)
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: invite.display_name,
        member_number: invite.member_number,
      },
      app_metadata: {
        league_member: true,
      },
    })

    if (createError || !created.user) {
      const message = createError?.message?.toLowerCase().includes('already')
        ? 'That username is already taken.'
        : createError?.message || 'Unable to create account.'
      return response({ error: message }, 400)
    }

    const { data: profileRows, error: consumeError } = await admin.rpc('consume_league_invite', {
      p_code: inviteCode,
      p_user_id: created.user.id,
      p_username: username,
    })

    if (consumeError) {
      await admin.auth.admin.deleteUser(created.user.id)
      return response({ error: consumeError.message }, 400)
    }

    return response({
      ok: true,
      action: 'registered',
      username,
      profile: Array.isArray(profileRows) ? profileRows[0] : profileRows,
    }, 201)
  } catch (error) {
    console.error('register-league-member failed', error)
    return response({ error: error instanceof Error ? error.message : 'Registration failed.' }, 500)
  }
})
