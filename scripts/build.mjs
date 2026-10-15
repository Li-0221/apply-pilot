import { build } from 'esbuild'

await build({
  entryPoints: { main: 'electron/main.ts', preload: 'electron/preload.ts' },
  outdir: 'out', outExtension: { '.js': '.cjs' },
  platform: 'node', format: 'cjs', bundle: true, external: ['electron'],
  target: 'node22', sourcemap: true,
})
