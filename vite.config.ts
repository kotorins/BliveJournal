import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { resolve } from 'node:path'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        popup: resolve(__dirname, 'popup.html'),
        offscreen: resolve(__dirname, 'keep-alive.html'),
        'ws-hook': resolve(__dirname, './src/ws-hook.ts'),
      },
      output: {
        entryFileNames: chunkInfo => chunkInfo.facadeModuleId?.endsWith('.ts') ? 'js/[name].js' : 'js/[name]-[hash].js',
        minifyInternalExports: false,
      },
    },
    minify: false,
    sourcemap: true,
  },
  define: {
    '__INTLIFY_JIT_COMPILATION__': true,
  },
  plugins: [
    vue(),
    vueJsx(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})
