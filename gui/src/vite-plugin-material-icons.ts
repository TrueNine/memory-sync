/**
 * Vite plugin that serves and copies Material Icon Theme SVGs.
 *
 * - Dev: intercepts requests to `/material-icons/*.svg` and serves from node_modules
 * - Build: copies all SVGs from `material-icon-theme/icons/` into `dist/material-icons/`
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

const ROUTE_PREFIX = '/material-icons/'

function getIconsDir(root: string): string {
  return resolve(root, 'node_modules/material-icon-theme/icons')
}

export default function materialIconsPlugin(): Plugin {
  let iconsDir: string
  let resolvedOutDir: string

  return {
    name: 'vite-plugin-material-icons',

    configResolved(config) {
      iconsDir = getIconsDir(config.root)
      resolvedOutDir = resolve(config.root, config.build.outDir)
    },

    // Dev server: serve SVGs on the fly
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith(ROUTE_PREFIX)) return next()
        const fileName = req.url.slice(ROUTE_PREFIX.length)
        const filePath = resolve(iconsDir, fileName)
        if (!existsSync(filePath)) {
          res.statusCode = 404
          res.end('Not found')
          return
        }
        res.setHeader('Content-Type', 'image/svg+xml')
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        res.end(readFileSync(filePath))
      })
    },

    // Build: copy all SVGs into outDir/material-icons/
    closeBundle() {
      if (!existsSync(iconsDir)) return
      const dest = resolve(resolvedOutDir, 'material-icons')
      mkdirSync(dest, { recursive: true })
      for (const file of readdirSync(iconsDir)) {
        if (file.endsWith('.svg')) {
          copyFileSync(resolve(iconsDir, file), resolve(dest, file))
        }
      }
    },
  }
}
