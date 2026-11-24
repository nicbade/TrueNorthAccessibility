// Verifies RLS and storage policies against a local Supabase stack (`supabase start`).
// Usage: SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
//        node supabase/tests/policies.test.mjs
// The service-role key is used here only to create throwaway test users; it never ships to the client.
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const anonKey = process.env.SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const dbContainer = process.env.SUPABASE_DB_CONTAINER ?? 'supabase_db_truenorth-audit-hub'
if (!anonKey || !serviceKey) throw new Error('Set SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY')

const BUCKET = 'audit-screenshots'
const run = Date.now()
const emails = {
  owner: `owner-${run}@example.com`,
  viewer: `viewer-${run}@example.com`,
  stranger: `stranger-${run}@example.com`,
}
const password = 'test-password-123!'
let failures = 0
const check = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`)
  if (!ok) failures++
}
const opts = { auth: { persistSession: false, autoRefreshToken: false } }

const admin = createClient(url, serviceKey, opts)
for (const email of Object.values(emails)) {
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
}
const { error: unconfirmedError } = await admin.auth.admin.createUser({
  email: `unconfirmed-${run}@example.com`,
  password,
  email_confirm: false,
})
if (unconfirmedError) throw unconfirmedError

const psql = (sql) =>
  execFileSync('docker', ['exec', dbContainer, 'psql', '-U', 'postgres', '-tAc', sql], { encoding: 'utf8' }).trim()
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

// ─── Owner can write everything ───
const png = new Blob([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='), (c) => c.charCodeAt(0))], { type: 'image/png' })
const { data: projA, error: pErr } = await owner.from('projects').insert({ name: 'Shared project' }).select().single()
check(!pErr && projA, 'owner can create a project')
const { data: projB } = await owner.from('projects').insert({ name: 'Private project' }).select().single()
const { data: pageA, error: pgErr } = await owner.from('pages').insert({ project_id: projA.id, name: 'Home' }).select().single()
check(!pgErr, 'owner can create a page')
const { data: pageB } = await owner.from('pages').insert({ project_id: projB.id, name: 'Secret' }).select().single()
const { data: issueA, error: iErr } = await owner
  .from('issues')
  .insert({ project_id: projA.id, page_id: pageA.id, number: 1, description: 'Missing alt text' })
  .select()
  .single()
check(!iErr, 'owner can create an issue')
const { error: crossErr } = await owner
  .from('issues')
  .insert({ project_id: projA.id, page_id: pageB.id, number: 2, description: 'Wrong project' })
check(!!crossErr, 'issue cannot point at a page from another project')
const pathA = `${projA.id}/issues/${issueA.id}/${crypto.randomUUID()}.png`
const pathB = `${projB.id}/pages/${pageB.id}/screenshot.png`
check(!(await owner.storage.from(BUCKET).upload(pathA, png)).error, 'owner can upload a screenshot')
check(!(await owner.storage.from(BUCKET).upload(pathB, png)).error, 'owner can upload to another project')
const { error: imgErr } = await owner
  .from('issue_images')
  .insert({ issue_id: issueA.id, project_id: projA.id, storage_path: pathA, alt: 'Logo' })
check(!imgErr, 'owner can create issue image metadata')
check(!(await owner.from('project_viewers').insert({ project_id: projA.id, email: emails.viewer.toUpperCase() })).error, 'owner can invite a viewer (email is case-insensitive)')
check((await owner.from('app_owners').select()).data?.length === 1, 'owner sees their owner row')

// ─── Viewer: read-only, only invited projects ───
const vProjects = (await viewer.from('projects').select('id')).data ?? []
check(vProjects.length === 1 && vProjects[0].id === projA.id, 'viewer sees only the invited project')
check((await viewer.from('pages').select('id')).data?.length === 1, 'viewer sees only that project\'s pages')
check((await viewer.from('issues').select('id')).data?.length === 1, 'viewer sees that project\'s issues')
check((await viewer.from('issue_images').select('id')).data?.length === 1, 'viewer sees issue image metadata')
check((await viewer.from('project_viewers').select('email')).data?.length === 1, 'viewer sees only their own invitation')
check((await viewer.from('app_owners').select()).data?.length === 0, 'viewer has no owner row')
check(!!(await viewer.from('projects').insert({ name: 'Nope' })).error, 'viewer cannot create projects')
await viewer.from('issues').update({ status: 'Fixed' }).eq('id', issueA.id)
check((await owner.from('issues').select('status').eq('id', issueA.id).single()).data.status === 'Open', 'viewer cannot update issues')
await viewer.from('issues').delete().eq('id', issueA.id)
check((await owner.from('issues').select('id').eq('id', issueA.id)).data.length === 1, 'viewer cannot delete issues')
check(!!(await viewer.from('project_viewers').insert({ project_id: projB.id, email: emails.viewer })).error, 'viewer cannot invite themselves to another project')
check(!!(await viewer.from('app_owners').insert({ user_id: (await viewer.auth.getUser()).data.user.id })).error, 'viewer cannot make themselves owner')
check(!!(await viewer.rpc('make_owner', { owner_email: emails.viewer })).error, 'viewer cannot call make_owner')
check(!(await viewer.storage.from(BUCKET).download(pathA)).error, 'viewer can download screenshots of the invited project')
check(!!(await viewer.storage.from(BUCKET).createSignedUrl(pathA, 60)).data?.signedUrl, 'viewer can create signed URLs for the invited project')
check(!!(await viewer.storage.from(BUCKET).download(pathB)).error, 'viewer cannot download another project\'s screenshots')
check(!(await viewer.storage.from(BUCKET).createSignedUrl(pathB, 60)).data, 'viewer cannot sign URLs for another project')
check(!!(await viewer.storage.from(BUCKET).upload(`${projA.id}/issues/x.png`, png)).error, 'viewer cannot upload screenshots')
await viewer.storage.from(BUCKET).remove([pathA])
check(!(await owner.storage.from(BUCKET).download(pathA)).error, 'viewer cannot delete screenshots')

// ─── Stranger and anonymous: nothing ───
check((await stranger.from('projects').select('id')).data?.length === 0, 'signed-in stranger sees no projects')
check((await stranger.from('issues').select('id')).data?.length === 0, 'signed-in stranger sees no issues')
check(!!(await stranger.storage.from(BUCKET).download(pathA)).error, 'stranger cannot download screenshots')
const anonProjects = await anon.from('projects').select('id')
check(!!anonProjects.error || anonProjects.data.length === 0, 'anonymous requests see no projects')
check(!!(await anon.storage.from(BUCKET).download(pathA)).error, 'anonymous requests cannot download screenshots')
const publicUrl = anon.storage.from(BUCKET).getPublicUrl(pathA).data.publicUrl
check((await fetch(publicUrl)).status >= 400, 'bucket is private (public URL is rejected)')
check(psql(`select public from storage.buckets where id = '${BUCKET}'`) === 'f', 'bucket is marked private')

// Unconfirmed accounts cannot claim an invitation for their address.
psql(`insert into public.project_viewers (project_id, email) values ('${projA.id}', 'unconfirmed-${run}@example.com')`)
const unconfirmed = createClient(url, anonKey, opts)
const signInUnconfirmed = await unconfirmed.auth.signInWithPassword({ email: `unconfirmed-${run}@example.com`, password })
const unconfirmedRows = signInUnconfirmed.error ? [] : (await unconfirmed.from('projects').select('id')).data
check(unconfirmedRows.length === 0, 'unconfirmed email cannot use a viewer invitation')

// Revoking a viewer removes access; deleting a project cascades
await owner.from('project_viewers').delete().eq('project_id', projA.id).eq('email', emails.viewer)
check((await viewer.from('projects').select('id')).data?.length === 0, 'removed viewer loses access')
check(!!(await viewer.storage.from(BUCKET).download(pathA)).error, 'removed viewer loses screenshot access')
await owner.from('projects').delete().eq('id', projA.id)
check((await owner.from('issue_images').select('id').eq('project_id', projA.id)).data.length === 0, 'deleting a project cascades to issues and images')
await owner.storage.from(BUCKET).remove([pathA, pathB])
await owner.from('projects').delete().eq('id', projB.id)

console.log(failures ? `\n${failures} check(s) failed` : '\nAll policy checks passed')
process.exit(failures ? 1 : 0)
