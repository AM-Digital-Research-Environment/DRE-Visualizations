// Browser suite: npm run test:browser. Chromium only, as in CI; the fixture
// server (tests/browser/server.mjs) serves the module's assets and fixture
// pages, and each test stubs the generated-data endpoints it needs.
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PLAYWRIGHT_PORT || 4173);

export default defineConfig({
  testDir: 'tests/browser',
  testMatch: '*.spec.mjs',
  timeout: 120_000,
  // Software WebGL (SwiftShader) makes each map page CPU-heavy; a few workers
  // and a roomier expect timeout keep the suite deterministic under load.
  expect: { timeout: 30_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  // CI uploads this directory when the job fails (ci.yml).
  outputDir: process.env.PLAYWRIGHT_ARTIFACT_DIR || 'test-results',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      // WebGL for MapLibre in headless Chromium, as before.
      launchOptions: { args: ['--enable-unsafe-swiftshader'] },
    },
  }],
  webServer: {
    command: 'node tests/browser/server.mjs',
    env: { PORT: String(PORT) },
    url: `http://127.0.0.1:${PORT}/fixture/compare`,
    reuseExistingServer: !process.env.CI,
  },
});
