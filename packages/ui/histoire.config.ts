import { defineConfig } from 'histoire'
import { HstVue } from '@histoire/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [HstVue()],
  setupFile: '/histoire.setup.ts',
  vite: { plugins: [vue(), tailwindcss()] },
})
