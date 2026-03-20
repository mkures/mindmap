import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 15000,
  use: {
    baseURL: 'http://localhost:5000',
    httpCredentials: { username: 'admin', password: 'changeme' },
  },
  webServer: {
    command: 'cd server && python app.py',
    port: 5000,
    reuseExistingServer: true,
  },
});
