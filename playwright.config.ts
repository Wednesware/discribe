import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 45000,
  expect: { timeout: 15000 },
  use: {
    baseURL: 'http://127.0.0.1:8080/editor/',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  workers: 1,
  webServer: {
    command: '.venv/bin/python -m discribe host --data /tmp/discribe-playwright --port 8080',
    url: 'http://127.0.0.1:8080/editor/',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
