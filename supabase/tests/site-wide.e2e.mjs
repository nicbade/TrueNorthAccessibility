// End-to-end check of the "Site-wide issue" flag: the checkbox in the add and edit forms (including edit from
// the issue view), the Site-wide badge on cards and in the issue view, copy/move keeping the flag, the Excel
// column, and view-only clients seeing the badge without being able to change it.
// Needs a local stack (`supabase start`), the app built against it and served on HUB_URL (see
// sign-in-link-scanner.e2e.mjs) and Playwright + exceljs + @supabase/supabase-js.
// Run: SUPABASE_SECRET_KEY=<secret key> SUPABASE_ANON_KEY=<publishable key> node supabase/tests/site-wide.e2e.mjs
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'
import ExcelJS from 'exceljs'
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
const first = await one(
  api
    .from('issues')
    .insert({ project_id: project.id, page_id: home.id, number: 1, description: 'Skip link is missing', priority: 'Major' })
    .select()
    .single(),
)
await one(api.from('project_viewers').insert({ project_id: project.id, email: VIEWER }))
const siteWide = async (id) => (await one(api.from('issues').select('site_wide').eq('id', id).single())).site_wide
const pageUrl = (page) => `${BASE}/audit-hub#/projects/${project.id}/pages/${page.id}`
const issueUrl = (page, id) => `${pageUrl(page)}/issues/${id}`

// ─── Browser helpers ───
const browser = await chromium.launch()
const size = { width: 1280, height: 900 }
async function session(email) {
  const ctx = await browser.newContext({
    viewport: size,
    acceptDownloads: true,
    ...(VIDEO ? { recordVideo: { dir: VIDEO, size } } : {}),
  })
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
async function shot(page, name, full = false) {
  if (!SHOTS) return
  if (full) await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full })
}
const h1 = (page) => page.getByRole('heading', { level: 1 })
const card = (page, n) => page.getByRole('main').locator('article').filter({ hasText: `Issue ${n}:` })
const badgeCount = (loc) => loc.getByText('Site-wide', { exact: true }).count()
const describedBy = (loc) =>
  loc.evaluate((el) =>
    (el.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' '),
  )

// ─── Owner ───
const { ctx: oc, page: o } = await session(OWNER)
await o.goto(pageUrl(home))
await h1(o).filter({ hasText: 'Home' }).waitFor()

// 1. Create a site-wide issue
await click(o.getByRole('button', { name: 'Add issue' }))
const addForm = o.getByRole('dialog', { name: 'Add issue' })
await addForm.getByLabel('Description').fill('Focus indicator is removed in the shared header')
const addBox = addForm.getByRole('checkbox', { name: 'Site-wide issue' })
expect(!(await addBox.isChecked()), 'Site-wide issue is unchecked by default')
expect((await describedBy(addBox)).includes('appears across the site'), 'checkbox has helper text as its description')
await addBox.scrollIntoViewIfNeeded()
await click(addBox)
await both(o, 'add issue form with site-wide checkbox')
await shot(o, 'add-issue-site-wide-checkbox')
await click(addForm.getByRole('button', { name: 'Add issue' }))
await addForm.waitFor({ state: 'detached' })
await card(o, 2).waitFor()
expect((await badgeCount(card(o, 2))) === 1, 'new site-wide issue card shows the Site-wide badge')
expect((await badgeCount(card(o, 1))) === 0, 'other issues have no badge')
const secondId = (await one(api.from('issues').select('id').eq('project_id', project.id).eq('number', 2).single())).id
expect((await siteWide(secondId)) === true, 'site_wide is saved')

// 2. Edit from the issue view
await o.goto(issueUrl(home, first.id))
await h1(o).filter({ hasText: 'Skip link is missing' }).waitFor()
const header = o.locator('article header').first()
expect((await badgeCount(header)) === 0, 'issue view has no badge before marking it')
await click(o.getByRole('button', { name: 'Edit issue' }))
let editForm = o.getByRole('dialog', { name: 'Edit issue #1' })
let editBox = editForm.getByRole('checkbox', { name: 'Site-wide issue' })
expect(!(await editBox.isChecked()), 'edit form shows the current (unchecked) flag')
await editBox.scrollIntoViewIfNeeded()
await click(editBox)
await click(editForm.getByRole('button', { name: 'Save issue' }))
await editForm.waitFor({ state: 'detached' })
await header.getByText('Site-wide', { exact: true }).waitFor()
expect(true, 'issue view shows the Site-wide badge after editing')
const scope = o.locator('dl div').filter({ hasText: 'Scope' })
expect((await scope.innerText()).includes('Site-wide'), 'details show Scope: Site-wide')
expect((await siteWide(first.id)) === true, 'edit saved site_wide')
await both(o, 'issue view with site-wide badge')
await shot(o, 'owner-issue-detail-site-wide', true)

// 3. Copy and move keep the flag
await click(o.getByRole('button', { name: 'Copy to a page' }))
const copyDialog = o.getByRole('dialog', { name: 'Copy issue #1' })
await copyDialog.getByLabel('Copy to page').selectOption(checkout.id)
await click(copyDialog.getByRole('button', { name: 'Copy issue' }))
await o.waitForURL(new RegExp(`/pages/${checkout.id}/issues/`))
await o.getByText('Issue #3 · Checkout').waitFor()
const copyId = new URL(o.url()).hash.split('/issues/')[1]
expect((await badgeCount(o.locator('article header').first())) === 1 && (await siteWide(copyId)) === true, 'copied issue keeps the site-wide flag')
await o.goto(issueUrl(home, secondId))
await h1(o).filter({ hasText: 'Focus indicator' }).waitFor()
await click(o.getByRole('button', { name: 'Move to page…' }))
const moveDialog = o.getByRole('dialog', { name: 'Move issue #2' })
await moveDialog.getByLabel('Move to page').selectOption(checkout.id)
await click(moveDialog.getByRole('button', { name: 'Move to Checkout' }))
await o.waitForURL(new RegExp(`/pages/${checkout.id}/issues/${secondId}$`))
await o.getByText('Issue #2 · Checkout').waitFor()
expect((await badgeCount(o.locator('article header').first())) === 1 && (await siteWide(secondId)) === true, 'moved issue keeps the site-wide flag')

// 4. Unchecking clears it
await o.goto(issueUrl(home, first.id))
await h1(o).filter({ hasText: 'Skip link is missing' }).waitFor()
await click(o.getByRole('button', { name: 'Edit issue' }))
editForm = o.getByRole('dialog', { name: 'Edit issue #1' })
editBox = editForm.getByRole('checkbox', { name: 'Site-wide issue' })
expect(await editBox.isChecked(), 'edit form shows the current (checked) flag')
await editBox.scrollIntoViewIfNeeded()
await click(editBox)
await click(editForm.getByRole('button', { name: 'Save issue' }))
await editForm.waitFor({ state: 'detached' })
await o.locator('dl div').filter({ hasText: 'Scope' }).getByText('This page only').waitFor()
expect((await badgeCount(o.locator('article header').first())) === 0 && (await siteWide(first.id)) === false, 'unchecking removes the flag and badge')

// 5. Cards on Checkout, then the Excel column
await o.goto(pageUrl(checkout))
await h1(o).filter({ hasText: 'Checkout' }).waitFor()
await card(o, 2).waitFor()
expect((await badgeCount(card(o, 2))) === 1 && (await badgeCount(card(o, 3))) === 1, 'Checkout cards show the badge')
await both(o, 'issue cards with site-wide badge')
await shot(o, 'issue-cards-site-wide-badge')
await o.goto(`${BASE}/audit-hub#/projects/${project.id}`)
await h1(o).filter({ hasText: project.name }).waitFor()
const [download] = await Promise.all([o.waitForEvent('download'), click(o.getByRole('button', { name: 'Export to Excel' }))])
const file = `/tmp/site-wide-${run}.xlsx`
await download.saveAs(file)
const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(file)
function flagFor(sheetName, description) {
  const sheet = wb.getWorksheet(sheetName)
  let col = 0
  let value
  sheet.eachRow((row) => {
    const values = row.values.map((v) => (v && typeof v === 'object' ? (v.text ?? v.richText?.map((t) => t.text).join('')) : v))
    if (!col) col = values.indexOf('Site-wide')
    else if (values.some((v) => typeof v === 'string' && v.startsWith(description))) value = values[col]
  })
  return { col, value }
}
const checkoutFlag = flagFor('Checkout', 'Focus indicator')
expect(checkoutFlag.col > 0, 'export has a Site-wide column')
expect(checkoutFlag.value === 'Yes', 'site-wide issue exports as Yes')
expect(flagFor('Home', 'Skip link').value === 'No', 'other issues export as No')
await sleep(400)
await oc.close()

// ─── Viewer (client) ───
const { ctx: vc, page: v } = await session(VIEWER)
await v.goto(pageUrl(checkout))
await h1(v).filter({ hasText: 'Checkout' }).waitFor()
await card(v, 2).waitFor()
expect((await badgeCount(card(v, 2))) === 1, 'viewer sees the Site-wide badge on cards')
await v.goto(issueUrl(checkout, secondId))
await h1(v).filter({ hasText: 'Focus indicator' }).waitFor()
expect((await badgeCount(v.locator('article header').first())) === 1, 'viewer sees the badge in the issue view')
expect((await v.getByRole('button', { name: 'Edit issue' }).count()) === 0, 'viewer has no Edit issue button')
expect((await v.getByRole('checkbox', { name: 'Site-wide issue' }).count()) === 0, 'viewer has no site-wide checkbox')
const viewerApi = createClient(API, PUBLISHABLE, opts)
await viewerApi.auth.signInWithPassword({ email: VIEWER, password: PASSWORD })
await viewerApi.from('issues').update({ site_wide: false }).eq('id', secondId)
expect((await siteWide(secondId)) === true, "viewer's direct update cannot change the flag")
await both(v, 'viewer issue view with site-wide badge')
await shot(v, 'viewer-issue-detail-site-wide', true)
await sleep(400)
await vc.close()

await browser.close()
await api.from('projects').delete().eq('id', project.id)
console.log(`\naxe total violations: ${violations}; failures: ${failures}`)
process.exit(failures || violations ? 1 : 0)
