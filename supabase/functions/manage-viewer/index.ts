// Owner-only viewer management for Audit Hub. Public sign-ups are disabled, so this is the only way a new
// person gets an account. Callers send their own session token (supabase.functions.invoke does).
//
// { action: 'invite', projectId, email, sendLink?, redirectTo? }
//   Adds the email as a viewer of the project, creates their confirmed account if needed and, when sendLink
//   is true, emails the usual sign-in link + code (Magic Link template, so the scanner-safe Continue step applies).
// { action: 'revoke', email }
//   Deletes the person's account once they view no projects.
import { createClient } from 'npm:@supabase/supabase-js@2.119.2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type AuthUser = { id: string; confirmed: boolean; is_owner: boolean }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' })

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const noSession = { auth: { persistSession: false, autoRefreshToken: false } }
  const admin = createClient(url, serviceKey, noSession)

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const caller = token ? (await admin.auth.getUser(token)).data.user : null
  if (!caller) return json(401, { error: 'Sign in first.' })
  const { data: ownerRow } = await admin
    .from('app_owners')
    .select('user_id')
    .eq('user_id', caller.id)
    .maybeSingle()
  if (!ownerRow) return json(403, { error: 'Only the owner can manage viewers.' })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'Send a JSON body.' })
  }
  const email = String(body.email ?? '')
    .trim()
    .toLowerCase()
  if (!EMAIL_RE.test(email)) return json(400, { error: 'Enter a valid email address.' })

  const lookup = async (): Promise<AuthUser | null> => {
    const { data, error } = await admin.rpc('auth_user_by_email', { target_email: email })
    if (error) throw error
    return (data as AuthUser[])[0] ?? null
  }

  try {
    if (body.action === 'invite') {
      const projectId = String(body.projectId ?? '')
      const { data: project } = UUID_RE.test(projectId)
        ? await admin.from('projects').select('id').eq('id', projectId).maybeSingle()
        : { data: null }
      if (!project) return json(404, { error: 'Unknown project.' })

      const { data: viewer, error: viewerError } = await admin
        .from('project_viewers')
        .upsert({ project_id: projectId, email, invited_by: caller.id }, { onConflict: 'project_id,email' })
        .select()
        .single()
      if (viewerError) throw viewerError

      // Pre-confirmed is safe: only an owner can create accounts, and signing in still needs the
      // one-time link or code sent to the address.
      const user = await lookup()
      if (!user) {
        const { error } = await admin.auth.admin.createUser({ email, email_confirm: true })
        if (error) throw error
      } else if (!user.confirmed) {
        const { error } = await admin.auth.admin.updateUserById(user.id, { email_confirm: true })
        if (error) throw error
      }

      let emailed = false
      if (body.sendLink) {
        const redirectTo = typeof body.redirectTo === 'string' ? body.redirectTo : undefined
        const { error } = await createClient(url, anonKey, noSession).auth.signInWithOtp({
          email,
          options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
        })
        emailed = !error
        if (error) console.error('sign-in email failed', error.message)
      }
      return json(200, { viewer, created: !user, emailed })
    }

    if (body.action === 'revoke') {
      const user = await lookup()
      if (!user) return json(200, { deleted: false })
      if (user.is_owner) return json(400, { error: "An owner's sign-in can't be deleted here." })
      const { count, error: countError } = await admin
        .from('project_viewers')
        .select('project_id', { count: 'exact', head: true })
        .eq('email', email)
      if (countError) throw countError
      if (count)
        return json(409, { error: `${email} can still view ${count} project(s). Remove them first.` })
      const { error } = await admin.auth.admin.deleteUser(user.id)
      if (error) throw error
      return json(200, { deleted: true })
    }

    return json(400, { error: 'Unknown action.' })
  } catch (e) {
    console.error(e)
    return json(500, { error: 'Something went wrong. Try again.' })
  }
})
