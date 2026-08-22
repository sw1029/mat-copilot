import { defineConfig, devices } from '@playwright/test';

// TRD/front.md §14.4 — E2E: 샘플 체험 완주 여정 (mock 백엔드 fallback 사용).
// dev 서버의 /api 프록시 타깃(백엔드)이 없으면 500 → 샘플 경로가 브라우저 내 mock으로 전환된다.
export default defineConfig({
  testDir: './e2e',
  testIgnore: /integration\.spec\.ts/, // 실통합은 playwright.integration.config.ts 전용
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    locale: 'ko-KR',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
