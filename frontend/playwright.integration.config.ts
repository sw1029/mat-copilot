import { defineConfig, devices } from '@playwright/test';

// 배포 전 실통합 E2E — mock 백엔드 없이, 빌드된 frontend를 실제 backend(FastAPI)가
// 정적 서빙(SPA fallback)하는 단일 앱(배포 동형)을 대상으로 검증한다.
// 실행: npm run test:e2e:integration  (빌드·기동은 webServer의 serve-integration.sh가 담당)
const PORT = Number(process.env.INTEGRATION_PORT ?? 8100);

export default defineConfig({
  testDir: './e2e',
  testMatch: /integration\.spec\.ts/,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'ko-KR',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `bash ../scripts/serve-integration.sh ${PORT}`,
    url: `http://localhost:${PORT}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000, // frontend 빌드 + venv 구성 포함
  },
});
