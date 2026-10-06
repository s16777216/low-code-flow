import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), vue(), vueDevTools()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // The backend has no CORS; the dev server forwards /api to it.
    proxy: { '/api': { target: process.env.BACKEND_URL ?? 'http://127.0.0.1:3000', rewrite: (path) => path.replace(/^\/api/, '') } },
  },
})
