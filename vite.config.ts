import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function apiLivePlugin(): Plugin {
  const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
  const body = `${JSON.stringify({ status: 'ok', version })}\n`
  return {
    name: 'api-live',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (new URL(req.url ?? '/', 'http://localhost').pathname !== '/api/live') return next()
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.end(req.method === 'HEAD' ? undefined : body)
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'api/live', source: body })
    },
  }
}

export default defineConfig({
  plugins: [react(), apiLivePlugin()],
  server: { host: '0.0.0.0' },
  build: {
    rollupOptions: {
      output: { manualChunks: { three: ['three'], react: ['react', 'react-dom'] } },
    },
  },
})
