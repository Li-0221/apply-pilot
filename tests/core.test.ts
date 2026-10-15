import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { parseBounds, parseCommand, isBossUrl } from '../electron/security.ts'
import { LocalStore } from '../electron/store.ts'
import { TaskRunner, type TaskHost } from '../electron/task-runner.ts'
import type { Snapshot, Job } from '../shared/contracts.ts'

const job: Job = { id: 'one', platform: 'boss', title: '前端开发', company: '测试公司', salary: '20-30K', location: '上海', tags: [], url: 'https://www.zhipin.com/job_detail/one.html', collectedAt: new Date().toISOString() }
test('navigation and IPC reject foreign URLs, malformed commands and invalid geometry', () => {
  assert.equal(isBossUrl('https://www.zhipin.com/web/geek/jobs'), true)
  for (const url of ['https://zhipin.com.evil.test', 'javascript:alert(1)', 'http://www.zhipin.com', 'https://user:pass@www.zhipin.com', 'https://www.zhipin.com:3000']) assert.equal(isBossUrl(url), false)
  for (const input of [null, {}, { type: 'execute' }, { type: 'open', platform: 'liepin' }, { type: 'open-job', url: 'https://evil.test/job_detail/one.html' }, { type: 'collect', keyword: 'a'.repeat(81) }]) assert.throws(() => parseCommand(input))
  assert.deepEqual(parseCommand({ type: 'collect', keyword: ' 前端 ' }), { type: 'collect', keyword: '前端' })
  assert.throws(() => parseBounds({ x: NaN, y: 0, width: 100, height: 100, visible: true }))
  assert.equal(parseBounds({ x: 2.5, y: 0, width: -1, height: 20, visible: true }).width, 0)
})

test('local results survive restart and deduplicate by platform and job ID', () => {
  const directory = mkdtempSync(join(tmpdir(), 'apply-pilot-store-'))
  try {
    const store = new LocalStore(directory)
    store.value.keyword = '前端'
    store.merge([job, { ...job, salary: '25-35K' }, { ...job, platform: 'future-platform' }])
    const restored = new LocalStore(directory)
    assert.equal(restored.value.keyword, '前端')
    assert.equal(restored.value.jobs.length, 2)
    assert.equal(restored.value.jobs[0].salary, '25-35K')
    if (process.platform !== 'win32') assert.equal(statSync(join(directory, 'workspace.json')).mode & 0o777, 0o600)
    writeFileSync(join(directory, 'workspace.json'), 'invalid-json')
    assert.throws(() => new LocalStore(directory), /数据损坏/)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

function createHost(overrides: Partial<TaskHost> = {}) {
  const updates: Snapshot['task'][] = []
  const saved: Job[][] = []
  const host: TaskHost = {
    inspect: async () => ({ auth: 'signed-in', account: 'fixture', jobs: [job] }),
    scroll: async () => {}, save: jobs => { saved.push(jobs) }, log: () => {},
    update: task => { updates.push(task) }, ...overrides,
  }
  return { host, updates, saved }
}
async function finish(runner: TaskRunner) {
  for (let i = 0; i < 100 && runner.running; i++) await delay(2)
  assert.equal(runner.running, false)
}
test('collection completes with unique counts across repeated page snapshots', async () => {
  const { host, updates, saved } = createHost()
  const runner = new TaskRunner(host, 1)
  runner.start()
  assert.throws(() => runner.start(), /正在运行/)
  await finish(runner)
  assert.equal(updates.at(-1)?.status, 'completed')
  assert.equal(updates.at(-1)?.collected, 1)
  assert.equal(saved.length, 4)
})
test('stopping an in-flight read cannot save late results or report success', async () => {
  let resolve!: (result: Awaited<ReturnType<TaskHost['inspect']>>) => void
  const { host, updates, saved } = createHost({ inspect: () => new Promise(done => { resolve = done }) })
  const runner = new TaskRunner(host, 1)
  runner.start()
  await delay(0)
  runner.stop()
  assert.throws(() => runner.start(), /正在运行/)
  resolve({ auth: 'signed-in', account: 'fixture', jobs: [job] })
  await finish(runner)
  assert.equal(saved.length, 0)
  assert.equal(updates.at(-1)?.status, 'stopped')
})
test('stopping during navigation prevents subsequent collection', async () => {
  let prepared!: () => void
  const { host, updates, saved } = createHost()
  const runner = new TaskRunner(host, 1)
  runner.start(() => new Promise(resolve => { prepared = resolve }))
  runner.stop()
  prepared()
  await finish(runner)
  assert.equal(saved.length, 0)
  assert.equal(updates.at(-1)?.status, 'stopped')
})
test('expired login, verification and empty lists fail explicitly', async () => {
  for (const auth of ['signed-out', 'verification', 'signed-in'] as const) {
    const { host, updates } = createHost({ inspect: async () => ({ auth, account: '', jobs: [] }) })
    const runner = new TaskRunner(host, 1)
    runner.start()
    await finish(runner)
    assert.equal(updates.at(-1)?.status, 'failed')
  }
})
