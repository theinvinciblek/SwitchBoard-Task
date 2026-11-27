import process from 'node:process'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The backend runs on :4000. Proxying /api, /auth and /ws makes the browser see one
// origin, so the session cookie is sent with every request and no CORS is involved.
const backend = process.env.BACKEND_URL || 'http://localhost:4000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true, // WEB_ORIGIN and the IdP's registered redirect expect 5173
    proxy: {
      '/api': backend,
      '/auth': backend,
      '/ws': { target: backend.replace(/^http/, 'ws'), ws: true },
    },
  },
})
