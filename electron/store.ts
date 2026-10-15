import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defaultAiSettings, defaultSettings, type AiSettings, type BlacklistEntry, type ApplicationSettings, type Job, type PendingApplication } from '../shared/contracts'
import { parseAiSettings, parseSettings } from './security'

interface SavedState { version: 3; blacklist: BlacklistEntry[]; settings: ApplicationSettings; ai: AiSettings; applications: PendingApplication[]; savedAt: string | null; jobs: Job[] }
export class LocalStore {
  private readonly file: string
  value: SavedState = { version: 3, blacklist: [], settings: { ...defaultSettings }, ai: { ...defaultAiSettings }, applications: [], savedAt: null, jobs: [] }
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    this.file = join(directory, 'workspace.json')
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf8'))
      if (data.version === 1 && typeof data.keyword === 'string' && Array.isArray(data.jobs)) {
        this.value = { ...this.value, settings: { ...defaultSettings, keyword: data.keyword }, jobs: data.jobs, savedAt: data.savedAt ?? null }
      } else if ([2, 3].includes(data.version) && Array.isArray(data.applications) && Array.isArray(data.jobs)) {
        this.value = { version: 3, blacklist: Array.isArray(data.blacklist) ? data.blacklist : [], settings: parseSettings(data.settings), ai: data.ai ? parseAiSettings(data.ai) : { ...defaultAiSettings }, applications: data.applications, jobs: data.jobs, savedAt: data.savedAt ?? null }
      } else throw new Error('不支持的本地数据格式')
      for (const record of this.value.applications) {
        if (record.status === 'processing') {
          record.status = record.retryable === true ? 'failed' : 'uncertain'
          record.detail = record.retryable === true ? '上次任务在发起沟通前中断，可重新筛选' : '上次任务中断，请在 BOSS 核实；不会自动重复投递'
          record.updatedAt = new Date().toISOString()
        }
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
  hasApplication(job: Job) { return this.value.applications.some(record => record.key === `${job.platform}:${job.id}` && record.retryable !== true) }
  record(record: PendingApplication) {
    const existing = this.value.applications.findIndex(value => value.key === record.key)
    if (existing < 0) this.value.applications.push(record)
    else this.value.applications[existing] = record
    this.save()
  }
}
