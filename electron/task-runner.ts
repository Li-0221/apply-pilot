import { setTimeout as delay } from 'node:timers/promises'
import type { Job, Snapshot } from '../shared/contracts'
import type { PageInspection } from './platforms/types'

export interface TaskHost {
  inspect(): Promise<PageInspection>
  scroll(): Promise<void>
  save(jobs: Job[]): void
  log(message: string, level?: 'info' | 'success' | 'error'): void
  update(task: Snapshot['task']): void
}

export class TaskRunner {
  private controller: AbortController | null = null
  constructor(private host: TaskHost, private interval = 1500) {}
  get running() { return this.controller !== null }

  start(prepare?: () => Promise<void>) {
    if (this.running) throw new Error('已有采集任务正在运行')
    const controller = new AbortController()
    this.controller = controller
    this.host.update({ status: 'running', collected: 0, message: '正在读取当前岗位列表' })
    void this.run(controller, prepare)
  }

  stop() {
    if (!this.controller) return
    this.controller.abort()
    this.host.update({ status: 'stopped', collected: this.collected, message: '任务已停止，已读取的岗位已保存' })
    this.host.log('采集任务已停止')
    // Keep the lock until the in-flight inspection finishes, preventing overlapping runs.
  }

  private collected = 0
  private async run(controller: AbortController, prepare?: () => Promise<void>) {
    this.collected = 0
    const seen = new Set<string>()
    try {
      await prepare?.()
      if (controller.signal.aborted) return
      for (let pass = 0; pass < 4; pass++) {
        if (controller.signal.aborted) return
        const result = await this.host.inspect()
        if (controller.signal.aborted) return
        if (result.auth === 'verification') throw new Error('页面需要安全验证，请在浏览器中手动完成后重试')
        if (result.auth !== 'signed-in') throw new Error('尚未确认登录，请先在 Boss 页面完成登录并检查状态')
        this.host.save(result.jobs)
        result.jobs.forEach(job => seen.add(job.id))
        this.collected = seen.size
        this.host.update({ status: 'running', collected: seen.size, message: `已读取 ${seen.size} 个岗位` })
        this.host.log(`第 ${pass + 1} 次读取：当前列表 ${result.jobs.length} 个岗位，本次累计 ${seen.size} 个`)
        if (pass < 3) {
          await this.host.scroll()
          await delay(this.interval, undefined, { signal: controller.signal })
        }
      }
      if (!seen.size) throw new Error('未读到岗位，请打开有岗位卡片的列表后重试；页面结构也可能已变化')
      this.host.update({ status: 'completed', collected: seen.size, message: `采集完成，共读取 ${seen.size} 个岗位` })
      this.host.log(`采集完成，${seen.size} 个岗位已保存在本机`, 'success')
    } catch (error) {
      if (controller.signal.aborted) return
      const message = error instanceof Error ? error.message : '采集失败'
      this.host.update({ status: 'failed', collected: seen.size, message })
      this.host.log(message, 'error')
    } finally {
      if (this.controller === controller) this.controller = null
    }
  }
}
