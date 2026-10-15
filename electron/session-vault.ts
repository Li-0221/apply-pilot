import { safeStorage, type Session, type CookiesSetDetails } from 'electron'
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isBossUrl } from './security'

// Chromium persists localStorage/IndexedDB and persistent cookies in the partition.
// Session cookies need an explicit, encrypted snapshot to survive a clean app exit.
export class SessionVault {
  private readonly file: string
  constructor(private session: Session, directory: string) { this.file = join(directory, 'boss-session.enc') }
  private available() {
    return safeStorage.isEncryptionAvailable() &&
      (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text')
  }
  async save() {
    if (!this.available()) throw new Error('系统安全存储不可用，无法加密保存会话 Cookie')
    const cookies = (await this.session.cookies.get({})).filter(cookie => {
      const domain = (cookie.domain ?? '').replace(/^\./, '')
      return domain === 'zhipin.com' || domain.endsWith('.zhipin.com')
    })
    const encrypted = safeStorage.encryptString(JSON.stringify(cookies))
    const temporary = `${this.file}.tmp`
    writeFileSync(temporary, encrypted, { mode: 0o600 })
    renameSync(temporary, this.file)
    this.session.flushStorageData()
    await this.session.cookies.flushStore()
  }
  async restore() {
    if (!existsSync(this.file)) return
    if (!this.available()) throw new Error('系统安全存储不可用，请重新登录')
    const cookies: Electron.Cookie[] = JSON.parse(safeStorage.decryptString(readFileSync(this.file)))
    for (const cookie of cookies) {
      if (cookie.expirationDate && cookie.expirationDate <= Date.now() / 1000) continue
      const domain = (cookie.domain ?? '').replace(/^\./, '')
      const url = `https://${domain}${cookie.path || '/'}`
      if (!isBossUrl(url)) continue
      const details: CookiesSetDetails = {
        url, name: cookie.name, value: cookie.value,
        path: cookie.path, secure: cookie.secure, httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite, expirationDate: cookie.expirationDate,
      }
      if (!cookie.hostOnly) details.domain = cookie.domain
      await this.session.cookies.set(details)
    }
  }
  clear() { rmSync(this.file, { force: true }) }
}
