import { test } from 'node:test'
import assert from 'node:assert/strict'
import { waitForBossLogin } from '../electron/platforms/boss-auth.ts'
import type { AuthStatus } from '../shared/contracts.ts'

test('task authentication waits for hydrated account state rather than rejecting unknown', async () => {
  const states: AuthStatus[] = ['unknown', 'checking', 'signed-in']
  const page = await waitForBossLogin(async () => ({ auth: states.shift()!, account: '', jobs: [] }), new AbortController().signal)
  assert.equal(page.auth, 'signed-in')
})

test('unconfirmed authentication times out without falsely reporting an expired session', async () => {
  await assert.rejects(waitForBossLogin(async () => ({ auth: 'unknown', account: '', jobs: [] }), new AbortController().signal, 10), /尚未确认 BOSS 登录状态/)
})

test('verification is reported explicitly before a delivery task can start', async () => {
  await assert.rejects(waitForBossLogin(async () => ({ auth: 'verification', account: '', jobs: [] }), new AbortController().signal), /安全验证/)
})

test('stop cancels login polling promptly, including an already cancelled start', async () => {
  const controller = new AbortController()
  const polling = waitForBossLogin(async () => ({ auth: 'unknown', account: '', jobs: [] }), controller.signal)
  controller.abort()
  await assert.rejects(polling, { name: 'AbortError' })
  await assert.rejects(waitForBossLogin(async () => { throw new Error('Must not inspect after stop') }, controller.signal), { name: 'AbortError' })
})
