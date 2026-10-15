import { useState } from 'react'
import {
  ArrowDownToLine, ArrowRight, BriefcaseBusiness, CircleAlert,
  CirclePause, Globe2, ListFilter, LoaderCircle, LogOut, Monitor,
  Play, RefreshCw, Settings2, ShieldCheck, Terminal, Unplug,
} from 'lucide-react'
import type { AuthStatus, Command, Snapshot } from '../shared/contracts'
import { useDesktop } from './hooks/use-desktop'
import { cn } from './lib/utils'
import { BrowserPane } from './components/browser-pane'
import { Alert, AlertDescription, AlertTitle } from './components/ui/alert'
import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './components/ui/card'
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from './components/ui/empty'
import { Field, FieldGroup, FieldLabel } from './components/ui/field'
import { Input } from './components/ui/input'
import { Separator } from './components/ui/separator'
import { Skeleton } from './components/ui/skeleton'
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarHeader,
  SidebarInset, SidebarMenu, SidebarMenuBadge, SidebarMenuButton,
  SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from './components/ui/sidebar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table'

const authLabels: Record<AuthStatus, string> = { unknown: '等待检查', checking: '检查中', 'signed-out': '未登录', 'signed-in': '已登录', verification: '需要验证' }
type Screen = 'workspace' | 'jobs' | 'logs' | 'settings'
const screens = [
  { id: 'workspace', label: '工作台', icon: Monitor },
  { id: 'jobs', label: '岗位列表', icon: BriefcaseBusiness },
  { id: 'logs', label: '运行记录', icon: Terminal },
  { id: 'settings', label: '本地设置', icon: Settings2 },
] as const
const time = (value: string | null) => value ? new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '尚未保存'

type Actions = { snapshot: Snapshot; command(input: Command): Promise<boolean | undefined> }

export function App() {
  const { snapshot, command, pending, error } = useDesktop()
  const [screen, setScreen] = useState<Screen>('workspace')
  const [expanded, setExpanded] = useState(false)
  if (!window.desktop) return (
    <Empty className='min-h-svh'>
      <EmptyHeader><EmptyMedia variant='icon'><Unplug /></EmptyMedia><EmptyTitle>请在桌面应用中打开</EmptyTitle></EmptyHeader>
    </Empty>
  )
  if (!snapshot) return <div className='p-6'><Skeleton className='h-12 w-60' /><Skeleton className='mt-6 h-96 w-full' />{error ? <p role='alert'>{error}</p> : null}</div>
  const busy = pending || snapshot.browser.loading || snapshot.task.status === 'running'
  const current = screens.find(item => item.id === screen)!
  const focused = expanded && screen === 'workspace'
  return (
    <SidebarProvider className='h-svh overflow-hidden'>
      <Sidebar collapsible='icon' variant='inset'>
        <SidebarHeader>
          <SidebarMenu><SidebarMenuItem><SidebarMenuButton size='lg' onClick={() => setScreen('workspace')}><BriefcaseBusiness /><span className='font-bold'>Apply Pilot</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>工作空间</SidebarGroupLabel>
            <SidebarMenu>
              {screens.map(item => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton isActive={screen === item.id} tooltip={item.label} onClick={() => setScreen(item.id)}><item.icon /><span>{item.label}</span></SidebarMenuButton>
                  {item.id === 'jobs' && snapshot.jobs.length ? <SidebarMenuBadge>{snapshot.jobs.length}</SidebarMenuBadge> : null}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>招聘平台</SidebarGroupLabel>
            <SidebarMenu>{snapshot.platforms.map(platform => (
              <SidebarMenuItem key={platform.id}><SidebarMenuButton tooltip={platform.name} onClick={() => setScreen('workspace')}><Globe2 /><span>{platform.name}</span></SidebarMenuButton></SidebarMenuItem>
            ))}</SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset className='h-[calc(100svh-(var(--spacing)*4))] min-w-0 overflow-hidden'>
        <header className='h-16 shrink-0'>
          <div className='flex h-full items-center gap-3 p-4 sm:gap-4'>
            <SidebarTrigger variant='outline' />
            <Separator orientation='vertical' className='h-6' />
            <span className='text-sm'>{current.label}</span>
            <div className='ml-auto flex min-w-0 items-center gap-2'>
              {snapshot.account ? <span className='truncate text-sm'>{snapshot.account}</span> : null}
              <Badge variant={snapshot.auth === 'signed-in' ? 'default' : 'secondary'}>{authLabels[snapshot.auth]}</Badge>
              <Button variant='outline' size='sm' disabled={busy || !snapshot.browser.opened} onClick={() => void command({ type: 'check-auth' })}><RefreshCw />检查登录</Button>
              <Button variant='outline' size='sm' disabled={pending || !snapshot.browser.opened} onClick={() => void command({ type: 'save-session' })}><ArrowDownToLine />保存会话</Button>
            </div>
          </div>
        </header>
        <main data-layout='fixed' className='flex min-h-0 grow flex-col gap-4 overflow-hidden px-4 py-6'>
          {!focused ? <h1 className='text-2xl font-bold tracking-tight'>{screen === 'workspace' ? 'Boss 直聘工作台' : current.label}</h1> : null}
          {error || snapshot.browser.error ? <Alert variant='destructive'><CircleAlert /><AlertTitle>操作未完成</AlertTitle><AlertDescription>{error || snapshot.browser.error}</AlertDescription></Alert> : null}
          {snapshot.auth === 'verification' ? <Alert><ShieldCheck /><AlertTitle>请在 Boss 页面完成安全验证</AlertTitle></Alert> : null}
          {screen === 'workspace' ? (
            <div className={cn('grid min-h-0 flex-1 gap-4', expanded ? 'grid-cols-1' : 'grid-cols-[minmax(0,1fr)_18rem]')}>
              <BrowserPane snapshot={snapshot} command={command} disabled={busy} expanded={expanded} onExpand={() => setExpanded(value => !value)} />
              <div className={cn('min-h-0 overflow-y-auto', expanded && 'hidden')}><Collection snapshot={snapshot} command={command} pending={pending} /></div>
            </div>
          ) : null}
          {screen === 'jobs' ? <Jobs snapshot={snapshot} command={command} busy={busy} onBrowse={() => setScreen('workspace')} /> : null}
          {screen === 'logs' ? <Logs snapshot={snapshot} /> : null}
          {screen === 'settings' ? <Settings snapshot={snapshot} command={command} busy={busy} /> : null}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

function Collection({ snapshot, command, pending }: Actions & { pending: boolean }) {
  const [keyword, setKeyword] = useState(snapshot.settings.keyword)
  const running = snapshot.task.status === 'running'
  return (
    <Card>
      <CardHeader><CardTitle>读取岗位</CardTitle></CardHeader>
      <CardContent className='space-y-6'>
        <form id='collect' onSubmit={event => { event.preventDefault(); void command({ type: 'collect', keyword }) }}>
          <FieldGroup><Field><FieldLabel htmlFor='keyword'>职位关键词</FieldLabel><Input id='keyword' maxLength={80} value={keyword} disabled={running || pending} onChange={event => setKeyword(event.target.value)} /></Field></FieldGroup>
        </form>
        <div className='flex items-center justify-between text-sm' aria-live='polite'><span>已读取</span><Badge variant='secondary'>{snapshot.task.collected}</Badge></div>
        <p className='text-sm text-muted-foreground' role='status'>{running ? <LoaderCircle className='mr-2 inline size-4 animate-spin motion-reduce:animate-none' /> : null}{snapshot.task.message}</p>
      </CardContent>
      <CardFooter>{running ? <Button variant='outline' className='w-full' onClick={() => void command({ type: 'stop' })}><CirclePause />停止采集</Button> : <Button form='collect' type='submit' className='w-full' disabled={pending || snapshot.auth !== 'signed-in'}><Play />开始采集</Button>}</CardFooter>
    </Card>
  )
}

function Jobs({ snapshot, command, busy, onBrowse }: Actions & { busy: boolean; onBrowse(): void }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const jobs = snapshot.jobs.filter(job => `${job.title} ${job.company} ${job.location}`.toLowerCase().includes(query.toLowerCase()))
  return (
    <section className='flex min-h-0 flex-1 flex-col gap-4'>
      <div className='flex items-center justify-between gap-4'>
        <Badge variant='secondary'>{jobs.length} 个岗位</Badge>
        <Field className='max-w-xs'><FieldLabel htmlFor='filter' className='sr-only'>筛选已保存岗位</FieldLabel><Input id='filter' placeholder='搜索岗位、公司或城市' value={query} onChange={event => setQuery(event.target.value)} /></Field>
      </div>
      <div className='min-h-0 overflow-auto rounded-md border'>
        {jobs.length ? (
          <Table>
            <TableHeader><TableRow><TableHead>职位 / 公司</TableHead><TableHead>薪资</TableHead><TableHead>工作地点</TableHead><TableHead>采集时间</TableHead><TableHead className='text-right'>操作</TableHead></TableRow></TableHeader>
            <TableBody>{[...jobs].reverse().map(job => (
              <TableRow key={`${job.platform}:${job.id}`}>
                <TableCell><div className='font-medium'>{job.title}</div><div className='text-muted-foreground'>{job.company || '—'}</div></TableCell>
                <TableCell>{job.salary || '—'}</TableCell><TableCell>{job.location || '—'}</TableCell><TableCell>{time(job.collectedAt)}</TableCell>
                <TableCell className='text-right'><Button variant='ghost' size='sm' disabled={busy} onClick={async () => { setSelected(job.id); if (await command({ type: 'open-job', url: job.url })) onBrowse(); setSelected(null) }}>{selected === job.id ? '打开中' : '查看'}<ArrowRight /></Button></TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        ) : (
          <Empty>
            <EmptyHeader><EmptyMedia variant='icon'><ListFilter /></EmptyMedia><EmptyTitle>{query ? '没有匹配的岗位' : '暂无岗位'}</EmptyTitle></EmptyHeader>
            <EmptyContent><Button variant='outline' onClick={query ? () => setQuery('') : onBrowse}>{query ? '清空筛选' : '前往工作台'}</Button></EmptyContent>
          </Empty>
        )}
      </div>
    </section>
  )
}

function Logs({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div className='min-h-0 overflow-auto rounded-md border' aria-live='polite'>
      {snapshot.logs.length ? <Table>
        <TableHeader><TableRow><TableHead>时间</TableHead><TableHead>状态</TableHead><TableHead>记录</TableHead></TableRow></TableHeader>
        <TableBody>{[...snapshot.logs].reverse().map(entry => <TableRow key={entry.id}><TableCell className='w-28 tabular-nums'>{time(entry.time)}</TableCell><TableCell className='w-24'><Badge variant={entry.level === 'error' ? 'destructive' : 'secondary'}>{entry.level === 'success' ? '完成' : entry.level === 'error' ? '失败' : '信息'}</Badge></TableCell><TableCell>{entry.message}</TableCell></TableRow>)}</TableBody>
      </Table> : <Empty><EmptyHeader><EmptyTitle>暂无记录</EmptyTitle></EmptyHeader></Empty>}
    </div>
  )
}

function Settings({ snapshot, command, busy }: Actions & { busy: boolean }) {
  const [confirmLogout, setConfirmLogout] = useState(false)
  return (
    <div className='min-h-0 overflow-auto'>
      <Card className='max-w-2xl'>
        <CardHeader><CardTitle>本机会话</CardTitle></CardHeader>
        <CardContent>
          <dl className='space-y-4 text-sm'>
            <div className='flex justify-between gap-4'><dt className='text-muted-foreground'>登录状态</dt><dd>{authLabels[snapshot.auth]}</dd></div>
            <div className='flex justify-between gap-4'><dt className='text-muted-foreground'>最近保存</dt><dd>{time(snapshot.savedAt)}</dd></div>
            <div className='flex justify-between gap-4'><dt className='shrink-0 text-muted-foreground'>保存位置</dt><dd className='break-all text-right'>{snapshot.runtime.dataPath}</dd></div>
            <div className='flex justify-between gap-4'><dt className='text-muted-foreground'>应用版本</dt><dd>0.1.0</dd></div>
          </dl>
        </CardContent>
        <CardFooter className='flex flex-wrap gap-2'>
          {confirmLogout ? <><p className='w-full text-sm'>清除本机 Boss 登录会话？已采集岗位会保留。</p><Button variant='destructive' disabled={busy} onClick={async () => { if (await command({ type: 'logout' })) setConfirmLogout(false) }}>确认清除</Button><Button variant='outline' onClick={() => setConfirmLogout(false)}>取消</Button></> : <Button variant='outline' disabled={busy} onClick={() => setConfirmLogout(true)}><LogOut />退出登录并清除会话</Button>}
        </CardFooter>
      </Card>
    </div>
  )
}
