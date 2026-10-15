import { packager } from '@electron/packager'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// Stage an allowlist: never include node_modules, test profiles or local credentials.
const staging = await mkdtemp(join(tmpdir(), 'apply-pilot-package-'))
try {
  const source = JSON.parse(await readFile('package.json', 'utf8'))
  await writeFile(join(staging, 'package.json'), JSON.stringify({
    name: source.name, productName: 'Apply Pilot', version: source.version,
    license: source.license, repository: source.repository,
    main: 'out/main.cjs', private: true,
  }, null, 2))
  await mkdir(join(staging, 'out'))
  for (const file of ['main.cjs', 'preload.cjs', 'resume-worker.cjs']) await cp(join('out', file), join(staging, 'out', file))
  await cp('dist', join(staging, 'dist'), { recursive: true })
  await cp('licenses', join(staging, 'licenses'), { recursive: true })
  for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) await cp(file, join(staging, file))
  const paths = await packager({ dir: staging, name: 'Apply Pilot', appBundleId: 'com.li0221.applypilot',
    electronVersion: source.devDependencies.electron, out: resolve('release'), overwrite: true,
    asar: true, prune: false,
  })
  console.log(paths.join('\n'))
} finally { await rm(staging, { recursive: true, force: true }) }
