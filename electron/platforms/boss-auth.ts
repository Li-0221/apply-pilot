import { setTimeout as delay } from 'node:timers/promises'
import type { PageInspection } from './types'

// BOSS hydrates the account header after the document load event. A missing
// header, or its brief login placeholder, is not evidence of an expired session.
export async function waitForBossLogin(inspect: () => Promise<PageInspection>, signal: AbortSignal, timeoutMs = 15_000): Promise<PageInspection> {
  const deadline = performance.now() + timeoutMs
  let signedOutSince: number | null = null
  while (true) {
    signal.throwIfAborted()
    const page = await inspect()
    signal.throwIfAborted()
    if (page.auth === 'signed-in') return page
    if (page.auth === 'verification') throw new Error('请先在 BOSS 页面完成安全验证')
    if (page.auth === 'signed-out') {
      signedOutSince ??= performance.now()
      if (performance.now() - signedOutSince >= 1000) throw new Error('BOSS 登录已失效，请重新登录')
    } else signedOutSince = null
    const remaining = deadline - performance.now()
    if (remaining <= 0) throw new Error('尚未确认 BOSS 登录状态，请稍后重试')
    await delay(Math.min(250, remaining), undefined, { signal })
  }
}
