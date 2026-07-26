/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Express backend the dev server proxies to. Defaults to :3000 — the port in
// .env.example, in CLAUDE.md, and in pholio-landing's dev proxy target. These
// entries were hardcoded to :3002, so with the documented .env one of the two
// frontends always pointed at a dead port. Override with VITE_API_PROXY_TARGET
// if you run Express somewhere else.
const API_TARGET = process.env.VITE_API_PROXY_TARGET || 'http://localhost:3000';

const proxyToApi = {
  target: API_TARGET,
  changeOrigin: true,
  secure: false,
};

export default defineConfig(({ command }) => ({
  plugins: [react()],
  root: '.',
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
  },
  envPrefix: ['VITE_', 'FIREBASE_'],
  // Use '/' in dev mode (serve), '/dashboard-app/' in build mode
  base: command === 'serve' ? '/' : '/dashboard-app/',
  build: {
    outDir: '../public/dashboard-app',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    fs: {
      allow: ['..']
    },
    proxy: {
      '/api': { ...proxyToApi },
      '/uploads': { ...proxyToApi },
      '/upload': { ...proxyToApi },
      '/onboarding': {
        ...proxyToApi,
        // We match any /onboarding/ path EXCEPT the base /onboarding page
        bypass: (req) => {
          const pathname = req.url?.split('?')[0];
          if (pathname === '/onboarding' || pathname === '/onboarding/') {
            return '/index.html'; // Let Vite handle the SPA page route
          }
          // For all other /onboarding/... paths, return undefined to proxy to backend
        }
      },
      // login removed to allow client-side route
      '/logout': { ...proxyToApi },
      '/signup': { ...proxyToApi },
      '/partners': { ...proxyToApi },
      '/stripe': { ...proxyToApi },
      '/pdf': { ...proxyToApi },
      // vendored comp card fonts (@font-face inside the /pdf/view preview iframe)
      '/fonts': { ...proxyToApi }
    }
  }
}))
