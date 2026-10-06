import { defineConfig, devices } from '@playwright/test'

// Smoke test of the production build as GitHub Pages serves it, under
// /gitcontext/. Run after `vite build`: npm run test:pages
export default defineConfig({
  testDir: './tests/pages',
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/gitcontext/',
    headless: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/gitcontext/',
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
