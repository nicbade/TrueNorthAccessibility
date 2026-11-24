// End-to-end check that email link scanners cannot use up a sign-in link (see src/audit/auth.ts).
// Needs a local stack (`supabase start`), the app built against it and served on HUB_URL, e.g.
//   VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=<publishable key> pnpm build
//   mkdir -p dist/audit-hub && cp dist/index.html dist/audit-hub/ && pnpm preview --port 4173
// and Playwright: `npm i --no-save playwright @axe-core/playwright && npx playwright install chromium`.
// Run: SUPABASE_SERVICE_ROLE_KEY=... node supabase/tests/sign-in-link-scanner.e2e.mjs
// (Sign-ups are invite-only, so the test creates each account with the admin API first.)
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'

const BASE = process.env.HUB_URL ?? 'http://127.0.0.1:4173'
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324'
const SCREENSHOT = process.env.SCREENSHOT_PATH
const API = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SERVICE_KEY) throw new Error('Set SUPABASE_SERVICE_ROLE_KEY')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
let violations = 0
const expect = (cond, msg) => {
  console.log(cond ? 'PASS' : 'FAIL', msg)
  if (!cond) failures++
}
async function axe(page, label) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  console.log(`axe [${label}]: ${r.violations.length} violations`)
  for (const v of r.violations) console.log('  -', v.id, v.nodes.map((n) => n.target.join(' ')).join(' | '))
  violations += r.violations.length
}
async function mail(email) {
  for (let i = 0; i < 40; i++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent('to:' + email)}`)).json()
    if (list.messages?.length) {
      const msg = await (await fetch(`${MAILPIT}/api/v1/message/${list.messages[0].ID}`)).json()
      const html = msg.HTML || msg.Text
      const link = html.match(/https?:\/\/[^"'\s<>]+\/audit-hub\?token_hash=[^"'\s<>]+/)
      const code = html.match(/<strong[^>]*>(\d{6,10})<\/strong>/)
      if (link) return { link: link[0].replace(/&amp;/g, '&'), code: code?.[1] }
    }
    await sleep(300)
  }
  throw new Error('no email for ' + email)
}
const browser = await chromium.launch()
const size = { width: 1280, height: 800 }
async function requestLink(email) {
  const res = await fetch(`${API}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, email_confirm: true }),
  })
  if (!res.ok) throw new Error(`could not create ${email}: ${res.status}`)
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' })
  const ctx = await browser.newContext({ viewport: size })
  const page = await ctx.newPage()
  await page.goto(BASE + '/audit-hub')
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click()
  await page.getByRole('heading', { name: 'Check your email' }).waitFor()
  return { page, ...(await mail(email)) }
}
async function scan(link) {
  const ctx = await browser.newContext()
  const p = await ctx.newPage()
  await p.goto(link)
  await sleep(8000) // the scanner in the logs ran the page's JS for 5-10 s
  const finishing = await p.getByRole('heading', { name: 'Finish signing in' }).count()
  const signedIn = await p.getByRole('button', { name: 'Sign out' }).count()
  const kept = p.url().includes('token_hash=')
  await ctx.close()
  return { finishing, signedIn, kept }
}
const signedIn = (p) => p.getByRole('button', { name: 'Sign out' }).waitFor({ timeout: 10000 }).then(() => true, () => false)

// 1. Scanner opens the link first; the person then opens it and presses Continue
{
  const email = `link-${Date.now()}@corp.test`
  const { link } = await requestLink(email)
  const s = await scan(link)
  expect(s.finishing === 1 && s.signedIn === 0, 'scanner that only loads the page does not sign in')
  expect(s.kept, 'token_hash stays in the URL until Continue is pressed')
  const ctx = await browser.newContext({ viewport: size })
  const p = await ctx.newPage()
  await p.goto(link)
  const btn = p.getByRole('button', { name: 'Continue signing in' })
  await btn.waitFor()
  expect(await btn.evaluate((el) => el === document.activeElement), 'Continue signing in has focus')
  await axe(p, 'finish signing in light')
  if (SCREENSHOT) await p.screenshot({ path: SCREENSHOT })
  await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await sleep(600)
  await axe(p, 'finish signing in dark')
  await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  await btn.click()
  expect(await signedIn(p), 'person signs in after the scanner opened the link')
  expect(!p.url().includes('token_hash'), 'token_hash removed from the URL after sign-in')
  // Reusing the link shows the expired message
  const p2 = await (await browser.newContext({ viewport: size })).newPage()
  await p2.goto(link)
  await p2.getByRole('button', { name: 'Continue signing in' }).click()
  await p2.getByRole('alert').filter({ hasText: 'expired or was already used' }).waitFor()
  expect(true, 'a used link shows the expired message after Continue')
  await axe(p2, 'used link')
}

// 2. Scanner opens the link; the person types the 6-digit code in the original tab instead
{
  await sleep(1000)
  const email = `code-${Date.now()}@corp.test`
  const { page, link, code } = await requestLink(email)
  expect(/^\d{6}$/.test(code ?? ''), `email contains a 6-digit code (${code})`)
  await scan(link)
  await page.getByLabel('Code from the email').fill('000000')
  await page.getByRole('button', { name: 'Sign in with code' }).click()
  await page.getByRole('alert').filter({ hasText: 'incorrect or has expired' }).waitFor()
  expect(true, 'a wrong code shows an error')
  await axe(page, 'check email with code error')
  await page.getByLabel('Code from the email').fill(code)
  await page.getByRole('button', { name: 'Sign in with code' }).click()
  expect(await signedIn(page), 'person signs in with the code after the scanner opened the link')
}

// 3. Cancel on the Finish screen returns to the normal sign-in form without using the token
{
  await sleep(1000)
  const email = `cancel-${Date.now()}@corp.test`
  const { link } = await requestLink(email)
  const p = await (await browser.newContext({ viewport: size })).newPage()
  await p.goto(link)
  await p.getByRole('button', { name: 'Cancel' }).click()
  await p.getByRole('heading', { level: 1, name: 'Sign in to Audit Hub' }).waitFor()
  expect(!p.url().includes('token_hash'), 'Cancel clears the link from the URL')
  await p.goto(link)
  await p.getByRole('button', { name: 'Continue signing in' }).click()
  expect(await signedIn(p), 'link still works after Cancel')
}

await browser.close()
console.log(`\naxe total violations: ${violations}; failures: ${failures}`)
process.exit(failures || violations ? 1 : 0)
