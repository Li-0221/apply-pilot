import { useState } from 'react'
import { ArrowRight, ListFilter } from 'lucide-react'
import type { Command, PendingApplication, Snapshot } from '../../shared/contracts'
import { blacklistValue } from '../../shared/blacklist'
import { blacklistLabels } from './blacklist-panel'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from './ui/empty'
import { Field, FieldLabel } from './ui/field'
import { Input } from './ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'

const applicationLabels = { processing: '投递中', greeted: '已沟通', 'resume-sent': '已沟通（历史）', skipped: '已跳过', uncertain: '待核实', failed: '失败' }

const taskLabels = { idle: '等待开始', running: '运行中', stopping: '正在停止', completed: '已完成', stopped: '已停止', failed: '失败' }
const date = (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false })
export function ApplicationRecords({ snapshot, command, busy, onBrowse }: { snapshot: Snapshot; command(input: Command): Promise<boolean | undefined>; busy: boolean; onBrowse(): void }) {
  const [query, setQuery] = useState(''), [status, setStatus] = useState('all'), [task, setTask] = useState('all'), [day, setDay] = useState('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<PendingApplication | null>(null)
  const filter = (action: () => void) => { action(); setPage(0) }
  const records = snapshot.history.filter(record => `${record.job.title} ${record.job.company} ${record.job.recruiterName || ''}`.toLowerCase().includes(query.toLowerCase()) && (status === 'all' || record.status === status) && (task === 'all' || (record.taskId || 'legacy') === task) && (!day || new Date(record.startedAt).toLocaleDateString('sv-SE') === day)).slice().reverse()
  const pages = Math.max(1, Math.ceil(records.length / 50)), currentPage = Math.min(page, pages - 1)
  const clear = () => { setQuery(''); setStatus('all'); setTask('all'); setDay(''); setPage(0) }
  const block = (record: PendingApplication, kind: 'company' | 'job' | 'recruiter') => command({ type: 'add-blacklist', entry: { platform: record.job.platform, kind, match: 'exact', value: blacklistValue(record.job, kind), label: kind === 'company' ? record.job.company : kind === 'job' ? record.job.title : record.job.recruiterName || '招聘者' } })
  return <section className='flex min-h-0 flex-1 flex-col gap-4'>
    <Collapsible><CollapsibleTrigger asChild><Button variant='outline'>任务历史 · {snapshot.tasks.length}</Button></CollapsibleTrigger><CollapsibleContent className='max-h-64 overflow-auto pt-4'><Table><TableHeader><TableRow><TableHead>开始时间</TableHead><TableHead>关键词 / 城市</TableHead><TableHead>状态</TableHead><TableHead>沟通 / 跳过 / 异常</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>
      {snapshot.tasks.slice().reverse().map(item => <TableRow key={item.id}><TableCell>{date(item.startedAt)}</TableCell><TableCell>{item.settings.keyword || '推荐岗位'} / {item.settings.city || '全国'}</TableCell><TableCell>{taskLabels[item.state.status]}</TableCell><TableCell>{item.state.sent} / {item.state.skipped} / {item.state.failed}</TableCell><TableCell><Button variant='ghost' onClick={() => filter(() => setTask(item.id))}>查看记录</Button></TableCell></TableRow>)}
    </TableBody></Table></CollapsibleContent></Collapsible>
    <div className='flex flex-wrap items-end gap-3'>
      <Field className='w-56'><FieldLabel htmlFor='filter'>筛选投递记录</FieldLabel><Input id='filter' placeholder='搜索岗位、公司或 HR' value={query} onChange={e => filter(() => setQuery(e.target.value))} /></Field>
      <Field className='w-36'><FieldLabel htmlFor='record-status'>投递状态</FieldLabel><Select value={status} onValueChange={value => filter(() => setStatus(value))}><SelectTrigger id='record-status' className='w-full'><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value='all'>全部状态</SelectItem>{Object.entries(applicationLabels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>

      <Field className='w-48'><FieldLabel htmlFor='record-task'>任务</FieldLabel><Select value={task} onValueChange={value => filter(() => setTask(value))}><SelectTrigger id='record-task' className='w-full'><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value='all'>全部任务</SelectItem><SelectItem value='legacy'>早期记录</SelectItem>{snapshot.tasks.slice().reverse().map(item => <SelectItem key={item.id} value={item.id}>{date(item.startedAt)}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
      <Field className='w-40'><FieldLabel htmlFor='record-day'>日期</FieldLabel><Input id='record-day' type='date' value={day} onChange={e => filter(() => setDay(e.target.value))} /></Field>
      <Button variant='ghost' onClick={clear}>清空筛选</Button><Badge variant='secondary'>{records.length} 条记录</Badge>
    </div>
    <div className='min-h-0 overflow-auto rounded-md border'>
      {records.length ? <Table><TableHeader><TableRow><TableHead>职位 / 公司</TableHead><TableHead>HR / 活跃度</TableHead><TableHead>状态</TableHead><TableHead>AI 匹配</TableHead><TableHead>结果</TableHead><TableHead>时间</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>
        {records.slice(currentPage * 50, (currentPage + 1) * 50).map(record => <TableRow key={record.attemptId || record.key}>
          <TableCell><div className='font-medium'>{record.job.title}</div><div className='text-muted-foreground'>{record.job.company || '—'}</div></TableCell>
          <TableCell>{record.job.recruiterName || '—'}<div className='text-muted-foreground'>{record.job.hrActivity || '未知'}</div></TableCell>
          <TableCell><Badge variant={['uncertain', 'failed'].includes(record.status) ? 'destructive' : 'secondary'}>{applicationLabels[record.status]}</Badge></TableCell>
          <TableCell>{record.score === undefined ? '—' : `${record.score} 分`}</TableCell><TableCell className='max-w-xs whitespace-normal'>{record.detail}</TableCell><TableCell>{date(record.updatedAt)}</TableCell>
          <TableCell><Button variant='ghost' size='sm' onClick={() => setSelected(record)}>详情</Button><Button variant='ghost' size='sm' disabled={busy} onClick={async () => { if (await command({ type: 'open-job', url: record.job.url })) onBrowse() }}>查看<ArrowRight /></Button>{(['company', 'job', 'recruiter'] as const).map(kind => <Button key={kind} variant='ghost' size='sm' disabled={!blacklistValue(record.job, kind)} onClick={() => void block(record, kind)}>拉黑{blacklistLabels[kind]}</Button>)}</TableCell>
        </TableRow>)}
      </TableBody></Table> : <Empty><EmptyHeader><EmptyMedia variant='icon'><ListFilter /></EmptyMedia><EmptyTitle>{snapshot.history.length ? '没有匹配的记录' : '暂无投递记录'}</EmptyTitle></EmptyHeader>{!snapshot.history.length ? <EmptyContent><Button variant='outline' onClick={onBrowse}>前往工作台</Button></EmptyContent> : null}</Empty>}
    </div>
    <div className='flex items-center gap-3'><Button variant='outline' disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>上一页</Button><span className='text-sm'>{currentPage + 1} / {pages}</span><Button variant='outline' disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>下一页</Button></div>
    <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null) }}><DialogContent className='max-h-[85vh] overflow-y-auto sm:max-w-2xl' aria-describedby={undefined}><DialogHeader><DialogTitle>{selected?.job.title}</DialogTitle></DialogHeader>{selected ? <div className='flex flex-col gap-4 text-sm'>
      <dl className='grid grid-cols-2 gap-3'><dt>公司</dt><dd>{selected.job.company}</dd><dt>薪资 / 城市</dt><dd>{selected.job.salary} / {selected.job.location}</dd><dt>HR / 活跃度</dt><dd>{selected.job.recruiterName || '—'} / {selected.job.hrActivity || '未知'}</dd><dt>状态</dt><dd>{applicationLabels[selected.status]}</dd><dt>结果</dt><dd>{selected.detail}</dd><dt>AI 匹配</dt><dd>{selected.score ?? '—'} {selected.aiReason}</dd><dt>沟通消息</dt><dd className='whitespace-pre-wrap'>{selected.greeting || '—'}</dd><dt>开始时间</dt><dd>{date(selected.startedAt)}</dd><dt>更新时间</dt><dd>{date(selected.updatedAt)}</dd></dl>
      <h3 className='font-medium'>岗位描述</h3><div className='whitespace-pre-wrap'>{selected.job.description || '未读取岗位描述'}</div>
    </div> : null}</DialogContent></Dialog>
  </section>
}
