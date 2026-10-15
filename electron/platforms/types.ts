import type { AiDecision, ApplicationOutcome, ApplicationSettings, AuthStatus, Job, PlatformDescriptor } from '../../shared/contracts'

export interface InteractionTarget { token: string; x: number; y: number; fill?: string }
export interface AutomationBrowser {
  navigate(url: string, signal: AbortSignal): Promise<void>
  execute<T>(script: string, signal: AbortSignal): Promise<T>
  evaluate(job: Job, description: string, signal: AbortSignal): Promise<AiDecision | null>
  interact(target: InteractionTarget, signal: AbortSignal): Promise<void>
  skipReason(job: Job): string | null
  progress(patch: Pick<ApplicationOutcome, 'score' | 'aiReason' | 'greeting'> & { detail?: string }): void
  beforeContact(): Promise<void>
}
// Each platform owns its own selectors, navigation and application sequence.
export interface PlatformAdapter {
  descriptor: PlatformDescriptor; partition: string; entryUrl: string; loginUrl: string
  isAllowedUrl(url: string): boolean
  searchUrl(keyword: string, city?: string, filters?: ApplicationSettings['filters']): string
  inspectScript: string; scrollScript: string
  apply(browser: AutomationBrowser, job: Job, settings: ApplicationSettings, signal: AbortSignal): Promise<ApplicationOutcome>
}
export interface PageInspection { auth: AuthStatus; account: string; jobs: Job[]; emptyReason?: string }
