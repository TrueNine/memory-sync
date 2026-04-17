#!/usr/bin/env tsx
import { Generator, getConfig } from '@tanstack/router-generator'
import { resolve } from 'node:path'
import markdownOutput from '../../scripts/shared/markdown-output'

const {writeMarkdownBlock} = markdownOutput

const root = resolve(import.meta.dirname, '..')

const config = await getConfig({
  routesDirectory: resolve(root, 'src/routes'),
  generatedRouteTree: resolve(root, 'src/routeTree.gen.ts'),
  quoteStyle: 'single',
  routeFileIgnorePattern: '.*\.test\.tsx?$|.*\.spec\.tsx?$',
})

const gen = new Generator({ config, root })
await gen.run()
writeMarkdownBlock('Route tree updated', {
  output: resolve(root, 'src/routeTree.gen.ts'),
})
