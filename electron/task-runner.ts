import { setTimeout as delay } from 'node:timers/promises'
import { randomUUID } from 'node:crypto'
import { bossOptions } from '../shared/boss-options'
import { blacklistReason } from '../shared/blacklist'
import type { ApplicationOutcome, ApplicationSettings, BlacklistEntry, Job, PendingApplication, TaskCheckpoint, TaskState } from '../shared/contracts'

export interface TaskHost {
  candidates(settings: ApplicationSettings, signal: AbortSignal): Promise<Job[]> | AsyncIterable<Job>
  apply(job: Job, settings: ApplicationSettings, signal: AbortSignal, beforeContact: () => Promise<void>): Promise<ApplicationOutcome>
  blacklist?(): BlacklistEntry[]
  hasApplication(job: Job): boolean
  record(record: PendingApplication): void
  saveTask?(task: TaskCheckpoint): void
  log(message: string, level?: 'info' | 'success' | 'error'): void
  update(task: TaskState): void
}
const needsUser = (error: unknown) => /安全验证|登录已失效|需要处理|操作频繁|沟通.*上限|沟通.*限额/.test(error instanceof Error ? error.message : '')
export class TaskRunner {
  private controller: AbortController | null = null
  private task: TaskState = { status: 'idle', attempted: 0, sent: 0, skipped: 0, failed: 0, message: '等待开始' }
  private settings!: ApplicationSettings
  private visited = new Set<string>()
  private pauseMode: 'paused' | 'waiting-user' | null = null
  private pauseMessage = ''
  private wake: (() => void) | null = null
  constructor(private host: TaskHost) {}
  get running() { return this.controller !== null }
  get handover() { return this.task.status === 'paused' || this.task.status === 'waiting-user' }
  private update(status: TaskState['status'], message: string) {
    this.task = { ...this.task, status, message, updatedAt: new Date().toISOString() }
    if (this.task.id) this.host.saveTask?.({ id: this.task.id, settings: this.settings, state: { ...this.task }, visited: [...this.visited], startedAt: this.task.startedAt!, updatedAt: this.task.updatedAt! })
    this.host.update({ ...this.task })
  }
  start(settings: ApplicationSettings, recovery?: TaskCheckpoint) {
    if (this.running) throw new Error('已有投递任务正在运行')
    const controller = new AbortController()
    this.controller = controller
    this.settings = structuredClone(settings)
    this.visited = new Set(recovery?.visited || [])
    this.pauseMode = null
    this.task = recovery ? { ...recovery.state, status: 'running' } : { id: randomUUID(), startedAt: new Date().toISOString(), status: 'running', attempted: 0, sent: 0, skipped: 0, failed: 0, message: '' }
    this.update('running', recovery ? '正在恢复剩余岗位' : '正在筛选岗位')
    void this.run(this.settings, controller)
  }
  pause(manual = false, message = '') {
    if (!this.controller || this.controller.signal.aborted) return
    this.pauseMode = manual ? 'waiting-user' : 'paused'
    this.pauseMessage = message || (manual ? '等待人工处理，完成后继续' : '任务已暂停')
    if (this.handover) this.update(this.pauseMode, this.pauseMessage)
    else this.update('pausing', '正在暂停，核实当前岗位结果')
  }
  resume() {
    if (!this.controller || !this.pauseMode) throw new Error('当前没有可继续的任务')
    this.pauseMode = null
    this.update('running', '继续投递')
    this.wake?.(); this.wake = null
  }
  async checkpoint() {
    const signal = this.controller?.signal
    signal?.throwIfAborted()
    while (this.pauseMode) {
      this.update(this.pauseMode, this.pauseMessage)
      await new Promise<void>((resolve, reject) => {
        const abort = () => { this.wake = null; reject(signal?.reason) }
        this.wake = () => { signal?.removeEventListener('abort', abort); resolve() }
        signal?.addEventListener('abort', abort, { once: true })
      })
      signal?.throwIfAborted()
    }
  }
  stop() {
    if (!this.controller || this.controller.signal.aborted) return
    this.controller.abort()
    this.pauseMode = null
    this.wake?.(); this.wake = null
    this.update('stopping', '正在停止，核实当前岗位结果')
  }
  private excluded(job: Job, settings: ApplicationSettings) {
    if (this.host.hasApplication(job)) return '已联系或结果待核实，跳过重复投递'
    const blacklist = blacklistReason(job, this.host.blacklist?.() || [])
    if (blacklist) return blacklist
    const cities = settings.city.split(/[,，\n;；]+/).map(city => city.trim()).filter(Boolean).map(city => bossOptions.city.find(option => option.value === city)?.label || city)
    if (cities.length && !cities.some(city => city === '全国' || job.location.includes(city))) return '城市不符合'
    const text = `${job.title} ${job.company} ${job.tags.join(' ')}`.toLowerCase()
    if (settings.excludedKeywords.split(/[,，\n;；]+/).map(word => word.trim().toLowerCase()).filter(Boolean).some(word => text.includes(word))) return '命中排除词'
    return null
  }
  private async run(settings: ApplicationSettings, controller: AbortController) {
    const { signal } = controller
    try {
      let finished = false
      while (!finished && this.task.attempted < settings.limit) {
        try {
          await this.checkpoint()
          const jobs = await this.host.candidates(settings, signal)
          signal.throwIfAborted()
          const seen = new Set<string>()
          for await (const job of jobs) {
            await this.checkpoint()
            signal.throwIfAborted()
            const key = `${job.platform}:${job.id}`
            if (seen.has(key) || this.visited.has(key)) continue
            seen.add(key)
            if (this.excluded(job, settings)) { this.task.skipped++; this.visited.add(key); continue }
            if (this.task.attempted >= settings.limit) break
            const now = new Date().toISOString()
            let contactStarted = false
            const record: PendingApplication = { key, taskId: this.task.id, job, status: 'processing', resume: 'not-requested', detail: '正在核实岗位与沟通状态', retryable: true, startedAt: now, updatedAt: now }
            this.host.record(record)
            this.update('running', `正在投递：${job.title}`)
            let outcome!: ApplicationOutcome
            for (;;) {
              try {
                outcome = await this.host.apply(job, settings, signal, async () => {
                  await this.checkpoint()
                  signal.throwIfAborted()
                  contactStarted = true
                  record.retryable = false
                  this.host.record({ ...record, detail: '正在发起沟通', updatedAt: new Date().toISOString() })
                })
                break
              } catch (error) {
                if (!signal.aborted && !contactStarted && needsUser(error)) {
                  this.pause(true, error instanceof Error ? error.message : '请处理 BOSS 页面')
                  await this.checkpoint()
                  continue
                }
                outcome = contactStarted
                  ? { status: 'uncertain', resume: 'uncertain', retryable: false, detail: signal.aborted ? '任务已停止，请在 BOSS 核实当前岗位；不会重复投递' : `结果待核实：${error instanceof Error ? error.message : '页面异常'}` }
                  : { status: signal.aborted ? 'skipped' : 'failed', resume: 'not-requested', retryable: true, detail: signal.aborted ? '已停止，未发起沟通' : error instanceof Error ? error.message : '读取岗位失败，未发起沟通' }
                break
              }
            }
            this.host.record({ ...record, ...outcome, updatedAt: new Date().toISOString() })
            if (outcome.status === 'skipped') this.task.skipped++
            else { if (contactStarted || outcome.status === 'greeted' || outcome.status === 'resume-sent') this.task.attempted++; if (outcome.status === 'greeted' || outcome.status === 'resume-sent') this.task.sent++; else this.task.failed++ }
            if (!(outcome.status === 'failed' && outcome.retryable)) this.visited.add(key)
            this.host.log(`${job.company || job.title} · ${job.title}：${outcome.detail}`, outcome.status === 'uncertain' || outcome.status === 'failed' ? 'error' : outcome.status === 'skipped' ? 'info' : 'success')
            // Persist counters and cursor before any wait or transition.
            this.update(this.pauseMode ? 'pausing' : 'running', `已沟通 ${this.task.sent}，已跳过 ${this.task.skipped}`)
            if (signal.aborted) break
            if (outcome.status === 'uncertain' || outcome.status === 'failed') throw new Error(outcome.detail)
            await this.checkpoint()
            if (this.task.attempted >= settings.limit) break
            if (outcome.status !== 'skipped') {
              // Check pause requests during the interval, without cancelling send confirmation.
              for (let elapsed = 0; elapsed < settings.intervalSeconds * 1000; elapsed += 250) { await this.checkpoint(); await delay(250, undefined, { signal }) }
            }
          }
          finished = true
        } catch (error) {
          if (!signal.aborted && needsUser(error)) { this.pause(true, error instanceof Error ? error.message : '请处理 BOSS 页面'); await this.checkpoint() }
          else throw error
        }
      }
      this.update(signal.aborted ? 'stopped' : 'completed', signal.aborted ? '投递已停止' : `本次完成：已沟通 ${this.task.sent}，跳过 ${this.task.skipped}`)
    } catch (error) {
      this.update(signal.aborted ? 'stopped' : 'failed', signal.aborted ? '投递已停止' : error instanceof Error ? error.message : '投递失败')
      if (!signal.aborted) this.host.log(this.task.message, 'error')
    } finally { if (this.controller === controller) this.controller = null }
  }
}
