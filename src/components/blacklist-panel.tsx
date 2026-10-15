import { useState } from 'react'
import type { BlacklistInput, Command, Snapshot } from '../../shared/contracts'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Field, FieldGroup, FieldLabel } from './ui/field'
import { Input } from './ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
export const blacklistLabels = { company: '公司', job: '岗位', recruiter: '招聘者' }
export function BlacklistPanel({ snapshot, command }: { snapshot: Snapshot; command(input: Command): Promise<boolean | undefined> }) {
  const [kind, setKind] = useState<BlacklistInput['kind']>('company')
  const [value, setValue] = useState('')
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const entries = snapshot.blacklist.filter(entry => `${entry.label} ${entry.value}`.toLowerCase().includes(query.toLowerCase()))
  return <div className='flex min-h-0 flex-1 flex-col gap-4 overflow-auto'>
    <Card className='max-w-2xl'><CardHeader><CardTitle>添加黑名单</CardTitle></CardHeader><CardContent>
      <form onSubmit={async e => { e.preventDefault(); setSaving(true); try { if (await command({ type: 'add-blacklist', entry: { platform: 'boss', kind, match: 'contains', value, label: value } })) setValue('') } finally { setSaving(false) } }}>
        <FieldGroup>
          <Field><FieldLabel htmlFor='blacklist-kind'>类型</FieldLabel><Select value={kind} onValueChange={value => setKind(value as BlacklistInput['kind'])}><SelectTrigger id='blacklist-kind'><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{Object.entries(blacklistLabels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
          <Field><FieldLabel htmlFor='blacklist-value'>名称包含</FieldLabel><Input id='blacklist-value' value={value} onChange={e => setValue(e.target.value)} maxLength={200} required /></Field>
          <Button disabled={saving || !value.trim()} type='submit'>添加</Button>
        </FieldGroup>
      </form>
    </CardContent></Card>
    <Field className='max-w-xs'><FieldLabel htmlFor='blacklist-query'>搜索黑名单</FieldLabel><Input id='blacklist-query' value={query} onChange={e => setQuery(e.target.value)} /></Field>
    <div className='rounded-md border'><Table><TableHeader><TableRow><TableHead>类型</TableHead><TableHead>名称</TableHead><TableHead>匹配</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>
      {entries.map(entry => <TableRow key={entry.id}><TableCell>{blacklistLabels[entry.kind]}</TableCell><TableCell>{entry.label}</TableCell><TableCell>{entry.match === 'exact' ? '精确' : '包含'}</TableCell><TableCell><Button variant='ghost' onClick={() => void command({ type: 'remove-blacklist', id: entry.id })}>移除</Button></TableCell></TableRow>)}
      {!entries.length ? <TableRow><TableCell colSpan={4}>暂无黑名单</TableCell></TableRow> : null}
    </TableBody></Table></div>
  </div>
}
