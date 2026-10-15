import { setTimeout as delay } from 'node:timers/promises'
import type { ApplicationOutcome, ApplicationSettings, Job, PendingApplication, TaskState } from '../shared/contracts'

export interface TaskHost {
  candidates(settings: ApplicationSettings, signal: AbortSignal): Promise<Job[]>
  apply(job: Job, settings: ApplicationSettings, signal: AbortSignal, beforeContact: () => void): Promise<ApplicationOutcome>
  hasApplication(job: Job): boolean
  record(record: PendingApplication): void
  log(message: string, level?: 'info' | 'success' | 'error'): void
  update(task: TaskState): void
}
export class TaskRunner {
  private controller: AbortController | null = null
  private task: TaskState = { status: 'idle', attempted: 0, sent: 0, skipped: 0, failed: 0, message: '等待开始' }
  constructor(private host: TaskHost) {}
  get running() { return this.controller !== null }
  private update(status: TaskState['status'], message: string) { this.task = { ...this.task, status, message }; this.host.update({ ...this.task }) }
  start(settings: ApplicationSettings) {
    if (this.running) throw new Error('已有投递任务正在运行')
    const controller = new AbortController()
    this.controller = controller
    this.task = { status: 'running', attempted: 0, sent: 0, skipped: 0, failed: 0, message: '' }
    this.update('running', '正在筛选岗位')
    void this.run(settings, controller)
  }
  stop() {
    if (!this.controller || this.controller.signal.aborted) return
    this.controller.abort()
    this.update('stopping', '正在停止，核实当前岗位结果')
  }
  private async run(settings: ApplicationSettings, controller: AbortController) {
    const { signal } = controller
    try {
      const jobs = await this.host.candidates(settings, signal)
      signal.throwIfAborted()
      const seen = new Set<string>()
      const exclusions = settings.excludedKeywords.split(/[,，\n;；]+/).map(word => word.trim().toLowerCase()).filter(Boolean)
      for (const job of jobs) {
        signal.throwIfAborted()
        const key = `${job.platform}:${job.id}`
        if (seen.has(key)) continue
        seen.add(key)
        const text = `${job.title} ${job.company} ${job.tags.join(' ')}`.toLowerCase()
        if (this.host.hasApplication(job) || (settings.city && !job.location.includes(settings.city)) || exclusions.some(word => text.includes(word))) {
          this.task.skipped++
          continue
        }
        if (this.task.attempted >= settings.limit) break
        const now = new Date().toISOString()
        let contactStarted = false
        const record: PendingApplication = { key, job, status: 'processing', resume: 'not-requested', detail: '正在核实岗位与沟通状态', retryable: true, startedAt: now, updatedAt: now }
        this.host.record(record)
        this.update('running', `正在投递：${job.title}`)
        let outcome: ApplicationOutcome
        try { outcome = await this.host.apply(job, settings, signal, () => {
          signal.throwIfAborted()
          // Persist the external-send intent before clicking; a crash must never cause a resend.
          contactStarted = true
          record.retryable = false
          this.host.record({ ...record, detail: '正在发起沟通', updatedAt: new Date().toISOString() })
        }) }
        catch (error) {
          outcome = contactStarted
            ? { status: 'uncertain', resume: 'uncertain', retryable: false, detail: signal.aborted ? '任务已停止，请在 BOSS 核实当前岗位；不会重复投递' : `结果待核实：${error instanceof Error ? error.message : '页面异常'}` }
            : { status: signal.aborted ? 'skipped' : 'failed', resume: 'not-requested', retryable: true, detail: signal.aborted ? '已停止，未发起沟通' : error instanceof Error ? error.message : '读取岗位失败，未发起沟通' }
        }
        this.host.record({ ...record, ...outcome, updatedAt: new Date().toISOString() })
        if (outcome.status === 'skipped') this.task.skipped++
        else {
          this.task.attempted++
          if (outcome.status === 'greeted' || outcome.status === 'resume-sent') this.task.sent++
          else this.task.failed++
        }
        this.host.log(`${job.company || job.title} · ${job.title}：${outcome.detail}`, outcome.status === 'uncertain' || outcome.status === 'failed' ? 'error' : outcome.status === 'skipped' ? 'info' : 'success')
        if (signal.aborted) break
        if (outcome.status === 'uncertain' || outcome.status === 'failed') throw new Error(outcome.detail)
        this.update('running', `已沟通 ${this.task.sent}，已跳过 ${this.task.skipped}`)
        if (outcome.status !== 'skipped' && this.task.attempted < settings.limit) await delay(settings.intervalSeconds * 1000, undefined, { signal })
      }
      this.update(signal.aborted ? 'stopped' : 'completed', signal.aborted ? '投递已停止' : `本次完成：已沟通 ${this.task.sent}，跳过 ${this.task.skipped}`)
    } catch (error) {
      this.update(signal.aborted ? 'stopped' : 'failed', signal.aborted ? '投递已停止' : error instanceof Error ? error.message : '投递失败')
      if (!signal.aborted) this.host.log(this.task.message, 'error')
    } finally { if (this.controller === controller) this.controller = null }
  }
}
