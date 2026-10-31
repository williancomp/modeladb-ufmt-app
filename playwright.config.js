import { defineConfig, devices } from '@playwright/test';

// E2E_COVERAGE=1 serves the unminified sources through the Vite dev server so that
// V8 coverage can be attributed to src/app.js; otherwise the production build is tested.
const coverage = process.env.E2E_COVERAGE === '1';
const port = coverage ? 4174 : 4173;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.spec.js',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    // Set E2E_CHANNEL=chrome to use an installed Google Chrome instead of the
    // Chromium downloaded by `npx playwright install chromium`.
    channel: process.env.E2E_CHANNEL || undefined,
    headless: true,
    viewport: { width: 1400, height: 900 },
    locale: 'en-US',
    acceptDownloads: true,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } } },
    { name: 'webkit', testIgnore: 'touch.spec.js', use: { ...devices['Desktop Safari'], viewport: { width: 1400, height: 900 } } },
    // Only the chromium project is run by the project (see README); the others are kept for anyone who wants to try them.
    // Phones: the desktop toolbar is replaced by the mobile one, so they run the touch specs only.
    { name: 'Mobile Chrome', use: { ...devices['Pixel 7'] }, testMatch: ['touch.spec.js'] },
    { name: 'Mobile Safari', use: { ...devices['iPhone 14'] }, testMatch: ['touch.spec.js'] },
  ],
  webServer: [
    {
      command: coverage
        ? `npx vite --host 127.0.0.1 --port ${port} --strictPort`
        : `npm run build && npx vite preview --host 127.0.0.1 --port ${port} --strictPort`,
      url: `http://127.0.0.1:${port}/`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    // Research mode is fixed at build time (VITE_RESEARCH_MODE), so it needs its own build and server.
    {
      // `env` instead of a `VAR=value` prefix, which only POSIX shells understand.
      command:
        'npx vite build --outDir dist-research --emptyOutDir && npx vite preview --outDir dist-research --host 127.0.0.1 --port 4175 --strictPort',
      env: { VITE_RESEARCH_MODE: 'true' },
      url: 'http://127.0.0.1:4175/',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
