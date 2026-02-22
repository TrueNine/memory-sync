import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import materialIconsPlugin from './src/vite-plugin-material-icons'
import monacoLocalePlugin from './src/vite-plugin-monaco-locale'

export default defineConfig({
  plugins: [
    materialIconsPlugin(),
    monacoLocalePlugin(),
    TanStackRouterVite({
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
      quoteStyle: 'single',
      routeFileIgnorePattern: '.*\.test\.tsx?$|.*\.spec\.tsx?$',
    }),
    tailwindcss(),
    react(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    target: 'esnext',
    copyPublicDir: false,
  },
})
