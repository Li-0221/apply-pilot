import { useEffect, useRef } from 'react'
import { Globe2, RotateCw, ArrowUpRight, LockKeyhole, LoaderCircle, Maximize2, Minimize2 } from 'lucide-react'
import type { Command, Snapshot } from '../../shared/contracts'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader } from './ui/card'
import { Empty, EmptyHeader, EmptyMedia, EmptyContent } from './ui/empty'

export function BrowserPane({ snapshot, command, disabled, expanded, onExpand }: {
  snapshot: Snapshot
  command(input: Command): Promise<boolean | undefined>
  disabled: boolean
  expanded: boolean
  onExpand(): void
}) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = host.current
    if (!element || !window.desktop) return
    const api = window.desktop
    const update = () => {
      const rect = element.getBoundingClientRect()
      void api.setBrowserBounds({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, visible: snapshot.browser.opened }).catch(() => {})
    }
    const observer = new ResizeObserver(update)
    observer.observe(element)
    window.addEventListener('resize', update)
    update()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      void api.setBrowserBounds({ x: 0, y: 0, width: 0, height: 0, visible: false }).catch(() => {})
    }
  }, [snapshot.browser.opened])
  return (
    <Card className='min-h-0 min-w-0' aria-label='Boss 内置浏览器'>
      <CardHeader className='flex flex-row flex-wrap items-center gap-2'>
        <div className='flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground'><LockKeyhole className='size-4 shrink-0' /><span className='truncate'>{snapshot.browser.url || 'www.zhipin.com'}</span></div>
        {snapshot.browser.loading ? <LoaderCircle className='size-4 animate-spin motion-reduce:animate-none' aria-label='页面加载中' /> : null}
        <Button variant='ghost' size='icon' aria-label='重新加载 Boss 页面' disabled={disabled || !snapshot.browser.opened} onClick={() => void command({ type: 'reload' })}><RotateCw /></Button>
        <Button variant='ghost' size='sm' disabled={disabled} onClick={() => { if (!expanded) onExpand(); void command({ type: 'login' }) }}>登录页面</Button>
        <Button variant='ghost' size='sm' disabled={disabled} onClick={() => void command({ type: 'open', platform: 'boss' })}>岗位首页<ArrowUpRight data-icon='inline-end' /></Button>
        <Button variant='ghost' size='icon' aria-label={expanded ? '收起浏览器' : '展开浏览器'} onClick={onExpand}>{expanded ? <Minimize2 /> : <Maximize2 />}</Button>
      </CardHeader>
      <CardContent className='min-h-0 flex-1'>
      <div ref={host} className='h-full min-h-40' data-testid='browser-host'>
        {!snapshot.browser.opened ? (
          <Empty className='h-full'>
            <EmptyHeader><EmptyMedia variant='icon'><Globe2 /></EmptyMedia></EmptyHeader>
            <EmptyContent><Button disabled={disabled} onClick={() => { if (!expanded) onExpand(); void command({ type: 'login' }) }}>打开 Boss 直聘<ArrowUpRight data-icon='inline-end' /></Button></EmptyContent>
          </Empty>
        ) : null}
      </div>
      </CardContent>
    </Card>
  )
}
