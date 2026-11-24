// End-to-end check of comments, hidden pages, copying issues, the Newest sort, confirmation dialogs
// and the "UX / Content" severity, as the owner and as a view-only client.
// Needs a local stack (`supabase start`), the app built against it and served on HUB_URL (see
// sign-in-link-scanner.e2e.mjs for the build commands) and Playwright + exceljs:
//   npm i --no-save playwright @axe-core/playwright exceljs && npx playwright install chromium
// Run: SUPABASE_SECRET_KEY=<secret key> node supabase/tests/feedback-batch.e2e.mjs
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

// ─── Seed: owner, client, project with two pages; issue #1 (with a screenshot) on Checkout ───
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
const source = await one(
  api
    .from('issues')
    .insert({
      project_id: project.id,
      page_id: checkout.id,
      number: 1,
      description: 'Card number field has no visible label',
      expected_behavior: 'Every field has a visible label',
      fix: 'Add a <label> element',
      priority: 'Critical',
      wcag: ['1.3.1', '3.3.2'],
      category: 'Forms',
      status: 'In progress',
      location: 'Payment form',
    })
    .select()
    .single(),
)
const png = fs.readFileSync(process.env.FIXTURE_IMAGE ?? new URL('../../public/og-image.png', import.meta.url))
const imgPath = `${project.id}/issues/${source.id}/${crypto.randomUUID()}.png`
await one(api.storage.from('audit-screenshots').upload(imgPath, png, { contentType: 'image/png' }))
await one(
  api.from('issue_images').insert({
    issue_id: source.id,
    project_id: project.id,
    storage_path: imgPath,
    name: 'payment.png',
    type: 'image/png',
    size: png.length,
    width: 1200,
    height: 630,
    alt: 'Payment form with an unlabeled card number field',
  }),
)
await one(api.from('project_viewers').insert({ project_id: project.id, email: VIEWER }))

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
  await sleep(120)
  await loc.click()
}
async function axe(page, label) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  console.log(`axe [${label}]: ${r.violations.length} violations`)
  for (const v of r.violations) console.log('  -', v.id, v.nodes.map((n) => n.target.join(' ')).join(' | '))
  violations += r.violations.length
}
async function dark(page, label) {
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await sleep(600)
  await axe(page, `${label} dark`)
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  await sleep(300)
}
const shot = (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` })
const cards = (page) => page.getByRole('main').locator('article')
async function sheetNames(download) {
  const file = `/tmp/hub-export-${run}-${Math.random().toString(36).slice(2)}.xlsx`
  await download.saveAs(file)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)
  return wb
}

// ─── Owner ───
const { ctx: oc, page: o } = await session(OWNER)
await click(o.getByRole('link', { name: project.name }))
await click(o.getByRole('link', { name: 'Home', exact: true }))
await o.getByRole('heading', { level: 1, name: 'Home' }).waitFor()

// 6. UX / Content severity in the issue form
await click(o.getByRole('button', { name: 'Add issue' }))
const form = o.getByRole('dialog', { name: 'Add issue' })
await form.getByLabel('Description').fill('Hero headline uses vague marketing copy')
const priority = form.getByLabel('Priority (severity)')
expect((await priority.locator('option').allTextContents()).includes('UX / Content'), 'issue form offers the UX / Content severity')
await priority.selectOption('UX / Content')
await click(form.getByRole('button', { name: 'Add issue' }))
await form.waitFor({ state: 'detached' })
const uxIssue = o.getByRole('article', { name: /Issue 2: Hero headline/ })
await uxIssue.waitFor()
expect((await uxIssue.innerText()).includes('UX / Content'), 'issue saved with the UX / Content severity')

// 5. Copy issue #1 from Checkout onto Home
await click(o.getByRole('button', { name: 'Copy existing issue' }))
const copy = o.getByRole('dialog', { name: 'Copy an existing issue' })
expect(await copy.getByLabel('Issue number').evaluate((el) => el === document.activeElement), 'copy dialog focuses the issue number field')
await copy.getByLabel('Issue number').fill('99')
await click(copy.getByRole('button', { name: 'Copy to this page' }))
await copy.getByRole('alert').filter({ hasText: 'no issue #99' }).waitFor()
expect(true, 'copy dialog reports an unknown issue number')
await copy.getByLabel('Issue number').fill('1')
await copy.getByText('Card number field has no visible label').waitFor()
await axe(o, 'copy dialog')
await shot(o, 'copy-existing-issue')
await click(copy.getByRole('button', { name: 'Copy to this page' }))
await copy.waitFor({ state: 'detached' })
const copied = o.getByRole('article', { name: /Issue 3: Card number field/ })
await copied.waitFor()
expect((await copied.innerText()).includes('Payment form') && (await copied.innerText()).includes('1.3.1'), 'copy keeps the location and WCAG fields')
expect((await copied.innerText()).includes('Open'), 'copy starts as Open')
await o.waitForFunction(() => [...document.querySelectorAll('article img')].some((i) => i.src.includes('/sign/') && i.complete && i.naturalWidth > 0))
expect(true, 'copied screenshot loads from its own storage object')
const copiedImages = (await api.from('issue_images').select('storage_path, alt').eq('project_id', project.id)).data.filter((r) => r.storage_path !== imgPath)
expect(copiedImages.length === 1 && copiedImages[0].alt.startsWith('Payment form'), 'screenshot copied with its alt text to a new storage path')

// 2. Newest sort
await o.getByLabel('Sort by').selectOption('newest')
expect((await cards(o).first().innerText()).includes('#3'), 'Newest first puts the most recently created issue first')
await o.getByLabel('Sort by').selectOption('number')
expect((await cards(o).first().innerText()).includes('#2'), 'Issue number sort restores ascending order')

// 3. Confirmation before delete: Cancel and Escape keep the issue; confirming deletes it
const del = o.getByRole('button', { name: 'Delete issue #3' })
await click(del)
const confirmDlg = o.getByRole('dialog', { name: 'Delete issue #3?' })
await confirmDlg.waitFor()
expect(await confirmDlg.getByRole('button', { name: 'Cancel' }).evaluate((el) => el === document.activeElement), 'confirmation dialog focuses Cancel')
await axe(o, 'confirm dialog')
await dark(o, 'confirm dialog')
await shot(o, 'confirm-delete-dialog')
await o.keyboard.press('Escape')
await confirmDlg.waitFor({ state: 'detached' })
expect(await del.evaluate((el) => el === document.activeElement), 'Escape cancels and returns focus to the Delete button')
expect((await cards(o).count()) === 2, 'issue still exists after cancelling')
await click(del)
await click(o.getByRole('dialog', { name: 'Delete issue #3?' }).getByRole('button', { name: 'Delete issue' }))
await o.getByRole('article', { name: /Issue 3:/ }).waitFor({ state: 'detached' })
expect(true, 'confirming deletes the issue')

// Owner leaves a page comment
await o.getByLabel('Add a comment on this page').fill('Please review the new hero copy before Friday.')
await click(o.getByRole('button', { name: 'Post comment on this page' }))
await o.getByRole('list', { name: 'Comments on this page' }).getByText('Please review').waitFor()
expect(true, 'owner can post a page comment')

// 4. Hide Checkout from clients
await click(o.getByRole('link', { name: project.name }))
await click(o.getByRole('link', { name: 'Checkout', exact: true }))
await click(o.getByRole('button', { name: 'Hide from clients' }))
await o.getByRole('button', { name: 'Show to clients' }).waitFor()
expect((await o.getByRole('main').innerText()).includes("Clients can't see this page"), 'owner sees the page marked Hidden')
await axe(o, 'hidden page (owner)')
await click(o.getByRole('link', { name: project.name }))
const row = o.getByRole('row', { name: /Checkout/ })
expect((await row.innerText()).includes('Hidden'), 'project page list marks Checkout as Hidden')
expect((await o.getByRole('main').innerText()).includes("Includes 1 hidden page that clients can't see"), 'owner metrics note the hidden page')
expect((await o.getByRole('columnheader', { name: 'UX / Content' }).count()) === 1, 'page table has a UX / Content column')
expect((await o.getByRole('main').innerText()).includes('UX / Content'), 'severity metrics include UX / Content')
await axe(o, 'project (owner)')
await dark(o, 'project (owner)')
await shot(o, 'owner-project-hidden-page')
let [download] = await Promise.all([o.waitForEvent('download'), click(o.getByRole('button', { name: 'Export to Excel' }))])
let wb = await sheetNames(download)
expect(!wb.worksheets.some((s) => s.name === 'Checkout'), 'owner export leaves hidden pages out by default')
const summary = wb.getWorksheet('Summary')
let summaryText = ''
summary.eachRow((r) => (summaryText += JSON.stringify(r.values)))
expect(summaryText.includes('UX / Content'), 'export summary includes the UX / Content severity')
await click(o.getByLabel('Include hidden pages in export'))
;[download] = await Promise.all([o.waitForEvent('download'), click(o.getByRole('button', { name: 'Export to Excel' }))])
wb = await sheetNames(download)
expect(wb.worksheets.some((s) => s.name === 'Checkout'), 'owner can include hidden pages in the export')
await sleep(400)
await oc.close()

// ─── Client (viewer) ───
const { ctx: vc, page: v } = await session(VIEWER)
await click(v.getByRole('link', { name: project.name }))
expect((await v.getByRole('row', { name: /Checkout/ }).count()) === 0, 'client does not see the hidden page')
const totalCard = v.getByRole('main').locator('dl div').filter({ hasText: 'Total issues' })
expect((await totalCard.innerText()).includes('1'), "client metrics leave out the hidden page's issues")
expect(!(await v.getByRole('main').innerText()).includes('hidden page'), 'client sees no hidden-page note')
;[download] = await Promise.all([v.waitForEvent('download'), click(v.getByRole('button', { name: 'Export to Excel' }))])
wb = await sheetNames(download)
expect(!wb.worksheets.some((s) => s.name === 'Checkout'), 'client export has no hidden pages')
await v.goto(`${BASE}/audit-hub#/projects/${project.id}/pages/${checkout.id}`)
await v.getByRole('heading', { level: 1, name: 'Not found' }).waitFor()
expect(true, 'client gets Not found for a hidden page URL')
await v.goto(`${BASE}/audit-hub#/projects/${project.id}/pages/${home.id}`)
await v.getByRole('heading', { level: 1, name: 'Home' }).waitFor()
expect((await v.getByRole('button', { name: 'Copy existing issue' }).count()) === 0, 'client cannot copy issues')
expect((await v.getByRole('button', { name: /Hide from clients|Show to clients/ }).count()) === 0, 'client cannot hide pages')
expect((await v.getByLabel('Sort by').locator('option').allTextContents()).includes('Newest first'), 'client can sort by Newest first')
const pageThread = v.getByRole('list', { name: 'Comments on this page' })
await pageThread.getByText('Please review').waitFor()
expect((await pageThread.getByRole('button', { name: /Delete comment/ }).count()) === 0, "client cannot delete the owner's comment")
// Comment on issue #2
await click(v.getByText('Comments (0) on issue #2'))
await v.getByLabel('Add a comment on issue #2').fill('We would prefer plain language here. Can you suggest wording?')
await click(v.getByRole('button', { name: 'Post comment on issue #2' }))
await v.getByRole('list', { name: 'Comments on issue #2' }).getByText('We would prefer').waitFor()
expect(true, 'client can comment on an issue')
await v.getByLabel('Add a comment on issue #2').fill('Typo, ignore this')
await click(v.getByRole('button', { name: 'Post comment on issue #2' }))
await v.getByText('Typo, ignore this').waitFor()
await click(v.getByRole('button', { name: 'Delete comment by you' }).last())
await click(v.getByRole('dialog', { name: 'Delete comment?' }).getByRole('button', { name: 'Delete comment' }))
await v.getByText('Typo, ignore this').waitFor({ state: 'detached' })
expect(true, 'client can delete their own comment after confirming')
await click(v.getByLabel('Add a comment on this page'))
await v.getByLabel('Add a comment on this page').fill('Looks good to us.')
await click(v.getByRole('button', { name: 'Post comment on this page' }))
await pageThread.getByText('Looks good to us.').waitFor()
expect(true, 'client can comment on a page')
await v.getByRole('list', { name: 'Comments on issue #2' }).scrollIntoViewIfNeeded()
await axe(v, 'page with comments (client)')
await dark(v, 'page with comments (client)')
await shot(v, 'client-comments')
await sleep(400)
await vc.close()

// ─── Owner sees and deletes client comments ───
const { ctx: oc2, page: o2 } = await session(OWNER)
await o2.goto(`${BASE}/audit-hub#/projects/${project.id}/pages/${home.id}`)
await click(o2.getByText('Comments (1) on issue #2'))
const issueThread = o2.getByRole('list', { name: 'Comments on issue #2' })
await issueThread.getByText(VIEWER, { exact: true }).waitFor()
expect(true, "owner sees the client's comment with their email")
await click(issueThread.getByRole('button', { name: `Delete comment by ${VIEWER}` }))
await click(o2.getByRole('dialog', { name: 'Delete comment?' }).getByRole('button', { name: 'Delete comment' }))
await issueThread.waitFor({ state: 'detached' })
expect(true, "owner can delete a client's comment")
await sleep(400)
await oc2.close()
await browser.close()

await admin.from('projects').delete().eq('id', project.id)
console.log(`\naxe total violations: ${violations}; failures: ${failures}`)
process.exit(failures || violations ? 1 : 0)
