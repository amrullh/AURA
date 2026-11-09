import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [vue(), vueDevTools(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      proxy: {
        // Saat pengembangan, semua panggilan /api diteruskan ke server tiruan (4010)
        // atau BE asli (3000). Atur lewat DEV_API_TARGET di .env.
        '/api': { target: env.DEV_API_TARGET || 'http://localhost:4010', changeOrigin: true },
      },
    },
  }
})