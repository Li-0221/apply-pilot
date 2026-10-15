import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Job } from '../shared/contracts'

interface SavedState { version: 1; keyword: string; jobs: Job[]; savedAt: string | null }
export class LocalStore {
  private readonly file: string
  value: SavedState = { version: 1, keyword: '', jobs: [], savedAt: null }
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    this.file = join(directory, 'workspace.json')
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf8'))
      if (data.version !== 1 || typeof data.keyword !== 'string' || !Array.isArray(data.jobs)) throw new Error('不支持的本地数据格式')
      this.value = data
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('本地工作台数据损坏，请先备份 workspace.json 再重试', { cause: error })
    }
  }
  save() {
    const temporary = `${this.file}.tmp`
    writeFileSync(temporary, JSON.stringify(this.value), { mode: 0o600 })
    renameSync(temporary, this.file)
  }
  merge(jobs: Job[]) {
    const merged = new Map(this.value.jobs.map(job => [`${job.platform}:${job.id}`, job]))
    jobs.forEach(job => merged.set(`${job.platform}:${job.id}`, job))
    this.value.jobs = [...merged.values()].slice(-2000)
    this.save()
  }
}
