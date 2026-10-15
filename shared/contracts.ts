export type AuthStatus = 'unknown' | 'checking' | 'signed-out' | 'signed-in' | 'verification'
export type TaskStatus = 'idle' | 'running' | 'stopping' | 'completed' | 'stopped' | 'failed'
export interface Job {
  id: string; platform: string; title: string; company: string; salary: string
  location: string; tags: string[]; url: string; collectedAt: string
}
export interface SearchFilters { jobType: string; salary: string; experience: string; degree: string; scale: string; industry: string; stage: string }
export const defaultSearchFilters: SearchFilters = { jobType: '0', salary: '0', experience: '0', degree: '0', scale: '0', industry: '0', stage: '0' }
export interface ApplicationSettings {
  keyword: string; city: string; excludedKeywords: string; limit: number
  intervalSeconds: number; message: string; sendResume: boolean; filters: SearchFilters
}
export const defaultSettings: ApplicationSettings = {
  keyword: '', city: '', excludedKeywords: '', limit: 1,
  intervalSeconds: 5, message: '', sendResume: true, filters: { ...defaultSearchFilters },
}
export interface AiSettings { enabled: boolean; baseUrl: string; model: string; resume: string; minScore: number }
export const defaultAiSettings: AiSettings = { enabled: true, baseUrl: 'https://api.openai.com/v1', model: '', resume: '', minScore: 70 }
export interface AiDecision { matched: boolean; score: number; reason: string; greeting: string }
export interface ResumeImportInput { name: string; data: ArrayBuffer; settings: AiSettings; key?: string }
export type ApplicationStatus = 'processing' | 'greeted' | 'resume-sent' | 'skipped' | 'uncertain' | 'failed'
export type ResumeStatus = 'not-requested' | 'sent' | 'waiting-reply' | 'unavailable' | 'uncertain'
export interface ApplicationOutcome {
  status: Exclude<ApplicationStatus, 'processing'>; resume: ResumeStatus; detail: string
  retryable?: boolean; score?: number; aiReason?: string; greeting?: string
}
export interface ApplicationRecord extends ApplicationOutcome { key: string; job: Job; startedAt: string; updatedAt: string }
export interface PendingApplication extends Omit<ApplicationRecord, 'status'> { status: ApplicationStatus }
export interface PlatformDescriptor { id: string; name: string; capabilities: ('browse' | 'apply')[] }
export interface LogEntry { id: number; time: string; level: 'info' | 'success' | 'error'; message: string }
export interface TaskState { status: TaskStatus; attempted: number; sent: number; skipped: number; failed: number; message: string }
export interface Snapshot {
  platforms: PlatformDescriptor[]; activePlatform: string; auth: AuthStatus; account: string
  browser: { opened: boolean; loading: boolean; url: string; error: string | null }
  task: TaskState; settings: ApplicationSettings; applications: PendingApplication[]
  ai: AiSettings & { keyConfigured: boolean }
  logs: LogEntry[]; savedAt: string | null
  runtime: { electron: string; chromium: string; node: string; dataPath: string }
}
export type Command =
  | { type: 'snapshot' } | { type: 'open'; platform: string } | { type: 'reload' }
  | { type: 'login' } | { type: 'check-auth' } | { type: 'save-session' } | { type: 'logout' }
  | { type: 'save-settings'; settings: ApplicationSettings }
  | { type: 'save-ai' | 'test-ai'; settings: AiSettings; key?: string }
  | { type: 'clear-ai-key' }
  | { type: 'cancel-resume-import' }
  | { type: 'start'; settings: ApplicationSettings } | { type: 'stop' }
  | { type: 'open-job'; url: string }
export interface ViewBounds { x: number; y: number; width: number; height: number; visible: boolean }
export interface DesktopApi {
  command(command: Command): Promise<Snapshot>
  importResume(input: ResumeImportInput): Promise<string | null>
  setBrowserBounds(bounds: ViewBounds): Promise<void>
  onSnapshot(listener: (snapshot: Snapshot) => void): () => void
}
