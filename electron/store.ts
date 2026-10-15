import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { defaultAiSettings, defaultSettings, type AiSettings, type BlacklistEntry, type ApplicationSettings, type Job, type TaskRecord, type PendingApplication } from '../shared/contracts'
import { parseAiSettings, parseSettings } from './security'

interface SavedState { version: 5; history: PendingApplication[]; tasks: TaskRecord[]; blacklist: BlacklistEntry[]; settings: ApplicationSettings; ai: AiSettings; applications: PendingApplication[]; savedAt: string | null; jobs: Job[] }
export class LocalStore {
  private readonly file: string
  value: SavedState = { version: 5, history: [], tasks: [], blacklist: [], settings: { ...defaultSettings }, ai: { ...defaultAiSettings }, applications: [], savedAt: null, jobs: [] }
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    this.file = join(directory, 'workspace.json')
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf8'))
      if (data.version === 1 && typeof data.keyword === 'string' && Array.isArray(data.jobs)) {
        this.value = { ...this.value, settings: { ...defaultSettings, keyword: data.keyword }, jobs: data.jobs, savedAt: data.savedAt ?? null }
      } else if ([2, 3, 4, 5].includes(data.version) && Array.isArray(data.applications) && Array.isArray(data.jobs)) {
        this.value = { version: 5, history: Array.isArray(data.history) ? data.history : data.applications.map((record: PendingApplication) => ({ ...record, attemptId: record.attemptId || `legacy:${record.key}:${record.startedAt}` })), tasks: Array.isArray(data.tasks) ? data.tasks : [], blacklist: Array.isArray(data.blacklist) ? data.blacklist : [], settings: parseSettings(data.settings), ai: data.ai ? parseAiSettings(data.ai) : { ...defaultAiSettings }, applications: data.applications, jobs: data.jobs, savedAt: data.savedAt ?? null }
      } else throw new Error('不支持的本地数据格式')
      for (const task of this.value.tasks) {
        if (['running', 'pausing', 'paused', 'waiting-user', 'recoverable', 'stopping'].includes(task.state.status)) task.state = { ...task.state, status: 'stopped', message: '上次任务已中断' }
      }
      for (const record of this.value.history) {
        if (record.status === 'processing') {
          record.status = record.retryable === true ? 'failed' : 'uncertain'
          record.detail = record.retryable === true ? '上次任务在发起沟通前中断，可重新筛选' : '上次任务中断，请在 BOSS 核实；不会自动重复投递'
          record.updatedAt = new Date().toISOString()
        }
      }
      // The journal is authoritative; summaries are for the latest job view only.
      for (const record of this.value.history) {
        const index = this.value.applications.findIndex(value => value.key === record.key)
        if (index < 0) this.value.applications.push(record)
        else if (record.skipCategory !== 'duplicate' && record.updatedAt >= this.value.applications[index].updatedAt) this.value.applications[index] = record
      }
      for (const task of this.value.tasks) {
        // Reconcile a crash between journaling an outcome and saving task counters.
        const records = this.value.history.filter(record => record.taskId === task.id)
        const contacted = records.filter(record => record.contactStarted || record.retryable === false && !record.skipCategory && record.status !== 'skipped')
        task.state.attempted = Math.max(task.state.attempted, contacted.length)
        task.state.failed = Math.max(task.state.failed, records.filter(record => ['failed', 'uncertain'].includes(record.status)).length)
        task.state.skipped = Math.max(task.state.skipped, records.filter(record => record.status === 'skipped').length)
        task.state.sent = Math.max(task.state.sent, records.filter(record => ['greeted', 'resume-sent'].includes(record.status)).length)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('本地工作台数据损坏，请先备份 workspace.json 再重试', { cause: error })
    }
  }
  save() {
    const temporary = `${this.file}.tmp`
    writeFileSync(temporary, JSON.stringify(this.value), { mode: 0o600 })
    renameSync(temporary, this.file)
  }
  saveTask(task: TaskRecord) {
    const index = this.value.tasks.findIndex(value => value.id === task.id)
    if (index < 0) this.value.tasks.push(task)
    else this.value.tasks[index] = task
    this.save()
  }
  hasApplication(job: Job) { return this.value.history.some(record => record.key === `${job.platform}:${job.id}` && record.retryable !== true) }
  record(record: PendingApplication) {
    const attemptId = record.attemptId || this.value.history.find(value => value.key === record.key && !value.taskId)?.attemptId || randomUUID()
    const saved = structuredClone({ ...record, attemptId })
    const attempt = this.value.history.findIndex(value => value.attemptId === attemptId)
    if (attempt < 0) this.value.history.push(saved)
    else this.value.history[attempt] = saved
    const existing = this.value.applications.findIndex(value => value.key === record.key)
    if (existing < 0) this.value.applications.push(saved)
    else if (record.skipCategory !== 'duplicate') this.value.applications[existing] = saved
    this.save()
  }
}
