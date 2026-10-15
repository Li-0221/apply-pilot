export type AuthStatus = 'unknown' | 'checking' | 'signed-out' | 'signed-in' | 'verification'
export type TaskStatus = 'idle' | 'running' | 'completed' | 'stopped' | 'failed'
export interface Job {
  id: string
  platform: string
  title: string
  company: string
  salary: string
  location: string
  tags: string[]
  url: string
  collectedAt: string
}
export interface PlatformDescriptor { id: string; name: string; capabilities: ('browse' | 'collect')[] }
export interface LogEntry { id: number; time: string; level: 'info' | 'success' | 'error'; message: string }
export interface Snapshot {
  platforms: PlatformDescriptor[]
  activePlatform: string
  auth: AuthStatus
  account: string
  browser: { opened: boolean; loading: boolean; url: string; error: string | null }
  task: { status: TaskStatus; collected: number; message: string }
  settings: { keyword: string }
  jobs: Job[]
  logs: LogEntry[]
  savedAt: string | null
  runtime: { electron: string; chromium: string; node: string; dataPath: string }
}
export type Command =
  | { type: 'snapshot' }
  | { type: 'open'; platform: string }
  | { type: 'reload' }
  | { type: 'login' }
  | { type: 'check-auth' }
  | { type: 'save-session' }
  | { type: 'logout' }
  | { type: 'collect'; keyword: string }
  | { type: 'stop' }
  | { type: 'open-job'; url: string }
export interface ViewBounds { x: number; y: number; width: number; height: number; visible: boolean }
export interface DesktopApi {
  command(command: Command): Promise<Snapshot>
  setBrowserBounds(bounds: ViewBounds): Promise<void>
  onSnapshot(listener: (snapshot: Snapshot) => void): () => void
}
