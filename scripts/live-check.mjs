import { _electron as electron } from 'playwright'
import executablePath from 'electron'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const profile = await mkdtemp(join(tmpdir(), 'apply-pilot-live-'))
const env = { ...process.env, APPLY_PILOT_DATA_DIR: profile }
delete env.ELECTRON_RUN_AS_NODE
delete env.ELECTRON_RENDERER_URL
let app
let child
const bounded = (operation, milliseconds, fallback) => {
  let timer
  return Promise.race([operation, new Promise(resolve => { timer = setTimeout(() => resolve(fallback), milliseconds) })]).finally(() => clearTimeout(timer))
}
try {
  app = await electron.launch({ executablePath, args: ['.'], cwd: process.cwd(), env })
  child = app.process()
  const page = await app.firstWindow()
  await page.getByRole('heading', { name: 'Boss 直聘工作台' }).waitFor()
  console.log('Opening the real Boss official login page with a temporary profile...')
  const remoteReady = app.context().waitForEvent('page', { predicate: value => value !== page, timeout: 15_000 })
  await page.getByRole('button', { name: '打开 Boss 直聘', exact: true }).click()
  const remote = await remoteReady
  await remote.waitForURL('https://www.zhipin.com/**', { waitUntil: 'domcontentloaded', timeout: 35_000 })
  await page.waitForFunction(async () => {
    const state = await window.desktop.command({ type: 'snapshot' })
    return state.browser.opened && !state.browser.loading
  }, undefined, { timeout: 40_000 })
  await remote.waitForFunction(() => /扫码|验证码|微信登录|手机号/.test(document.body.innerText) || /security\.html|captcha|verify/.test(location.pathname), undefined, { timeout: 15_000 }).catch(() => {})
  const diagnostics = await bounded(remote.evaluate(() => ({
    title: document.title,
    loginUi: /扫码|验证码|微信登录|手机号/.test(document.body.innerText),
    verificationPage: /security\.html|captcha|verify/.test(location.pathname),
    localBridge: typeof window.desktop, nodeAccess: typeof require,
    viewport: { width: innerWidth, height: innerHeight },
  })).catch(() => null), 5000, null)
  await bounded(page.evaluate(() => window.desktop.command({ type: 'check-auth' })).catch(() => {}), 10_000, null)
  await mkdir(resolve('.test-artifacts'), { recursive: true })
  await page.screenshot({ path: resolve('.test-artifacts/live-workspace.png') })
  await remote.screenshot({ path: resolve('.test-artifacts/live-login.png'), timeout: 5000 }).catch(() => {})
  const latest = await page.evaluate(() => window.desktop.command({ type: 'snapshot' }))
  console.log(JSON.stringify({ auth: latest.auth, browser: latest.browser, diagnostics }, null, 2))
  assert.equal(diagnostics?.localBridge, 'undefined')
  assert.equal(diagnostics?.nodeAccess, 'undefined')
  if (latest.auth === 'verification' || diagnostics?.verificationPage) {
    console.log('Boss requires manual security verification. Real account login and real job collection remain unverified.')
    process.exitCode = 2
  } else {
    assert.ok(diagnostics?.loginUi, 'The official Boss login form has not appeared')
    console.log('Real Boss login UI is visible. Scanning a real account and checking its next-launch login state remain manual acceptance steps.')
  }
} finally {
  if (app) await bounded(app.close().catch(() => {}), 10_000, null).finally(() => { if (child.exitCode === null) child.kill('SIGTERM') })
  await rm(profile, { recursive: true, force: true })
}
