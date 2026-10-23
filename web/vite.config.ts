import { createHash } from 'node:crypto'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'
import type { Plugin } from 'vite'

/**
 * Hosting rules for the public demo (demo.outboundos.space, a static site).
 * Every path serves the app, since there is no API behind it, and search
 * engines are asked not to index sample data.
 */
function demoHosting(): Plugin {
  let outDir = 'dist'
  return {
    name: 'outboundos-demo-hosting',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      fs.writeFileSync(path.join(outDir, '_redirects'), '/*  /index.html  200\n')
      fs.copyFileSync(
        path.resolve(import.meta.dirname, 'public/_headers'),
        path.join(outDir, '_headers'),
      )
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    define: {
      __PUSH_WORKER_VERSION__: JSON.stringify(
        createHash('sha256')
          .update(fs.readFileSync(path.resolve(import.meta.dirname, 'public/push-sw.js')))
          .digest('hex')
          .slice(0, 16),
      ),
    },
    plugins: [react(), tailwindcss(), ...(mode === 'demo' ? [demoHosting()] : [])],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://127.0.0.1:3001',
          changeOrigin: true,
        },
      },
    },
  }
})
