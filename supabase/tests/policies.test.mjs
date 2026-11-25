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

// ─── "UX / Content" severity ───
check(!(await owner.from('issues').update({ priority: 'UX / Content' }).eq('id', issueA.id)).error, 'owner can set the UX / Content severity')
check(!!(await owner.from('issues').update({ priority: 'Cosmetic' }).eq('id', issueA.id)).error, 'unknown severities are rejected')

// ─── Site-wide flag ───
check((await owner.from('issues').select('site_wide').eq('id', issueA.id).single()).data.site_wide === false, 'issues are not site-wide by default')
check(!(await owner.from('issues').update({ site_wide: true }).eq('id', issueA.id)).error, 'owner can mark an issue site-wide')
check((await viewer.from('issues').select('site_wide').eq('id', issueA.id).single()).data?.site_wide === true, 'viewer can see the site-wide flag')
await viewer.from('issues').update({ site_wide: false }).eq('id', issueA.id)
check((await owner.from('issues').select('site_wide').eq('id', issueA.id).single()).data.site_wide === true, 'viewer cannot change the site-wide flag')

// ─── Hidden pages ───
const { data: pageH } = await owner.from('pages').insert({ project_id: projA.id, name: 'Draft', hidden: true }).select().single()
const { data: issueH } = await owner
  .from('issues')
  .insert({ project_id: projA.id, page_id: pageH.id, number: 2, description: 'Hidden finding' })
  .select()
  .single()
const pathH = `${projA.id}/issues/${issueH.id}/${crypto.randomUUID()}.png`
const pathHP = `${projA.id}/pages/${pageH.id}/screenshot.png`
await owner.storage.from(BUCKET).upload(pathH, png)
await owner.storage.from(BUCKET).upload(pathHP, png)
await owner.from('issue_images').insert({ issue_id: issueH.id, project_id: projA.id, storage_path: pathH })
check((await owner.from('pages').select('id').eq('project_id', projA.id)).data?.length === 2, 'owner sees hidden pages')
check((await viewer.from('pages').select('id').eq('id', pageH.id)).data?.length === 0, 'viewer cannot see a hidden page')
check((await viewer.from('issues').select('id').eq('id', issueH.id)).data?.length === 0, 'viewer cannot see issues on a hidden page')
check((await viewer.from('issue_images').select('id').eq('issue_id', issueH.id)).data?.length === 0, 'viewer cannot see image metadata on a hidden page')
check(!!(await viewer.storage.from(BUCKET).download(pathH)).error, 'viewer cannot download issue screenshots on a hidden page')
check(!!(await viewer.storage.from(BUCKET).download(pathHP)).error, 'viewer cannot download a hidden page screenshot')
await viewer.from('pages').update({ hidden: false }).eq('id', pageH.id)
check((await owner.from('pages').select('hidden').eq('id', pageH.id).single()).data.hidden === true, 'viewer cannot unhide a page')
await owner.from('pages').update({ hidden: false }).eq('id', pageH.id)
check((await viewer.from('issues').select('id').eq('id', issueH.id)).data?.length === 1, 'unhiding a page shows its issues to viewers')
check(!(await viewer.storage.from(BUCKET).download(pathH)).error, 'unhiding a page restores screenshot access')
await owner.from('pages').update({ hidden: true }).eq('id', pageH.id)

// ─── Comments ───
const comment = (client, email, fields) =>
  client.from('comments').insert({ project_id: projA.id, page_id: pageA.id, author_email: email, ...fields }).select().single()
const viewerId = (await viewer.auth.getUser()).data.user.id
const vc = await comment(viewer, emails.viewer, { issue_id: issueA.id, author_id: viewerId, body: 'Can you clarify?' })
check(!vc.error, 'viewer can comment on an issue')
check(!(await comment(viewer, emails.viewer, { author_id: viewerId, body: 'Page note' })).error, 'viewer can comment on a page')
check(!!(await comment(viewer, emails.owner, { author_id: viewerId, body: 'Spoofed' })).error, 'viewer cannot comment as someone else')
check(
  !!(await viewer.from('comments').insert({ project_id: projA.id, page_id: pageH.id, issue_id: issueH.id, author_id: viewerId, author_email: emails.viewer, body: 'x' })).error,
  'viewer cannot comment on a hidden page',
)
check(
  !!(await viewer.from('comments').insert({ project_id: projB.id, page_id: pageB.id, author_id: viewerId, author_email: emails.viewer, body: 'x' })).error,
  'viewer cannot comment on another project',
)
check(!!(await comment(viewer, emails.viewer, { issue_id: issueH.id, author_id: viewerId, body: 'x' })).error, 'a comment cannot point at an issue on a different page')
const ownerId = (await owner.auth.getUser()).data.user.id
const oc = await comment(owner, emails.owner, { issue_id: issueA.id, author_id: ownerId, body: 'Sure, see the fix.' })
check(!oc.error, 'owner can comment')
check((await owner.from('comments').select('id')).data?.length === 3, 'owner sees all comments')
check((await viewer.from('comments').select('id')).data?.length === 3, 'viewer sees comments on visible pages')
check((await stranger.from('comments').select('id')).data?.length === 0, 'stranger sees no comments')
await viewer.from('comments').delete().eq('id', oc.data.id)
check((await owner.from('comments').select('id').eq('id', oc.data.id)).data?.length === 1, "viewer cannot delete someone else's comment")
await viewer.from('comments').update({ body: 'edited' }).eq('id', vc.data.id)
check((await owner.from('comments').select('body').eq('id', vc.data.id).single()).data.body === 'Can you clarify?', 'comments cannot be edited')
await owner.from('comments').delete().eq('id', vc.data.id)
check((await owner.from('comments').select('id').eq('id', vc.data.id)).data?.length === 0, "owner can delete a viewer's comment")

// ─── Moving an issue to another page ───
const { data: pageC } = await owner.from('pages').insert({ project_id: projA.id, name: 'Checkout' }).select().single()
await viewer.from('issues').update({ page_id: pageC.id }).eq('id', issueA.id)
check((await owner.from('issues').select('page_id').eq('id', issueA.id).single()).data.page_id === pageA.id, 'viewer cannot move an issue')
const moveTo = (page) => owner.from('issues').update({ page_id: page.id }).eq('id', issueA.id).select().single()
const moved = await moveTo(pageC)
check(!moved.error && moved.data.page_id === pageC.id && moved.data.number === 1, 'owner can move an issue; it keeps its number')
check((await owner.from('comments').select('page_id').eq('id', oc.data.id).single()).data.page_id === pageC.id, "the issue's comments move with it")
check((await owner.from('issue_images').select('id').eq('issue_id', issueA.id)).data.length === 1, 'screenshots stay attached after a move')
check((await viewer.from('issues').select('page_id').eq('id', issueA.id).single()).data?.page_id === pageC.id, 'viewer sees the issue on its new page')
check((await viewer.from('comments').select('id').eq('id', oc.data.id)).data?.length === 1, 'viewer still sees the moved comment')
check(!(await viewer.storage.from(BUCKET).download(pathA)).error, 'viewer can still open the moved screenshot')
check(!!(await moveTo(pageB)).error, 'an issue cannot be moved to a page in another project')
check(!(await moveTo(pageH)).error, 'owner can move an issue to a hidden page')
check((await viewer.from('issues').select('id').eq('id', issueA.id)).data?.length === 0, 'moving to a hidden page hides the issue from viewers')
check((await viewer.from('comments').select('id').eq('id', oc.data.id)).data?.length === 0, '...and its comments')
check(!!(await viewer.storage.from(BUCKET).download(pathA)).error, '...and its screenshots')
check(!(await moveTo(pageA)).error, 'owner can move it back')

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
await owner.storage.from(BUCKET).remove([pathA, pathB, pathH, pathHP])
await owner.from('projects').delete().eq('id', projB.id)

console.log(failures ? `\n${failures} check(s) failed` : '\nAll policy checks passed')
process.exit(failures ? 1 : 0)
