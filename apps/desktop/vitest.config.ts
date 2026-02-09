import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: [
      'src/**/__tests__/**/*.{test,spec}.?(c|m)[jt]s?(x)',
      'src/**/?(*.)+(test|spec).?(c|m)[jt]s?(x)'
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      'src-tauri/**',
      '.{idea,git,cache,output,temp}/**'
    ]
  }
})
