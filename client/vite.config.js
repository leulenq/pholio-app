import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  root: '.',
  envPrefix: ['VITE_', 'FIREBASE_'],
  // Use '/' in dev mode (serve), '/dashboard-app/' in build mode
  base: command === 'serve' ? '/' : '/dashboard-app/',
  build: {
    outDir: '../public/dashboard-app',
    emptyOutDir: true
  },
  server: {
    port: 5173,
    fs: {
      allow: ['..']
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false
      },
      '/upload': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false
      },
      '/onboarding': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        // We match any /onboarding/ path EXCEPT the base /onboarding page
        bypass: (req) => {
          if (req.url === '/onboarding' || req.url === '/onboarding/') {
            return '/index.html'; // Let Vite handle the SPA page route
          }
          // For all other /onboarding/... paths, return undefined to proxy to backend
        }
      },
      // login removed to allow client-side route
      '/logout': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false
      },
      '/signup': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false
      },
      '/partners': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false
      },
      '/stripe': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false
      }
    }
  }
}))
