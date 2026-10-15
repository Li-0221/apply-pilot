import type { AuthStatus, Job, PlatformDescriptor } from '../../shared/contracts'

// Platform-specific selectors and navigation stay behind this interface.
// The browser host, persistence and task lifecycle do not depend on Boss selectors.
export interface PlatformAdapter {
  descriptor: PlatformDescriptor
  partition: string
  entryUrl: string
  loginUrl: string
  isAllowedUrl(url: string): boolean
  searchUrl(keyword: string): string
  inspectScript: string
  scrollScript: string
}
export interface PageInspection {
  auth: AuthStatus
  account: string
  jobs: Job[]
}
