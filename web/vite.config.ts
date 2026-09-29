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
      fs.writeFileSync(
        path.join(outDir, '_headers'),
        [
          '/*',
          '  X-Robots-Tag: noindex',
          '  X-Content-Type-Options: nosniff',
          '  Referrer-Policy: strict-origin-when-cross-origin',
          '/assets/*',
          '  Cache-Control: public, max-age=31536000, immutable',
          '',
        ].join('\n'),
      )
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
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
