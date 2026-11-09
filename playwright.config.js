import { defineConfig, devices } from '@playwright/test';

// 시스템 테스트(tests/e2e/*.spec.js). 단위·통합 테스트(Vitest, *.test.js)와 파일 이름으로 나눈다.
// jsdom 이 아닌 실제 Chromium 에서 데모 페이지를 띄워 확인한다.
const PORT = 4173;
const BASE = '/jungle-team11-mini-react/';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}${BASE}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}${BASE}`,
    reuseExistingServer: !process.env.CI,
  },
});
