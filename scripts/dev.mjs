import { createServer } from 'vite'
import { spawn } from 'node:child_process'
import electron from 'electron'
await import('./build.mjs')
const server = await createServer()
await server.listen()
const child = spawn(electron, ['.'], {
  stdio: 'inherit', env: { ...process.env, ELECTRON_RENDERER_URL: 'http://127.0.0.1:5178' },
})
child.on('exit', async code => { await server.close(); process.exit(code ?? 0) })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
