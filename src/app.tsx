import { bossOptions } from '../shared/boss-options'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './components/ui/collapsible'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from './components/ui/select'
import { useState } from 'react'
import {
  ArrowDownToLine, ArrowRight, BriefcaseBusiness, CircleAlert,
  CirclePause, Globe2, ListFilter, LoaderCircle, LogOut, Monitor,
  Play, RefreshCw, Settings2, ShieldCheck, Sparkles, Terminal, Unplug, Upload,
} from 'lucide-react'
import type { AiSettings, ApplicationSettings, AuthStatus, Command, ResumeImportInput, Snapshot } from '../shared/contracts'
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
import { Checkbox } from './components/ui/checkbox'
import { Textarea } from './components/ui/textarea'
import { Separator } from './components/ui/separator'
import { Skeleton } from './components/ui/skeleton'
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarHeader,
  SidebarInset, SidebarMenu, SidebarMenuBadge, SidebarMenuButton,
  SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from './components/ui/sidebar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table'

const authLabels: Record<AuthStatus, string> = { unknown: '等待检查', checking: '检查中', 'signed-out': '未登录', 'signed-in': '已登录', verification: '需要验证' }
type Screen = 'workspace' | 'applications' | 'ai' | 'logs' | 'settings'
const screens = [
  { id: 'workspace', label: '工作台', icon: Monitor },
  { id: 'applications', label: '投递记录', icon: BriefcaseBusiness },
  { id: 'ai', label: 'AI 与简历', icon: Sparkles },
  { id: 'logs', label: '运行记录', icon: Terminal },
  { id: 'settings', label: '本地设置', icon: Settings2 },
] as const
const time = (value: string | null) => value ? new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '尚未保存'

type Actions = { snapshot: Snapshot; command(input: Command): Promise<boolean | undefined> }

export function App() {
  const { snapshot, command, importResume, pending, error } = useDesktop()
  const [screen, setScreen] = useState<Screen>('workspace')
  const [expanded, setExpanded] = useState(false)
  if (!window.desktop) return (
    <Empty className='min-h-svh'>
      <EmptyHeader><EmptyMedia variant='icon'><Unplug /></EmptyMedia><EmptyTitle>请在桌面应用中打开</EmptyTitle></EmptyHeader>
    </Empty>
  )
  if (!snapshot) return <div className='p-6'><Skeleton className='h-12 w-60' /><Skeleton className='mt-6 h-96 w-full' />{error ? <p role='alert'>{error}</p> : null}</div>
  const active = snapshot.task.status === 'running' || snapshot.task.status === 'stopping'
  const busy = pending || snapshot.browser.loading || active
  const current = screens.find(item => item.id === screen)!
  const focused = expanded && screen === 'workspace'
  return (
    <SidebarProvider className='h-svh overflow-hidden'>
      <Sidebar collapsible='icon' variant='inset'>
        <SidebarHeader>
          <SidebarMenu><SidebarMenuItem><SidebarMenuButton size='lg' disabled={pending} onClick={() => setScreen('workspace')}><BriefcaseBusiness /><span className='font-bold'>Apply Pilot</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>工作空间</SidebarGroupLabel>
            <SidebarMenu>
              {screens.map(item => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton isActive={screen === item.id} tooltip={item.label} disabled={pending} onClick={() => setScreen(item.id)}><item.icon /><span>{item.label}</span></SidebarMenuButton>
                  {item.id === 'applications' && snapshot.applications.length ? <SidebarMenuBadge>{snapshot.applications.length}</SidebarMenuBadge> : null}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>招聘平台</SidebarGroupLabel>
            <SidebarMenu>{snapshot.platforms.map(platform => (
              <SidebarMenuItem key={platform.id}><SidebarMenuButton tooltip={platform.name} disabled={pending} onClick={() => setScreen('workspace')}><Globe2 /><span>{platform.name}</span></SidebarMenuButton></SidebarMenuItem>
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
              <div className={cn('min-h-0 overflow-y-auto', expanded && 'hidden')}><Delivery snapshot={snapshot} command={command} pending={pending} onAi={() => setScreen('ai')} /></div>
            </div>
          ) : null}
          {screen === 'applications' ? <Applications snapshot={snapshot} command={command} busy={busy} onBrowse={() => setScreen('workspace')} /> : null}
          {screen === 'logs' ? <Logs snapshot={snapshot} /> : null}
          {screen === 'ai' ? <AiForm snapshot={snapshot} command={command} importResume={importResume} busy={busy} /> : null}
          {screen === 'settings' ? <Settings snapshot={snapshot} command={command} busy={busy} /> : null}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

function Delivery({ snapshot, command, pending, onAi }: Actions & { pending: boolean; onAi(): void }) {
  const [settings, setSettings] = useState<ApplicationSettings>(snapshot.settings)
  const active = snapshot.task.status === 'running' || snapshot.task.status === 'stopping'
  const disabled = active || pending || snapshot.browser.loading
  const change = <K extends keyof ApplicationSettings>(key: K, value: ApplicationSettings[K]) => setSettings(current => ({ ...current, [key]: value }))
  return (
    <Card>
      <CardHeader><CardTitle>自动投递</CardTitle></CardHeader>
      <CardContent className='flex flex-col gap-6'>
        <form id='delivery' onSubmit={event => { event.preventDefault(); void command({ type: 'start', settings }) }}>
          <FieldGroup>
            <Field><FieldLabel htmlFor='keyword'>岗位关键词（逗号分隔）</FieldLabel><Input id='keyword' maxLength={80} value={settings.keyword} disabled={disabled} onChange={e => change('keyword', e.target.value)} /></Field>
            <Field><FieldLabel htmlFor='city'>城市（逗号分隔）</FieldLabel><Input id='city' list='boss-cities' maxLength={40} value={settings.city} disabled={disabled} onChange={e => change('city', e.target.value)} /><datalist id='boss-cities'>{bossOptions.city.map(option => <option key={option.value} value={option.label} />)}</datalist></Field>
            <Collapsible><CollapsibleTrigger asChild><Button type='button' variant='outline'>岗位筛选</Button></CollapsibleTrigger><CollapsibleContent className='pt-4'>
              <FieldGroup>{(Object.entries({ jobType: '职位类型', salary: '薪资', experience: '经验', degree: '学历', scale: '公司规模', industry: '行业', stage: '融资阶段' }) as [keyof ApplicationSettings['filters'], string][]).map(([key, label]) => <Field key={key}><FieldLabel htmlFor={'filter-' + key}>{label}</FieldLabel><Select value={settings.filters[key]} disabled={disabled} onValueChange={value => change('filters', { ...settings.filters, [key]: value })}><SelectTrigger id={'filter-' + key} className='w-full'><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value='0'>不限</SelectItem>{bossOptions[key].filter(option => option.value !== '0').map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>)}</FieldGroup>
            </CollapsibleContent></Collapsible>
            <Field><FieldLabel htmlFor='excluded'>排除词</FieldLabel><Input id='excluded' maxLength={500} value={settings.excludedKeywords} disabled={disabled} onChange={e => change('excludedKeywords', e.target.value)} /></Field>
            <FieldGroup className='grid grid-cols-2 gap-4'>
              <Field><FieldLabel htmlFor='limit'>本次数量</FieldLabel><Input id='limit' type='number' min={1} max={100} required value={settings.limit} disabled={disabled} onChange={e => change('limit', Number(e.target.value))} /></Field>
              <Field><FieldLabel htmlFor='interval'>间隔（秒）</FieldLabel><Input id='interval' type='number' min={3} max={300} required value={settings.intervalSeconds} disabled={disabled} onChange={e => change('intervalSeconds', Number(e.target.value))} /></Field>
            </FieldGroup>
            {snapshot.ai.enabled ? <Button type='button' variant='outline' onClick={onAi}><Sparkles />{snapshot.ai.keyConfigured && snapshot.ai.model && snapshot.ai.resume ? 'AI 筛选已开启' : '配置 AI 与简历'}</Button> : <Field><FieldLabel htmlFor='message'>补充消息（选填）</FieldLabel><Textarea id='message' maxLength={1000} value={settings.message} disabled={disabled} onChange={e => change('message', e.target.value)} /></Field>}
            <Field orientation='horizontal'><Checkbox id='resume' checked={settings.sendResume} disabled={disabled} onCheckedChange={value => change('sendResume', value === true)} /><FieldLabel htmlFor='resume'>发送附件简历</FieldLabel></Field>
          </FieldGroup>
        </form>
        <div className='flex flex-wrap gap-2' aria-live='polite'><Badge variant='secondary'>已沟通 {snapshot.task.sent}</Badge><Badge variant='secondary'>跳过 {snapshot.task.skipped}</Badge><Badge variant='secondary'>异常 {snapshot.task.failed}</Badge></div>
        <p className='text-sm text-muted-foreground' role='status'>{active ? <LoaderCircle className='mr-2 inline size-4 animate-spin motion-reduce:animate-none' /> : null}{snapshot.task.message}</p>
      </CardContent>
      <CardFooter className='flex gap-2'>
        {active ? <Button variant='outline' className='flex-1' disabled={pending || snapshot.task.status === 'stopping'} onClick={() => void command({ type: 'stop' })}><CirclePause />停止投递</Button> : <><Button form='delivery' type='submit' className='flex-1' disabled={disabled || snapshot.auth !== 'signed-in'}><Play />开始投递</Button><Button variant='outline' disabled={disabled} onClick={() => void command({ type: 'save-settings', settings })}>保存</Button></>}
      </CardFooter>
    </Card>
  )
}

function AiForm({ snapshot, command, importResume, busy }: Actions & { busy: boolean; importResume(input: ResumeImportInput): Promise<string | null | undefined> }) {
  const [settings, setSettings] = useState<AiSettings>(snapshot.ai)
  const [key, setKey] = useState('')
  const [tested, setTested] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [fileError, setFileError] = useState('')
  const change = <K extends keyof AiSettings>(name: K, value: AiSettings[K]) => { setSettings(current => ({ ...current, [name]: value })); setTested(false) }
  return (
    <div className='min-h-0 overflow-auto'>
      <Card className='max-w-3xl'>
        <CardHeader><CardTitle>AI 与简历</CardTitle></CardHeader>
        <CardContent>
          <form id='ai-settings' onSubmit={async event => { event.preventDefault(); if (await command({ type: 'save-ai', settings, key })) setKey('') }}>
            <FieldGroup>
              <Field orientation='horizontal'><Checkbox id='ai-enabled' checked={settings.enabled} disabled={busy} onCheckedChange={value => change('enabled', value === true)} /><FieldLabel htmlFor='ai-enabled'>AI 筛选与定制消息</FieldLabel></Field>
              <Field><FieldLabel htmlFor='ai-url'>Base URL</FieldLabel><Input id='ai-url' type='url' maxLength={2048} required value={settings.baseUrl} disabled={busy} onChange={e => change('baseUrl', e.target.value)} /></Field>
              <Field><FieldLabel htmlFor='ai-key'>API Key{snapshot.ai.keyConfigured ? <Badge variant='secondary'>已保存</Badge> : null}</FieldLabel><Input id='ai-key' type='password' autoComplete='off' maxLength={4096} value={key} placeholder={snapshot.ai.keyConfigured ? '留空保留已保存的 Key' : ''} disabled={busy} onChange={e => { setKey(e.target.value); setTested(false) }} /></Field>
              <FieldGroup className='grid grid-cols-2 gap-4'>
                <Field><FieldLabel htmlFor='ai-model'>模型</FieldLabel><Input id='ai-model' maxLength={120} required={settings.enabled} value={settings.model} disabled={busy} onChange={e => change('model', e.target.value)} /></Field>
                <Field><FieldLabel htmlFor='ai-score'>最低匹配分</FieldLabel><Input id='ai-score' type='number' min={0} max={100} required value={settings.minScore} disabled={busy} onChange={e => change('minScore', Number(e.target.value))} /></Field>
              </FieldGroup>
              <Field data-invalid={!!fileError}>
                <FieldLabel htmlFor='resume-file'>导入简历</FieldLabel>
                <Input id='resume-file' type='file' accept='.pdf,.docx' disabled={busy || importing} aria-invalid={!!fileError} aria-describedby={fileError ? 'resume-file-error' : undefined} onChange={e => {
                  const selected = e.target.files?.[0] ?? null
                  const error = selected && (!/\.(pdf|docx)$/i.test(selected.name) ? '请选择 PDF 或 DOCX 文件' : selected.size > 10 * 1024 * 1024 || !selected.size ? '简历文件需为 1 字节至 10 MB' : '')
                  setFileError(error || ''); setFile(error ? null : selected)
                }} />
                {fileError ? <p id='resume-file-error' role='alert'>{fileError}</p> : null}
                <div className='flex gap-2'>
                  <Button type='button' variant='outline' disabled={busy || importing || !file || !settings.model || (!key && !snapshot.ai.keyConfigured)} onClick={async () => {
                    if (!file) return
                    setImporting(true)
                    try {
                      const markdown = await importResume({ name: file.name, data: await file.arrayBuffer(), settings, key })
                      if (markdown) change('resume', markdown)
                    } catch { setFileError('文件读取失败，请重新选择') }
                    finally { setImporting(false) }
                  }}>{importing ? <LoaderCircle className='animate-spin motion-reduce:animate-none' /> : <Upload />}{importing ? '解析中…' : 'AI 解析'}</Button>
                  {importing ? <Button type='button' variant='ghost' onClick={() => void command({ type: 'cancel-resume-import' })}>取消解析</Button> : null}
                </div>
              </Field>
              <Field><FieldLabel htmlFor='ai-resume'>简历内容（Markdown）{settings.resume !== snapshot.ai.resume ? <Badge variant='secondary'>待保存</Badge> : null}</FieldLabel><Textarea id='ai-resume' className='min-h-64' maxLength={30000} required={settings.enabled} value={settings.resume} disabled={busy} onChange={e => change('resume', e.target.value)} /></Field>
            </FieldGroup>
          </form>
        </CardContent>
        <CardFooter className='flex flex-wrap gap-2'>
          <Button form='ai-settings' type='submit' disabled={busy}>保存</Button>
          <Button variant='outline' disabled={busy || !settings.model || (!key && !snapshot.ai.keyConfigured)} onClick={async () => { setTested(false); setTested(Boolean(await command({ type: 'test-ai', settings, key }))) }}>测试连接</Button>
          {snapshot.ai.keyConfigured ? <Button variant='ghost' disabled={busy} onClick={async () => { if (await command({ type: 'clear-ai-key' })) { setKey(''); setTested(false) } }}>清除 Key</Button> : null}
          {tested ? <Badge variant='secondary' role='status'>连接成功</Badge> : null}
        </CardFooter>
      </Card>
    </div>
  )
}

const applicationLabels = { processing: '投递中', greeted: '已沟通', 'resume-sent': '简历已发送', skipped: '已跳过', uncertain: '待核实', failed: '失败' }
const resumeLabels = { 'not-requested': '—', sent: '已发送', 'waiting-reply': '等待回复', unavailable: '暂不可用', uncertain: '待核实' }
function Applications({ snapshot, command, busy, onBrowse }: Actions & { busy: boolean; onBrowse(): void }) {
  const [query, setQuery] = useState('')
  const records = snapshot.applications.filter(record => `${record.job.title} ${record.job.company}`.toLowerCase().includes(query.toLowerCase()))
  return (
    <section className='flex min-h-0 flex-1 flex-col gap-4'>
      <div className='flex items-center justify-between gap-4'><Badge variant='secondary'>{records.length} 条记录</Badge><Field className='max-w-xs'><FieldLabel htmlFor='filter' className='sr-only'>筛选投递记录</FieldLabel><Input id='filter' placeholder='搜索岗位或公司' value={query} onChange={e => setQuery(e.target.value)} /></Field></div>
      <div className='min-h-0 overflow-auto rounded-md border'>
        {records.length ? <Table>
          <TableHeader><TableRow><TableHead>职位 / 公司</TableHead><TableHead>状态</TableHead><TableHead>AI 匹配</TableHead><TableHead>附件简历</TableHead><TableHead>结果</TableHead><TableHead>时间</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
          <TableBody>{[...records].reverse().map(record => <TableRow key={record.key}>
            <TableCell><div className='font-medium'>{record.job.title}</div><div className='text-muted-foreground'>{record.job.company || '—'}</div></TableCell>
            <TableCell><Badge variant={record.status === 'uncertain' || record.status === 'failed' ? 'destructive' : 'secondary'}>{applicationLabels[record.status]}</Badge></TableCell>
            <TableCell className='max-w-xs whitespace-normal'>{record.score === undefined ? '—' : <><Badge variant='outline'>{record.score} 分</Badge><p>{record.aiReason}</p></>}</TableCell>
            <TableCell>{resumeLabels[record.resume]}</TableCell><TableCell className='max-w-xs whitespace-normal'>{record.detail}{record.greeting ? <p className='text-muted-foreground'>{record.greeting}</p> : null}</TableCell><TableCell>{time(record.updatedAt)}</TableCell>
            <TableCell><Button variant='ghost' size='sm' disabled={busy} onClick={async () => { if (await command({ type: 'open-job', url: record.job.url })) onBrowse() }}>查看<ArrowRight /></Button></TableCell>
          </TableRow>)}</TableBody>
        </Table> : <Empty><EmptyHeader><EmptyMedia variant='icon'><ListFilter /></EmptyMedia><EmptyTitle>{query ? '没有匹配的记录' : '暂无投递记录'}</EmptyTitle></EmptyHeader><EmptyContent><Button variant='outline' onClick={query ? () => setQuery('') : onBrowse}>{query ? '清空筛选' : '前往工作台'}</Button></EmptyContent></Empty>}
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
          <dl className='flex flex-col gap-4 text-sm'>
            <div className='flex justify-between gap-4'><dt className='text-muted-foreground'>登录状态</dt><dd>{authLabels[snapshot.auth]}</dd></div>
            <div className='flex justify-between gap-4'><dt className='text-muted-foreground'>最近保存</dt><dd>{time(snapshot.savedAt)}</dd></div>
            <div className='flex justify-between gap-4'><dt className='shrink-0 text-muted-foreground'>保存位置</dt><dd className='break-all text-right'>{snapshot.runtime.dataPath}</dd></div>
            <div className='flex justify-between gap-4'><dt className='text-muted-foreground'>应用版本</dt><dd>0.1.0</dd></div>
          </dl>
        </CardContent>
        <CardFooter className='flex flex-wrap gap-2'>
          {confirmLogout ? <><p className='w-full text-sm'>清除本机 Boss 登录会话？投递记录会保留。</p><Button variant='destructive' disabled={busy} onClick={async () => { if (await command({ type: 'logout' })) setConfirmLogout(false) }}>确认清除</Button><Button variant='outline' onClick={() => setConfirmLogout(false)}>取消</Button></> : <Button variant='outline' disabled={busy} onClick={() => setConfirmLogout(true)}><LogOut />退出登录并清除会话</Button>}
        </CardFooter>
      </Card>
    </div>
  )
}
