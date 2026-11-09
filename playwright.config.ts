import { defineConfig, devices } from '@playwright/test'

// The tests build and start the app against a stand-in for Supabase (tests/stub/supabase.mjs: sign-in and the data
// API), so they never touch the real project. NEXT_PUBLIC_ values are built into the page, so the build happens here,
// with the stand-in's address.
const PORT = 3100
const STUB = 54399

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'off' },
  webServer: [
    {
      command: 'node tests/stub/supabase.mjs',
      url: `http://127.0.0.1:${STUB}/health`,
      env: { STUB_PORT: String(STUB) },
      reuseExistingServer: false,
    },
    {
      command: `npm run build && npx next start -p ${PORT} -H 127.0.0.1`,
      url: `http://127.0.0.1:${PORT}/login`,
      timeout: 300_000,
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${STUB}`,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key',
        NEXT_PUBLIC_LEGACY_DASHBOARD_URL: 'https://aiparagon.vercel.app/dashboard',
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
