import { _electron as electron } from 'playwright'
import executablePath from 'electron'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const profile = await mkdtemp(join(tmpdir(), 'apply-pilot-electron-'))
const artifacts = resolve('.test-artifacts')
await mkdir(artifacts, { recursive: true })
const env = { ...process.env, APPLY_PILOT_DATA_DIR: profile }
delete env.ELECTRON_RUN_AS_NODE
delete env.ELECTRON_RENDERER_URL
let instance
const fixture = `<!doctype html><html><head><meta charset="utf-8"><style>body{font:16px sans-serif;padding:30px;color:#234}button{padding:12px}.job-card-wrapper{border-bottom:1px solid #ddd;padding:20px}.nav-figure{padding:12px}</style></head><body><button class="header-login-btn" id="login">测试夹具：登录</button><script>
const render=()=>{if(!localStorage.getItem('fixture-session'))return;document.body.innerHTML='<div class="nav-figure">夹具账号（非真实登录）</div>'+[1,2].map(i=>'<div class="job-card-wrapper"><div class="job-card-box"><a href="https://www.zhipin.com/job_detail/fixture'+i+'.html"><span class="job-name">测试岗位 '+i+'</span></a><span class="company-name">测试公司</span><span class="salary">20-30K</span><span class="job-area">上海</span><ul class="tag-list"><li>React</li></ul></div></div>').join('')};document.getElementById('login').onclick=()=>{document.cookie='mvp_fixture_session=persist-check; Secure; SameSite=Lax; Path=/';localStorage.setItem('fixture-session','yes');render()};render();</script></body></html>`

async function launch() {
  const app = await electron.launch({ executablePath, args: ['.'], cwd: process.cwd(), env, timeout: 30_000 })
  const page = await app.firstWindow()
  await page.getByRole('heading', { name: 'Boss 直聘工作台' }).waitFor()
  await app.context().route('https://www.zhipin.com/**', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fixture }))
  return { app, page }
}
async function snapshot(page) { return page.evaluate(() => window.desktop.command({ type: 'snapshot' })) }
async function waitFor(page, predicate) {
  for (let i = 0; i < 100; i++) { const state = await snapshot(page); if (predicate(state)) return state; await new Promise(resolve => setTimeout(resolve, 100)) }
  throw new Error('Timed out waiting for desktop state')
}

try {
  instance = await launch()
  const { app, page } = instance
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.screenshot({ path: join(artifacts, 'workspace.png') })
  await page.getByRole('button', { name: '打开 Boss 直聘', exact: true }).click()
  await waitFor(page, state => state.browser.opened && !state.browser.loading)
  const remote = app.context().pages().find(value => value !== page && value.url().startsWith('https://www.zhipin.com'))
  assert.ok(remote, 'Embedded browser page exists')
  assert.equal(await remote.evaluate(() => typeof window.desktop), 'undefined')
  assert.equal(await remote.evaluate(() => typeof require), 'undefined')
  assert.equal((await snapshot(page)).auth, 'signed-out')
  await remote.waitForFunction(() => innerWidth >= 1140, undefined, { timeout: 3000 })
  assert.ok(await remote.evaluate(() => innerWidth >= 1140), 'Boss desktop controls fit the embedded viewport')
  await page.getByRole('button', { name: '收起浏览器', exact: true }).click()
  await remote.getByRole('button', { name: '测试夹具：登录' }).click()
  await page.getByRole('button', { name: '检查登录', exact: true }).click()
  await waitFor(page, state => state.auth === 'signed-in')
  await page.getByRole('button', { name: '保存会话', exact: true }).click()
  await waitFor(page, state => Boolean(state.savedAt))
  assert.ok((await readFile(join(profile, 'boss-session.enc'))).length > 0)
  assert.equal((await readFile(join(profile, 'boss-session.enc'))).includes(Buffer.from('persist-check')), false)
  await page.getByRole('button', { name: '开始采集', exact: true }).click()
  await page.getByRole('button', { name: '停止采集', exact: true }).click()
  await waitFor(page, state => state.task.status === 'stopped')
  // Wait for the cancelled task to release its in-flight lock before restarting.
  await new Promise(resolve => setTimeout(resolve, 300))
  await page.getByRole('button', { name: '开始采集', exact: true }).click()
  const collected = await waitFor(page, state => state.task.status === 'completed')
  assert.equal(collected.jobs.length, 2)
  assert.equal(collected.task.collected, 2)
  await page.getByRole('button', { name: '岗位列表', exact: true }).click()
  await page.getByText('测试岗位 1', { exact: true }).waitFor()
  await page.screenshot({ path: join(artifacts, 'jobs-fixture.png') })
  await page.getByRole('textbox', { name: '筛选已保存岗位' }).fill('不存在的岗位')
  await page.getByText('没有匹配的岗位', { exact: true }).waitFor()
  await page.getByRole('button', { name: '清空筛选', exact: true }).click()
  assert.equal(await page.getByText('测试岗位 1', { exact: true }).count(), 1)
  await assert.rejects(page.evaluate(() => window.desktop.command({ type: 'open-job', url: 'https://evil.example/job_detail/one.html' })))
  await remote.goto('https://www.zhipin.com/web/passport/zp/security.html')
  const verification = await page.evaluate(() => window.desktop.command({ type: 'check-auth' }))
  assert.equal(verification.auth, 'verification', 'Boss security redirect is distinguished from logged-out or unknown state')
  await remote.evaluate(() => { location.href = 'https://example.com' })
  await new Promise(resolve => setTimeout(resolve, 200))
  assert.ok(remote.url().startsWith('https://www.zhipin.com'))
  // A website can close its own WebContentsView. The host must recover instead of staying blank.
  await remote.close()
  await waitFor(page, state => !state.browser.opened && !state.browser.loading)
  await page.getByRole('button', { name: '工作台', exact: true }).click()
  await page.getByRole('button', { name: '打开 Boss 直聘', exact: true }).click()
  await waitFor(page, state => state.browser.opened && state.auth === 'signed-in')
  // A renderer reload receives a fresh state snapshot and reuses the same browser session.
  await page.reload()
  await page.getByRole('heading', { name: 'Boss 直聘工作台' }).waitFor()
  assert.equal((await snapshot(page)).jobs.length, 2)
  assert.deepEqual(errors, [])
  await app.close()
  instance = await launch()
  const restored = await snapshot(instance.page)
  assert.equal(restored.jobs.length, 2)
  assert.ok(restored.savedAt)
  const cookies = await instance.app.evaluate(async ({ session }) => {
    const values = await session.fromPartition('persist:get-jobs-boss-default').cookies.get({ name: 'mvp_fixture_session' })
    return values.map(cookie => ({ name: cookie.name, value: cookie.value, session: cookie.session }))
  })
  assert.equal(cookies[0]?.value, 'persist-check')
  assert.equal(cookies[0]?.session, true)
  await instance.page.getByRole('button', { name: '打开 Boss 直聘', exact: true }).click()
  await waitFor(instance.page, state => state.auth === 'signed-in')
  await instance.page.getByRole('button', { name: '本地设置', exact: true }).click()
  await instance.page.getByRole('button', { name: '退出登录并清除会话', exact: true }).click()
  await instance.page.getByRole('button', { name: '确认清除', exact: true }).click()
  await waitFor(instance.page, state => state.auth === 'signed-out' && !state.browser.opened)
  assert.equal((await snapshot(instance.page)).jobs.length, 2)
  await instance.app.close()
  instance = await launch()
  const remaining = await instance.app.evaluate(async ({ session }) => (await session.fromPartition('persist:get-jobs-boss-default').cookies.get({ name: 'mvp_fixture_session' })).length)
  assert.equal(remaining, 0)
  assert.equal((await snapshot(instance.page)).savedAt, null)
  console.log('Electron smoke passed: embedded isolation, auth detection, encrypted session, cancellation, collection, deduplication, filter, navigation guard, native page closure recovery, reload, restart persistence and logout. Fixture results do not establish real-site login compatibility.')
} finally {
  if (instance) {
    const process = instance.app.process()
    const watchdog = setTimeout(() => { if (process.exitCode === null) process.kill('SIGKILL') }, 5000)
    try { await instance.app.close().catch(() => {}) } finally { clearTimeout(watchdog) }
  }
  await rm(profile, { recursive: true, force: true })
}
