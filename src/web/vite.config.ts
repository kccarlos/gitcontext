import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [
    react(),
    wasm(),
    topLevelAwait(),
    electron({
      entry: 'src/electron/main.ts',
      vite: {
        build: { sourcemap: true }
      }
    }),
    renderer(),
  ],
  build: {
    target: 'esnext',
  },
  // Ensure module worker bundles use ESM format in production
  worker: {
    format: 'es',
  },
  // Prefer browser ESM entry points for dependencies like isomorphic-git
  resolve: {
    conditions: ['browser', 'development'],
    alias: {
      // Force ESM browser build; bypass package "exports" defaulting to CJS
      // Map bare import "isomorphic-git" to its ESM entry explicitly
      'isomorphic-git$': 'isomorphic-git/index.js',
      // Polyfills for Node built-ins used transitively by isomorphic-git deps
      stream: 'stream-browserify',
      buffer: 'buffer',
      util: 'util',
      events: 'events',
      path: 'path-browserify',
      process: 'process/browser'
    },
  },
  define: {
    // Ensure global and process.env are defined in browser
    global: 'globalThis',
    'process.env': {}
  },
  optimizeDeps: {
    // Avoid pre-bundling tiktoken so WASM handling stays with Vite plugins
    exclude: ['@dqbd/tiktoken'],
    // Explicitly pre-bundle git libs and polyfills so CJS gets transformed for the worker
    include: [
      'isomorphic-git',
      '@isomorphic-git/lightning-fs',
      'buffer',
      'process',
      'util',
      'events',
      'stream-browserify',
      'path-browserify'
    ],
    esbuildOptions: {
      // Prefer browser condition when resolving package exports
      conditions: ['browser'],
      platform: 'browser',
    },
  },
})
