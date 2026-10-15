import { _electron as electron } from 'playwright'
import executablePath from 'electron'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const profile = await mkdtemp(join(tmpdir(), 'apply-pilot-auth-'))
const env = { ...process.env, APPLY_PILOT_DATA_DIR: profile }
delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
let app
let mode = 'signed-in'
const snapshot = page => page.evaluate(() => window.desktop.command({ type: 'snapshot' }))
async function waitFor(page, predicate) {
  const end = Date.now() + 20_000
  while (Date.now() < end) {
    const state = await snapshot(page)
    if (predicate(state)) return state
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error('Login regression timed out')
}
function fixture() {
  const delay = mode === 'delayed' || mode === 'placeholder' ? 750 : mode === 'slow' ? 10_000 : 0
  const content = mode === 'signed-out' ? '<div class="sign-form">扫码登录</div>' : mode === 'verification' ? '<div>请完成安全验证</div>' : '<a ka="header-username">测试账号</a><div class="job-empty">暂无相关职位</div>'
  const initial = mode === 'placeholder' ? '<button class="header-login-btn">登录</button>' : ''
  return `<!doctype html><html><meta charset="utf-8"><body><main>${initial}</main><script>const render=()=>document.querySelector('main').innerHTML=${JSON.stringify(content)};${delay ? `setTimeout(render,${delay})` : 'render()'}</script></body></html>`
}
try {
  app = await electron.launch({ executablePath, args: ['.'], env })
  const page = await app.firstWindow()
  await page.getByRole('heading', { name: 'Boss 直聘工作台' }).waitFor()
  await app.context().route('https://www.zhipin.com/**', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fixture() }))
  const state = await snapshot(page)
  await page.evaluate(settings => window.desktop.command({ type: 'save-ai', settings }), { ...state.ai, enabled: false })
  async function openSignedIn() {
    mode = 'signed-in'
    await page.evaluate(() => window.desktop.command({ type: 'open', platform: 'boss' }))
    await waitFor(page, s => s.auth === 'signed-in')
  }
  await openSignedIn()
  mode = 'delayed'
  await page.getByRole('button', { name: '开始投递', exact: true }).click()
  const result = await waitFor(page, s => ['completed', 'failed'].includes(s.task.status))
  assert.equal(result.task.status, 'completed', `An already signed-in account must survive delayed page hydration: ${result.task.message}`)
  console.log('Delayed login hydration passed.')

  await openSignedIn()
  mode = 'placeholder'
  await page.getByRole('button', { name: '开始投递', exact: true }).click()
  const placeholder = await waitFor(page, s => ['completed', 'failed'].includes(s.task.status))
  assert.equal(placeholder.task.status, 'completed', 'A temporary login placeholder is not an expired session')

  for (const [nextMode, message] of [['signed-out', /登录已失效/], ['verification', /安全验证/]]) {
    await openSignedIn()
    mode = nextMode
    const tasks = (await snapshot(page)).tasks.length
    await page.getByRole('button', { name: '开始投递', exact: true }).click()
    const blocked = await waitFor(page, s => s.task.status === 'failed')
    assert.match(blocked.task.message, message)
    assert.equal(blocked.tasks.length, tasks, 'No delivery task may start without confirmed login')
  }

  await openSignedIn()
  mode = 'slow'
  await page.getByRole('button', { name: '开始投递', exact: true }).click()
  await waitFor(page, s => s.task.message === '正在确认登录状态')
  const beforeStop = Date.now()
  await page.getByRole('button', { name: '停止投递', exact: true }).click()
  const stopped = await waitFor(page, s => s.task.status === 'stopped')
  assert.ok(Date.now() - beforeStop < 1500, 'Stop must cancel login polling promptly')
  assert.equal(stopped.history.length, 0)
  console.log('BOSS login regression passed: real Start button, delayed hydration, temporary login placeholder, expired session, verification and stop during login polling. No recruiter contacts.')
} finally {
  await app?.close().catch(() => {})
  await rm(profile, { recursive: true, force: true })
}
