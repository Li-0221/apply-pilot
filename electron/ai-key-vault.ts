import { safeStorage } from 'electron'
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export class AiKeyVault {
  private file: string
  constructor(directory: string) { this.file = join(directory, 'ai-key.enc') }
  get configured() { return existsSync(this.file) }
  private check() {
    if (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')) throw new Error('系统安全存储不可用，无法读取或保存 API Key')
  }
  read() {
    if (!this.configured) return ''
    this.check()
    try { return safeStorage.decryptString(readFileSync(this.file)) }
    catch { throw new Error('无法读取 API Key，请重新填写并保存') }
  }
  save(key: string) {
    this.check()
    const temporary = `${this.file}.tmp`
    writeFileSync(temporary, safeStorage.encryptString(key), { mode: 0o600 })
    renameSync(temporary, this.file)
  }
  clear() { rmSync(this.file, { force: true }) }
}
