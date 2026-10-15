import { _electron as electron } from 'playwright'
import executablePath from 'electron'
import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'

const directory = await mkdtemp(join(tmpdir(), 'apply-pilot-dom-'))
let app
try {
  const modulePath = join(directory, 'actions.cjs')
  await build({ entryPoints: ['electron/platforms/boss-application.ts'], outfile: modulePath, bundle: true, platform: 'node', format: 'cjs', target: 'node22' })
  const { bossApplicationAction } = createRequire(import.meta.url)(modulePath)
  const env = { ...process.env, APPLY_PILOT_DATA_DIR: join(directory, 'profile') }
  delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
  app = await electron.launch({ executablePath, args: ['.'], env })
  const page = await app.firstWindow()
  // Delivery receipts are not shown on every BOSS message. A new own message with no
  // pending/error marker must not wait forever for an optional receipt label.
  await page.setContent('<main class="chat-conversation"><h2>前端开发</h2><h3>示例公司</h3><div class="chat-message"><ul class="im-list"><li class="message-item item-myself"><div class="message-content">已确认的测试消息</div></li></ul></div><textarea id="chat-input"></textarea></main>')
  const result = await page.evaluate(({ source }) => {
    const action = (0, eval)('(' + source + ')')
    return action('state', { id: 'fixture', title: '前端开发', company: '示例公司' }, '已确认的测试消息')
  }, { source: bossApplicationAction.toString() })
  assert.equal(result.messageSent, true, 'A confirmed own message without an optional delivery receipt currently becomes 结果待核实：BOSS 页面响应超时')
  const inspect = baseline => page.evaluate(({ source, baseline }) => {
    const action = (0, eval)('(' + source + ')')
    return action('state', { id: 'fixture', title: '前端开发', company: '示例公司有限公司' }, '已确认的测试消息', baseline)
  }, { source: bossApplicationAction.toString(), baseline })
  assert.equal((await inspect({ messageCount: 1, resumeCount: 0 })).messageSent, false, 'Historical identical messages are not a new send')
  assert.equal((await inspect({ messageCount: 0, resumeCount: 0 })).conversation, true, 'A legal company suffix does not break an otherwise verified conversation')
  await page.locator('.message-item').evaluate(e => e.insertAdjacentHTML('beforeend', '<span class="status-sending"></span>'))
  assert.equal((await inspect({ messageCount: 0, resumeCount: 0 })).messageSent, false)
  await page.locator('.status-sending').evaluate(e => e.className = 'send-fail')
  assert.equal((await inspect({ messageCount: 0, resumeCount: 0 })).messageSent, false)
  await page.locator('h3').evaluate(e => e.textContent = '另一家公司')
  assert.equal((await inspect({ messageCount: 0, resumeCount: 0 })).conversation, false, 'Never send into a different company conversation')
  console.log('BOSS timeout regression passed: own-message confirmation does not depend on optional receipt labels.')
} finally {
  await app?.close().catch(() => {})
  await rm(directory, { recursive: true, force: true })
}
