import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/index.ts', './src/cli.ts', '!**/*.{spec,test}.*'],
  platform: 'node',
  sourcemap: true,
  unbundle: false,
  noExternal: [
    'zod',
    '@clack/prompts',
    'cac',
    'fast-glob',
    'picocolors',
    'execa',
    'events',
    'tsdown',
  ],
  format: ['esm'],
  minify: true,
  dts: {
    sourcemap: true,
    tsconfig: './tsconfig.lib.json',
  },
})
