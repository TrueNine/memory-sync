#!/usr/bin/env tsx
import { Generator, getConfig } from '@tanstack/router-generator'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

const config = await getConfig({
  routesDirectory: resolve(root, 'src/routes'),
  generatedRouteTree: resolve(root, 'src/routeTree.gen.ts'),
  quoteStyle: 'single',
  routeFileIgnorePattern: '.*\.test\.tsx?$|.*\.spec\.tsx?$',
})

const gen = new Generator({ config, root })
await gen.run()
console.log('[generate-routes] routeTree.gen.ts updated')
