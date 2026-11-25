// End-to-end check of the issue detail view (#/projects/:id/pages/:pid/issues/:iid) for the owner and a
// view-only client: opening from the list, prev/next, back to the page with focus restored, large
// screenshots, comments, and owner-only status/edit/copy/delete.
// Needs a local stack (`supabase start`), the app built against it and served on HUB_URL (see
// sign-in-link-scanner.e2e.mjs) and Playwright + @supabase/supabase-js.
// Run: SUPABASE_SECRET_KEY=<secret key> SUPABASE_ANON_KEY=<publishable key> node supabase/tests/issue-detail.e2e.mjs
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const BASE = process.env.HUB_URL ?? 'http://127.0.0.1:4173'
const API = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SECRET = process.env.SUPABASE_SECRET_KEY
const PUBLISHABLE = process.env.SUPABASE_ANON_KEY
const DB = process.env.SUPABASE_DB_CONTAINER ?? 'supabase_db_truenorth-audit-hub'
const SHOTS = process.env.SCREENSHOT_DIR
const VIDEO = process.env.VIDEO_DIR
if (!SECRET || !PUBLISHABLE) throw new Error('Set SUPABASE_SECRET_KEY and SUPABASE_ANON_KEY')
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })

const run = Date.now()
const OWNER = `owner-${run}@truenorth.test`
const VIEWER = `client-${run}@truenorth.test`
const PASSWORD = 'test-password-123!'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
let violations = 0
const expect = (cond, msg) => {
  console.log(cond ? 'PASS' : 'FAIL', msg)
  if (!cond) failures++
}

// ─── Seed ───
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(API, SECRET, opts)
for (const email of [OWNER, VIEWER]) {
  const { error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  if (error) throw error
}
execFileSync('docker', ['exec', DB, 'psql', '-U', 'postgres', '-qc', `select public.make_owner('${OWNER}')`])
const api = createClient(API, PUBLISHABLE, opts)
await api.auth.signInWithPassword({ email: OWNER, password: PASSWORD })
const one = async (q) => {
  const { data, error } = await q
  if (error) throw error
  return data
}
const project = await one(api.from('projects').insert({ name: `Acme Storefront ${run}` }).select().single())
const home = await one(api.from('pages').insert({ project_id: project.id, name: 'Home' }).select().single())
const checkout = await one(api.from('pages').insert({ project_id: project.id, name: 'Checkout' }).select().single())
const hidden = await one(
  api.from('pages').insert({ project_id: project.id, name: 'Admin', hidden: true }).select().single(),
)
const issue = (page, number, fields) =>
  one(
    api
      .from('issues')
      .insert({ project_id: project.id, page_id: page.id, number, status: 'Open', ...fields })
      .select()
      .single(),
  )
const first = await issue(home, 1, {
  description: 'Hero carousel cannot be paused and auto-advances every 3 seconds',
  expected_behavior: 'Moving content that starts automatically has a visible pause control.\nIt stops on focus.',
  fix: 'Add a Pause button before the slides and stop rotation while any slide has focus or hover.',
  comments: 'Seen in Chrome and Safari. Also affects the mobile layout.',
  priority: 'Critical',
  wcag: ['2.2.2', '2.1.1'],
  category: 'Motion',
  location: 'Homepage hero',
  examples: [{ kind: 'W3C', label: 'WAI carousel tutorial', url: 'https://www.w3.org/WAI/tutorials/carousels/' }],
})
const second = await issue(home, 2, { description: 'Search field has no label', priority: 'Major', wcag: ['1.3.1'] })
const third = await issue(home, 3, { description: 'Footer links are too small', priority: 'Minor' })
const hiddenIssue = await issue(hidden, 4, { description: 'Internal admin table issue' })
const png = fs.readFileSync(process.env.FIXTURE_IMAGE ?? new URL('../../public/og-image.png', import.meta.url))
const imgPath = `${project.id}/issues/${first.id}/${crypto.randomUUID()}.png`
await one(api.storage.from('audit-screenshots').upload(imgPath, png, { contentType: 'image/png' }))
await one(
  api.from('issue_images').insert({
    issue_id: first.id,
    project_id: project.id,
    storage_path: imgPath,
    name: 'hero.png',
    type: 'image/png',
    size: png.length,
    width: 1200,
    height: 630,
    alt: 'Homepage hero carousel with no pause button',
  }),
)
await one(api.from('project_viewers').insert({ project_id: project.id, email: VIEWER }))
const ownerId = (await api.auth.getUser()).data.user.id
const movingComment = await one(
  api
    .from('comments')
    .insert({ project_id: project.id, page_id: home.id, issue_id: second.id, author_id: ownerId, author_email: OWNER, body: 'Use a visible label, not a placeholder.' })
    .select()
    .single(),
)
const issueUrl = (page, i) => `${BASE}/audit-hub#/projects/${project.id}/pages/${page.id}/issues/${i.id}`

// ─── Browser helpers ───
const browser = await chromium.launch()
const size = { width: 1280, height: 900 }
async function session(email) {
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
  await page.goto(BASE + '/audit-hub')
  await click(page.getByRole('button', { name: 'Sign in with a password instead' }))
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await click(page.getByRole('button', { name: 'Sign in', exact: true }))
  await page.getByRole('button', { name: 'Sign out' }).waitFor()
  return { ctx, page }
}
async function click(loc, options) {
  await loc.scrollIntoViewIfNeeded()
  await loc.hover(options)
  await sleep(150)
  await loc.click(options)
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
async function shot(page, name, full = false) {
  if (!SHOTS) return
  if (full) await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full })
}
const h1 = (page) => page.getByRole('heading', { level: 1 })
const focusedText = (page) => page.evaluate(() => document.activeElement?.textContent?.trim() ?? '')
const issueIdInUrl = (page) => new URL(page.url()).hash.split('/issues/')[1]

// ─── Owner ───
const { ctx: oc, page: o } = await session(OWNER)
await o.goto(`${BASE}/audit-hub#/projects/${project.id}/pages/${home.id}`)
await h1(o).filter({ hasText: 'Home' }).waitFor()
await both(o, 'page with Open full view links')
await shot(o, 'page-issue-list-open-full-view')

// Keyboard: Tab to "Open full view" on issue #1 and press Enter
const openFirst = o.getByRole('link', { name: 'Open full view of issue #1' })
await openFirst.focus()
await o.keyboard.press('Enter')
await h1(o).filter({ hasText: 'Hero carousel cannot be paused' }).waitFor()
expect(issueIdInUrl(o) === first.id, 'Open full view (keyboard) goes to the issue route')
expect((await focusedText(o)).includes('Hero carousel cannot be paused'), 'focus moves to the issue heading')
expect((await o.title()).startsWith('Issue #1: Hero carousel'), 'document title names the issue')
const crumb = o.getByRole('navigation', { name: 'Breadcrumb' })
expect((await crumb.getByRole('link', { name: 'Issue #1' }).getAttribute('aria-current')) === 'page', 'breadcrumb ends with the issue')
for (const [name, text] of [
  ['Expected behavior', 'visible pause control'],
  ['How to fix', 'Add a Pause button'],
  ['Auditor notes', 'Seen in Chrome and Safari'],
  ['Working examples and references', 'WAI carousel tutorial'],
]) {
  const section = o.locator('section').filter({ has: o.getByRole('heading', { level: 2, name }) })
  expect((await section.innerText()).includes(text), `shows ${name}`)
}
const details = await o.locator('dl').first().innerText()
expect(details.includes('2.2.2 Pause, Stop, Hide (Level A)') && details.includes('Homepage hero'), 'details list WCAG names and location')
expect((await o.getByText('Issue 1 of 3 on this page').count()) === 1, 'shows the position among the page issues')
expect((await o.getByRole('link', { name: /^Previous issue #/ }).count()) === 0, 'no Previous link on the first issue')
await both(o, 'owner issue detail')
await shot(o, 'owner-issue-detail', true)

// Large screenshot opens the enlarged viewer; closing returns focus
const enlarge = o.getByRole('button', { name: /Enlarge screenshot 1/ })
const box = await enlarge.boundingBox()
expect(box && box.width > 900, `screenshot is shown large (${Math.round(box?.width ?? 0)}px wide)`)
await click(enlarge)
const viewer = o.getByRole('dialog', { name: 'Issue #1 screenshot 1 of 1' })
await viewer.waitFor()
await both(o, 'enlarged screenshot')
await shot(o, 'owner-enlarged-screenshot')
await o.keyboard.press('Escape')
await viewer.waitFor({ state: 'detached' })
expect((await focusedText(o)).includes('Enlarge screenshot 1'), 'closing the enlarged screenshot returns focus')

// Next / Previous
await click(o.getByRole('link', { name: 'Next issue #2' }))
await h1(o).filter({ hasText: 'Search field has no label' }).waitFor()
expect(issueIdInUrl(o) === second.id, 'Next goes to issue #2')
await click(o.getByRole('link', { name: 'Next issue #3' }))
await h1(o).filter({ hasText: 'Footer links are too small' }).waitFor()
expect((await o.getByRole('link', { name: /^Next issue #/ }).count()) === 0, 'no Next link on the last issue')
await click(o.getByRole('link', { name: 'Previous issue #2' }))
await h1(o).filter({ hasText: 'Search field has no label' }).waitFor()
expect(issueIdInUrl(o) === second.id, 'Previous goes back to issue #2')

// Back to the page returns focus to that issue in the list
await click(o.getByRole('link', { name: 'Back to Home' }))
await h1(o).filter({ hasText: 'Home' }).waitFor()
await sleep(300)
expect(
  (await o.evaluate(() => document.activeElement?.getAttribute('data-issue-link'))) === second.id,
  'back on the page, focus is on the issue you came from',
)

// Clicking the issue title also opens it; then owner actions
// The title wraps, so aim at its first word rather than the middle of its bounding box.
await click(o.getByRole('link', { name: 'Issue 1: Hero carousel cannot be paused and auto-advances every 3 seconds' }), {
  position: { x: 12, y: 8 },
})
await h1(o).filter({ hasText: 'Hero carousel' }).waitFor()
expect(issueIdInUrl(o) === first.id, 'clicking the issue title opens the issue')
const actions = o.getByRole('group', { name: 'Issue actions' })
await actions.getByLabel('Status').selectOption('Needs retest')
await o.getByText('Status: Needs retest').first().waitFor()
expect((await one(api.from('issues').select('status').eq('id', first.id).single())).status === 'Needs retest', 'owner can change the status from the issue view')

await click(actions.getByRole('button', { name: 'Edit issue' }))
const form = o.getByRole('dialog', { name: 'Edit issue #1' })
await form.getByLabel('Description').fill('Hero carousel cannot be paused')
await click(form.getByRole('button', { name: 'Save issue' }))
await form.waitFor({ state: 'detached' })
await h1(o).filter({ hasText: /^Issue 1: Hero carousel cannot be paused$/ }).waitFor()
expect(true, 'owner can edit the issue from the issue view')

await click(actions.getByRole('button', { name: 'Copy to a page' }))
const copyDialog = o.getByRole('dialog', { name: 'Copy issue #1' })
await copyDialog.waitFor()
expect((await copyDialog.getByLabel('Copy to page').inputValue()) === checkout.id, 'copy defaults to another page')
await both(o, 'copy issue dialog')
await shot(o, 'owner-copy-to-page')
await click(copyDialog.getByRole('button', { name: 'Copy issue' }))
await o.getByRole('heading', { level: 1, name: /Hero carousel cannot be paused/ }).waitFor()
await o.waitForURL(new RegExp(`/pages/${checkout.id}/issues/`))
const copyId = issueIdInUrl(o)
expect(copyId && copyId !== first.id, 'copy opens the new issue on Checkout')
expect((await o.getByText('Issue #5 · Checkout').count()) === 1, 'copy has the next number on Checkout')
expect((await o.getByRole('button', { name: /Enlarge screenshot 1/ }).count()) === 1, 'copy keeps the screenshot')

await click(actions.getByRole('button', { name: 'Delete issue' }))
const confirmDelete = o.getByRole('alertdialog').or(o.getByRole('dialog', { name: 'Delete issue #5?' }))
await confirmDelete.first().waitFor()
await both(o, 'confirm delete from issue view')
await click(confirmDelete.first().getByRole('button', { name: 'Delete issue' }))
await h1(o).filter({ hasText: 'Checkout' }).waitFor()
expect((await o.getByText('Not found').count()) === 0, 'after deleting, the page view shows (no Not found)')
expect((await api.from('issues').select('id').eq('id', copyId)).data.length === 0, 'the issue was deleted')

// Move to another page from the issue view: keeps number and comments, then follows the issue
await o.goto(issueUrl(home, second))
await h1(o).filter({ hasText: 'Search field has no label' }).waitFor()
await click(actions.getByRole('button', { name: 'Move to page…' }))
let moveDialog = o.getByRole('dialog', { name: 'Move issue #2' })
await moveDialog.waitFor()
expect((await moveDialog.innerText()).includes('keeps its number, 0 screenshots and 1 comment'), 'move dialog explains what moves')
await click(moveDialog.getByRole('button', { name: 'Cancel' }))
await moveDialog.waitFor({ state: 'detached' })
expect((await one(api.from('issues').select('page_id').eq('id', second.id).single())).page_id === home.id, 'Cancel does not move the issue')
await click(actions.getByRole('button', { name: 'Move to page…' }))
moveDialog = o.getByRole('dialog', { name: 'Move issue #2' })
const destination = moveDialog.getByLabel('Move to page')
const optionNames = await destination.locator('option').allTextContents()
expect(!optionNames.includes('Home') && optionNames.includes('Admin (hidden from clients)'), 'move lists the other pages, marking hidden ones')
await destination.selectOption(checkout.id)
await both(o, 'move issue dialog')
await shot(o, 'owner-move-to-page')
await click(moveDialog.getByRole('button', { name: 'Move to Checkout' }))
await o.waitForURL(new RegExp(`/pages/${checkout.id}/issues/${second.id}$`))
await h1(o).filter({ hasText: 'Search field has no label' }).waitFor()
expect((await o.getByText('Issue #2 · Checkout').count()) === 1, 'after moving, the issue opens on its new page with the same number')
expect((await o.getByText('Not found').count()) === 0, 'no Not found flash after moving')
expect((await focusedText(o)).includes('Search field has no label'), 'focus is on the moved issue heading')
expect((await o.getByRole('list', { name: 'Comments on issue #2' }).getByText('Use a visible label').count()) === 1, 'the comment moved with the issue')
expect((await one(api.from('comments').select('page_id').eq('id', movingComment.id).single())).page_id === checkout.id, 'comment page is updated in the database')
await shot(o, 'owner-moved-issue-on-new-page')
await o.goto(`${BASE}/audit-hub#/projects/${project.id}/pages/${home.id}`)
await h1(o).filter({ hasText: 'Home' }).waitFor()
expect((await o.getByRole('link', { name: 'Open full view of issue #2' }).count()) === 0, 'the issue is gone from the original page')

// Move back from the page's issue list (row action)
await o.goto(`${BASE}/audit-hub#/projects/${project.id}/pages/${checkout.id}`)
await h1(o).filter({ hasText: 'Checkout' }).waitFor()
await click(o.getByRole('button', { name: 'Move issue #2 to another page' }))
moveDialog = o.getByRole('dialog', { name: 'Move issue #2' })
await moveDialog.getByLabel('Move to page').selectOption(home.id)
await click(moveDialog.getByRole('button', { name: 'Move to Home' }))
await o.waitForURL(new RegExp(`/pages/${home.id}/issues/${second.id}$`))
await h1(o).filter({ hasText: 'Search field has no label' }).waitFor()
expect(true, 'owner can move an issue from the page list and lands on it')

// Deep link + unknown issue
await o.goto(issueUrl(home, third))
await h1(o).filter({ hasText: 'Footer links are too small' }).waitFor()
expect(true, 'a direct link to an issue opens it')
await o.goto(`${BASE}/audit-hub#/projects/${project.id}/pages/${home.id}/issues/00000000-0000-0000-0000-000000000000`)
await h1(o).filter({ hasText: 'Not found' }).waitFor()
expect(true, 'an unknown issue shows Not found')
await oc.close()

// ─── Viewer (client) ───
const { ctx: vc, page: v } = await session(VIEWER)
await v.goto(`${BASE}/audit-hub#/projects/${project.id}/pages/${home.id}`)
await h1(v).filter({ hasText: 'Home' }).waitFor()
expect((await v.getByRole('button', { name: /^Move/ }).count()) === 0, 'viewer has no Move action in the issue list')
await click(v.getByRole('link', { name: 'Open full view of issue #1' }))
await h1(v).filter({ hasText: 'Hero carousel cannot be paused' }).waitFor()
expect((await v.getByRole('group', { name: 'Issue actions' }).count()) === 0, 'viewer has no issue actions')
for (const name of ['Edit issue', 'Delete issue', 'Copy to a page']) {
  expect((await v.getByRole('button', { name }).count()) === 0, `viewer has no ${name} button`)
}
expect((await v.getByRole('combobox', { name: 'Status' }).count()) === 0, 'viewer cannot change the status')
expect((await v.getByRole('button', { name: /^Move/ }).count()) === 0, 'viewer has no Move action in the issue view')
expect((await v.getByRole('button', { name: /Enlarge screenshot 1/ }).count()) === 1, 'viewer sees the large screenshot')
const field = v.getByLabel('Add a comment on issue #1')
await field.fill('Can we keep autoplay if there is a pause button?')
await click(v.getByRole('button', { name: 'Post comment on issue #1' }))
await v.getByRole('list', { name: 'Comments on issue #1' }).getByText('Can we keep autoplay').waitFor()
expect(true, 'viewer can comment from the issue view')
await both(v, 'viewer issue detail')
await shot(v, 'viewer-issue-detail', true)
await v.goto(issueUrl(hidden, hiddenIssue))
await h1(v).filter({ hasText: 'Not found' }).waitFor()
expect(true, 'viewer cannot open an issue on a hidden page')
await vc.close()

await browser.close()
await api.from('projects').delete().eq('id', project.id)
console.log(`\naxe total violations: ${violations}; failures: ${failures}`)
process.exit(failures || violations ? 1 : 0)
