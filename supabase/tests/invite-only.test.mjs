// Verifies invite-only sign-in and the manage-viewer Edge Function against a local Supabase stack
// (`supabase start` with the edge runtime enabled, after `supabase db reset`).
// Usage: SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
//        node supabase/tests/invite-only.test.mjs
// The service-role key is used here only to set up test users; it never ships to the client.
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const mailpit = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324'
const anonKey = process.env.SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const dbContainer = process.env.SUPABASE_DB_CONTAINER ?? 'supabase_db_truenorth-audit-hub'
if (!anonKey || !serviceKey) throw new Error('Set SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY')

const run = Date.now()
const emails = {
  owner: `owner-${run}@example.com`,
  viewer: `viewer-${run}@example.com`,
  stranger: `stranger-${run}@example.com`,
  random: `random-${run}@example.com`,
  invited: `Invited-${run}@Example.com`,
  unconfirmed: `unconfirmed-${run}@example.com`,
}
const password = 'test-password-123!'
const redirectTo = 'http://127.0.0.1:4173/audit-hub'
let failures = 0
const check = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`)
  if (!ok) failures++
}
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const psql = (sql) =>
  execFileSync('docker', ['exec', dbContainer, 'psql', '-U', 'postgres', '-tAc', sql], { encoding: 'utf8' }).trim()
const authUserCount = (email) => Number(psql(`select count(*) from auth.users where lower(email) = lower('${email}')`))
async function mailTo(email) {
  const res = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)
  return (await res.json()).messages ?? []
}
async function mailBody(id) {
  return (await (await fetch(`${mailpit}/api/v1/message/${id}`)).json()).HTML
}

const admin = createClient(url, serviceKey, opts)
for (const email of [emails.owner, emails.viewer, emails.stranger]) {
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
}
{
  const { error } = await admin.auth.admin.createUser({ email: emails.unconfirmed, password, email_confirm: false })
  if (error) throw error
}
psql(`select public.make_owner('${emails.owner}')`)

async function signIn(email) {
  const client = createClient(url, anonKey, opts)
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return client
}
const owner = await signIn(emails.owner)
const viewer = await signIn(emails.viewer)
const stranger = await signIn(emails.stranger)
const anon = createClient(url, anonKey, opts)

const { data: projA } = await owner.from('projects').insert({ name: 'Invite project A' }).select().single()
const { data: projB } = await owner.from('projects').insert({ name: 'Invite project B' }).select().single()
await owner.from('project_viewers').insert({ project_id: projA.id, email: emails.viewer })

// ─── Random visitors get nothing ───
{
  const { error } = await anon.auth.signInWithOtp({
    email: emails.random,
    options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
  })
  check(error?.code === 'otp_disabled', `sign-in link for an unknown email is refused (${error?.code})`)
  const { error: e2 } = await anon.auth.signInWithOtp({ email: emails.random, options: { emailRedirectTo: redirectTo } })
  check(!!e2, `even with shouldCreateUser left on, signups are disabled (${e2?.code})`)
  const { error: e3 } = await anon.auth.signUp({ email: emails.random, password })
  check(!!e3, `password sign-up is disabled (${e3?.code})`)
  await sleep(1500)
  check(authUserCount(emails.random) === 0, 'no auth user was created for the unknown email')
  check((await mailTo(emails.random)).length === 0, 'no email was sent to the unknown address')
  check(
    !!(await anon.rpc('auth_user_by_email', { target_email: emails.owner })).error &&
      !!(await stranger.rpc('auth_user_by_email', { target_email: emails.owner })).error,
    'browsers cannot look up accounts by email',
  )
}

// ─── Existing users still get a link ───
{
  const { error } = await anon.auth.signInWithOtp({
    email: emails.viewer,
    options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
  })
  await sleep(1000)
  check(!error && (await mailTo(emails.viewer)).length === 1, 'an existing viewer still gets a sign-in email')
}

// ─── Only the owner can call manage-viewer ───
const invoke = (client, body) => client.functions.invoke('manage-viewer', { body })
const statusOf = async ({ error }) => error?.context?.status ?? 200
const invite = (email, projectId) => ({ action: 'invite', projectId, email, sendLink: true, redirectTo })
check((await statusOf(await invoke(anon, invite(emails.random, projA.id)))) === 401, 'anonymous caller gets 401')
check((await statusOf(await invoke(viewer, invite(emails.random, projA.id)))) === 403, 'viewer gets 403')
check((await statusOf(await invoke(stranger, invite(emails.random, projA.id)))) === 403, 'signed-in non-owner gets 403')
{
  const res = await fetch(`${url}/functions/v1/manage-viewer`, {
    method: 'POST',
    headers: { Authorization: 'Bearer not-a-real-token', 'Content-Type': 'application/json' },
    body: JSON.stringify(invite(emails.random, projA.id)),
  })
  check(res.status === 401, 'forged token gets 401')
}
check((await statusOf(await invoke(stranger, { action: 'revoke', email: emails.viewer }))) === 403, 'non-owner cannot revoke')
await sleep(500)
check(authUserCount(emails.random) === 0, 'rejected calls created no account')
check((await mailTo(emails.random)).length === 0, 'rejected calls sent no email')

// ─── Owner invites a new person ───
const invitedEmail = emails.invited.toLowerCase()
{
  const { data, error } = await invoke(owner, invite(emails.invited, projA.id))
  check(!error && data.created === true && data.emailed === true, 'owner invite creates the account and emails a link')
  check(data?.viewer?.project_id === projA.id && data?.viewer?.email === invitedEmail, 'invite returns the viewer row')
  check(psql(`select email_confirmed_at is not null from auth.users where email = '${invitedEmail}'`) === 't', 'invited account is confirmed')
  await sleep(1000)
  const mail = await mailTo(invitedEmail)
  check(mail.length === 1, 'exactly one invite email was sent')
  const html = mail[0] ? await mailBody(mail[0].ID) : ''
  const link = html.match(/href="([^"]*token_hash=[^"]*)"/)?.[1]?.replaceAll('&amp;', '&') ?? ''
  const code = html.match(/>(\d{6})</)?.[1]
  check(link.startsWith(`${redirectTo}?token_hash=`) && link.includes('type=email'), 'invite link is the scanner-safe token_hash link')
  check(!!code, 'invite email includes the 6-digit code')

  // A scanner fetching the link does not sign anyone in: the page only verifies after Continue.
  await fetch(link).catch(() => undefined)
  const fresh = createClient(url, anonKey, opts)
  const tokenHash = new URL(link).searchParams.get('token_hash')
  const { data: verified, error: vErr } = await fresh.auth.verifyOtp({ token_hash: tokenHash, type: 'email' })
  check(!vErr && verified.session, 'the invite link signs the person in after Continue (verifyOtp token_hash)')
  const { data: visible } = await fresh.from('projects').select('id')
  check(visible?.length === 1 && visible[0].id === projA.id, 'the invited person sees only the project they were added to')

  const again = await invoke(owner, { ...invite(emails.invited, projA.id), sendLink: false })
  check(!again.error && again.data.created === false, 're-inviting an existing viewer is harmless')
  const second = await invoke(owner, { ...invite(emails.invited, projB.id), sendLink: false })
  check(!second.error && second.data.created === false, 'owner can add an existing account to another project')

  // ─── Removing access ───
  await owner.from('project_viewers').delete().eq('project_id', projA.id).eq('email', invitedEmail)
  const blocked = await invoke(owner, { action: 'revoke', email: invitedEmail })
  check((await statusOf(blocked)) === 409, 'revoke is refused while they still view another project')
  await owner.from('project_viewers').delete().eq('project_id', projB.id).eq('email', invitedEmail)
  const { data: none } = await fresh.from('projects').select('id')
  const { data: noPages } = await fresh.from('pages').select('id')
  check(none?.length === 0 && noPages?.length === 0, 'after their last project is removed they see nothing')
  const revoked = await invoke(owner, { action: 'revoke', email: invitedEmail })
  check(!revoked.error && revoked.data.deleted === true, 'owner can then delete their sign-in')
  check(authUserCount(invitedEmail) === 0, 'the account is gone')
  check(!(await fresh.auth.refreshSession()).data.session, 'their session can no longer be refreshed')
}

// ─── Edge cases ───
{
  const { data, error } = await invoke(owner, { ...invite(emails.unconfirmed, projB.id), sendLink: false })
  check(!error && data.created === false, 'inviting an existing unconfirmed account works')
  check(psql(`select email_confirmed_at is not null from auth.users where email = '${emails.unconfirmed}'`) === 't', 'and confirms it so viewer access applies')
  check((await statusOf(await invoke(owner, { action: 'revoke', email: emails.owner }))) === 400, "owner's own sign-in cannot be revoked")
  check((await statusOf(await invoke(owner, invite('not-an-email', projA.id)))) === 400, 'invalid email is rejected')
  check(
    (await statusOf(await invoke(owner, invite(emails.random, '00000000-0000-0000-0000-000000000000')))) === 404,
    'unknown project is rejected',
  )
  check(authUserCount(emails.random) === 0, 'a rejected invite created no account')
}

await owner.from('projects').delete().in('id', [projA.id, projB.id])
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
