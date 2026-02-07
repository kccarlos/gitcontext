import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    wasm(),
    topLevelAwait(),
  ],

  // Tauri expects a relative base path
  base: './',

  build: {
    target: 'esnext',
  },

  // Prevent vite from obscuring rust errors
  clearScreen: false,

  // Tauri expects a fixed port, fail if that port is not available
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      // Tell vite to ignore watching src-tauri
      ignored: ['**/src-tauri/**']
    }
  },

  optimizeDeps: {
    // Avoid pre-bundling tiktoken so WASM handling stays with Vite plugins
    exclude: ['@dqbd/tiktoken'],
  },
})
