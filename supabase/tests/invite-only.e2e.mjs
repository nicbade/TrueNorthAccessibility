// End-to-end check of invite-only sign-in: a random visitor gets a neutral message and no email; the owner
// invites a viewer (manage-viewer Edge Function), the invite email works with the Continue step, and removing
// the viewer's last project offers to delete their sign-in.
// Needs a local stack (`supabase start` with the edge runtime), the app built against it and served on
// HUB_URL (see sign-in-link-scanner.e2e.mjs) and Playwright + @supabase/supabase-js.
// Run: SUPABASE_SECRET_KEY=<secret key> SUPABASE_ANON_KEY=<publishable key> node supabase/tests/invite-only.e2e.mjs
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const BASE = process.env.HUB_URL ?? 'http://127.0.0.1:4173'
const API = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324'
const SECRET = process.env.SUPABASE_SECRET_KEY
const PUBLISHABLE = process.env.SUPABASE_ANON_KEY
const DB = process.env.SUPABASE_DB_CONTAINER ?? 'supabase_db_truenorth-audit-hub'
const SHOTS = process.env.SCREENSHOT_DIR
const VIDEO = process.env.VIDEO_DIR
if (!SECRET || !PUBLISHABLE) throw new Error('Set SUPABASE_SECRET_KEY and SUPABASE_ANON_KEY')
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })

const run = Date.now()
const OWNER = `owner-${run}@truenorth.test`
const RANDOM = `visitor-${run}@truenorth.test`
const INVITED = `client-${run}@truenorth.test`
const PASSWORD = 'test-password-123!'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
let violations = 0
const expect = (cond, msg) => {
  console.log(cond ? 'PASS' : 'FAIL', msg)
  if (!cond) failures++
}
const psql = (sql) =>
  execFileSync('docker', ['exec', DB, 'psql', '-U', 'postgres', '-tAc', sql], { encoding: 'utf8' }).trim()
const accounts = (email) => Number(psql(`select count(*) from auth.users where lower(email) = lower('${email}')`))
async function mailTo(email) {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)
  return (await res.json()).messages ?? []
}
async function inviteLink(email) {
  for (let i = 0; i < 40; i++) {
    const [msg] = await mailTo(email)
    if (msg) {
      const html = (await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json()).HTML
      return html.match(/href="([^"]*token_hash=[^"]*)"/)[1].replaceAll('&amp;', '&')
    }
    await sleep(300)
  }
  throw new Error(`no email for ${email}`)
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(API, SECRET, opts)
{
  const { error } = await admin.auth.admin.createUser({ email: OWNER, password: PASSWORD, email_confirm: true })
  if (error) throw error
}
psql(`select public.make_owner('${OWNER}')`)
const api = createClient(API, PUBLISHABLE, opts)
await api.auth.signInWithPassword({ email: OWNER, password: PASSWORD })
const { data: project, error: projectError } = await api
  .from('projects')
  .insert({ name: `Acme Storefront ${run}` })
  .select()
  .single()
if (projectError) throw projectError

// ─── Browser helpers ───
const browser = await chromium.launch()
const size = { width: 1280, height: 900 }
async function context() {
  const ctx = await browser.newContext({ viewport: size, ...(VIDEO ? { recordVideo: { dir: VIDEO, size } } : {}) })
  await ctx.addInitScript(() => {
    localStorage.setItem('tn-theme', 'light')
    window.addEventListener('DOMContentLoaded', () => {
      const c = document.createElement('div')
      c.style.cssText =
        'position:fixed;z-index:2147483647;pointer-events:none;width:18px;height:18px;border-radius:50%;background:rgba(220,38,38,.55);border:2px solid #fff;box-shadow:0 0 0 1px #000;transform:translate(-50%,-50%);left:-50px;top:-50px'
      document.documentElement.appendChild(c)
      addEventListener('mousemove', (e) => {
        c.style.left = e.clientX + 'px'
        c.style.top = e.clientY + 'px'
      })
    })
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => {
    console.log('PAGE ERROR', e.message)
    failures++
  })
  return { ctx, page }
}
async function click(loc) {
  await loc.scrollIntoViewIfNeeded()
  await loc.hover()
  await sleep(150)
  await loc.click()
}
async function axe(page, label) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  console.log(`axe [${label}]: ${r.violations.length} violations`)
  for (const v of r.violations) console.log('  -', v.id, v.nodes.map((n) => n.target.join(' ')).join(' | '))
  violations += r.violations.length
}
async function both(page, label) {
  await axe(page, label)
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await sleep(600)
  await axe(page, `${label} dark`)
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  await sleep(300)
}
const shot = (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` })

// ─── 1. A random visitor asks for a link ───
{
  const { ctx, page } = await context()
  await page.goto(BASE + '/audit-hub')
  const intro = page.getByText('Audit Hub is invitation only.')
  await intro.waitFor()
  expect(true, 'sign-in page says Audit Hub is invitation only')
  await page.getByLabel('Email').fill(RANDOM)
  await click(page.getByRole('button', { name: 'Email me a sign-in link' }))
  await page.getByRole('heading', { name: 'Check your email' }).waitFor()
  const status = await page.getByRole('status').filter({ hasText: 'Check your email' }).innerText()
  expect(status.includes(`If ${RANDOM} has been invited`), 'visitor sees the neutral "if invited" message')
  expect((await page.getByRole('alert').count()) === 0, 'no error reveals that the address has no access')
  await both(page, 'neutral check-email message')
  await shot(page, 'visitor-neutral-message')
  await sleep(1500)
  expect((await mailTo(RANDOM)).length === 0, 'no email was sent to the random visitor')
  expect(accounts(RANDOM) === 0, 'no account was created for the random visitor')
  await ctx.close()
}

// ─── 2. The owner invites a viewer ───
const { ctx: oc, page: o } = await context()
await o.goto(BASE + '/audit-hub')
await click(o.getByRole('button', { name: 'Sign in with a password instead' }))
await o.getByLabel('Email').fill(OWNER)
await o.getByLabel('Password').fill(PASSWORD)
await click(o.getByRole('button', { name: 'Sign in', exact: true }))
await o.getByRole('button', { name: 'Sign out' }).waitFor()
await click(o.getByRole('link', { name: project.name }))
const viewerEmail = o.getByLabel('Viewer email')
await viewerEmail.waitFor()
await click(viewerEmail)
await viewerEmail.fill(INVITED)
expect(await o.getByLabel('Email them a sign-in link').isChecked(), '"Email them a sign-in link" is on by default')
await click(o.getByRole('button', { name: 'Invite viewer' }))
await o.getByText(`${INVITED} can now view this project. A sign-in link was emailed to them.`).waitFor()
expect(true, 'owner sees that the viewer was invited and emailed')
expect(accounts(INVITED) === 1, 'inviting created the viewer account')
const viewers = o.getByRole('list', { name: 'Viewers' })
expect((await viewers.getByRole('listitem').filter({ hasText: INVITED }).count()) === 1, 'viewer appears in the list')
await viewers.scrollIntoViewIfNeeded()
await both(o, 'owner after inviting')
await shot(o, 'owner-invited-viewer')

// ─── 3. The invited viewer opens the email link ───
const link = await inviteLink(INVITED)
expect(link.startsWith(`${BASE}/audit-hub?token_hash=`), 'invite email links to /audit-hub with a token_hash')
const { ctx: vc, page: v } = await context()
await v.goto(link)
const cont = v.getByRole('button', { name: 'Continue signing in' })
await cont.waitFor()
expect(true, 'invite link waits for Continue (scanner-safe)')
await both(v, 'invited viewer continue')
await shot(v, 'invited-viewer-continue')
await click(cont)
await v.getByRole('button', { name: 'Sign out' }).waitFor()
await v.getByRole('link', { name: project.name }).waitFor()
expect(true, 'invited viewer is signed in and sees the project')
await shot(v, 'invited-viewer-signed-in')

// ─── 4. The owner removes them; it was their last project ───
await click(viewers.getByRole('button', { name: `Remove ${INVITED}` }))
const removeDialog = o.getByRole('dialog', { name: 'Remove viewer?' })
await click(removeDialog.getByRole('button', { name: 'Remove viewer' }))
await o.getByText(`${INVITED} no longer has access to this project. They cannot see any project now.`).waitFor()
expect(true, 'owner is told the viewer cannot see any project now')
const revoke = o.getByRole('button', { name: `Also delete their sign-in for ${INVITED}` })
await revoke.waitFor()
await both(o, 'owner revoke offer')
await shot(o, 'owner-revoke-offer')

await v.reload()
await v.getByRole('button', { name: 'Sign out' }).waitFor()
await sleep(1000)
expect((await v.getByRole('link', { name: project.name }).count()) === 0, 'removed viewer no longer sees the project')

await click(revoke)
const deleteDialog = o.getByRole('dialog', { name: 'Delete their sign-in?' })
await deleteDialog.waitFor()
await both(o, 'confirm delete sign-in')
await shot(o, 'owner-confirm-delete-sign-in')
await click(deleteDialog.getByRole('button', { name: 'Delete sign-in' }))
await o.getByText(`${INVITED} can no longer sign in.`).waitFor()
expect(accounts(INVITED) === 0, "the viewer's account was deleted")
expect((await o.getByRole('button', { name: /Also delete their sign-in/ }).count()) === 0, 'revoke button goes away')
await sleep(800)

await oc.close()
await vc.close()
await browser.close()
await api.from('projects').delete().eq('id', project.id)
console.log(`\naxe total violations: ${violations}; failures: ${failures}`)
process.exit(failures || violations ? 1 : 0)
