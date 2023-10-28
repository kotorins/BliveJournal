import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        "blive-journal-worker": resolve(__dirname, './src/service-worker.ts'),
      },
      output: {
        entryFileNames: chunkInfo => chunkInfo.facadeModuleId?.endsWith('.ts') ? 'js/[name].js' : 'js/[name]-[hash].js',
        minifyInternalExports: false,
        format: 'iife',
      },
    },
    minify: false,
    sourcemap: true,
  },
})
