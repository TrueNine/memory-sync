#!/usr/bin/env bun
import {cp, mkdir, rm} from 'node:fs/promises'
import {resolve} from 'node:path'

import {context} from 'esbuild'

const rootDir = resolve(import.meta.dirname, '..')
const distDir = resolve(rootDir, 'dist')
const watch = process.argv.includes('--watch')

await rm(distDir, {recursive: true, force: true})
await mkdir(distDir, {recursive: true})
await Promise.all([
  cp(resolve(rootDir, 'manifest.json'), resolve(distDir, 'manifest.json')),
  cp(resolve(rootDir, 'styles.css'), resolve(distDir, 'styles.css')),
])

const buildContext = await context({
  entryPoints: [resolve(rootDir, 'src/main.ts')],
  outfile: resolve(distDir, 'main.js'),
  bundle: true,
  external: ['obsidian'],
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  sourcemap: watch ? 'inline' : false,
  logLevel: 'info',
})

if (watch) {
  await buildContext.watch()
  console.log('Watching TNMSO sources...')
} else {
  await buildContext.rebuild()
  await buildContext.dispose()
}
