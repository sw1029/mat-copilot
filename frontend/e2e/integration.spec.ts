import { expect, test, type APIRequestContext } from '@playwright/test';

// 배포 전 실통합 검증 (playwright.integration.config.ts 전용) — mock 백엔드 없이
// 실제 FastAPI가 빌드된 SPA를 서빙하는 단일 앱을 대상으로 한다.
// 현재 자리표시 상태인 라우터(plan/interview/artifacts/jobs/report)가 구현되는 대로
// 전체 여정(업로드→인터뷰→분석→보고서) 시나리오를 이 파일에 추가한다.

async function createRealSession(request: APIRequestContext) {
  const res = await request.post('/api/v1/sessions', { data: {} });
  expect(res.status()).toBe(201);
  return (await res.json()) as {
    sessionId: string;
    sessionToken: string;
    status: string;
    expiresAt: string;
  };
}

test.describe('운영 프로브 (API-15/16)', () => {
  test('/health와 /ready가 응답한다', async ({ request }) => {
    const health = await request.get('/health');
    expect(health.status()).toBe(200);
    expect(await health.json()).toMatchObject({ status: 'ok' });

    const ready = await request.get('/ready');
    expect(ready.status()).toBe(200); // LLM_MODE=disabled → llm은 fail이 아니므로 ready
    const readyBody = (await ready.json()) as { status: string; checks: Record<string, string> };
    expect(readyBody.status).toBe('ready');
    expect(readyBody.checks.store).toBe('ok');
  });
});

test.describe('세션 API 계약 (SCHEMA §2.1)', () => {
  test('API-01/02/19 — 생성·조회·삭제 왕복', async ({ request }) => {
    const created = await createRealSession(request);
    expect(created.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.sessionToken).toBeTruthy();
    expect(created.status).toBe('CREATED');
    expect(created.expiresAt).toBeTruthy();

    const got = await request.get(`/api/v1/sessions/${created.sessionId}`, {
      headers: { 'X-Session-Token': created.sessionToken },
    });
    expect(got.status()).toBe(200);
    expect(((await got.json()) as { sessionId: string }).sessionId).toBe(created.sessionId);

    const del = await request.delete(`/api/v1/sessions/${created.sessionId}`, {
      headers: { 'X-Session-Token': created.sessionToken },
    });
    expect(del.status()).toBe(204);

    // 파기 후 접근 — SESSION_NOT_FOUND(404) 또는 tombstone SESSION_EXPIRED(410)
    const gone = await request.get(`/api/v1/sessions/${created.sessionId}`, {
      headers: { 'X-Session-Token': created.sessionToken },
    });
    expect([404, 410]).toContain(gone.status());
    const goneBody = (await gone.json()) as { error: { code: string } };
    expect(goneBody.error.code).toMatch(/^SESSION_(NOT_FOUND|EXPIRED)$/);
  });

  test('무토큰 접근은 오류 계약(JSON envelope)으로 거부된다', async ({ request }) => {
    const res = await request.get('/api/v1/sessions/00000000-0000-4000-8000-000000000000');
    expect(res.status()).toBe(404);
    const body = (await res.json()) as {
      error: { code: string; message: string; retryable: boolean; traceId: string };
    };
    expect(body.error.code).toBe('SESSION_NOT_FOUND');
    expect(typeof body.error.message).toBe('string');
    expect(typeof body.error.retryable).toBe('boolean');
    expect(body.error.traceId).toBeTruthy();
  });

  test('미등록 API 경로는 SPA로 새지 않고 JSON 404를 반환한다', async ({ request }) => {
    const res = await request.get('/api/v1/definitely-not-a-route');
    expect(res.status()).toBe(404);
    expect(res.headers()['content-type']).toContain('application/json');
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

test.describe('SPA 정적 서빙 (TRD/back §12.1)', () => {
  test('루트·딥링크가 index.html로 폴백되고 보안·캐시 헤더가 붙는다', async ({ request }) => {
    for (const path of ['/', '/interview', '/report', '/expired']) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(200);
      expect(res.headers()['content-type'], path).toContain('text/html');
      expect(res.headers()['cache-control'], path).toContain('no-cache');
      expect(res.headers()['x-content-type-options'], path).toBe('nosniff');
      expect(res.headers()['content-security-policy'], path).toContain("default-src 'self'");
    }
  });

  test('해시 자산은 immutable 캐시, 소실 자산은 404', async ({ request }) => {
    const index = await request.get('/');
    const html = await index.text();
    const assetMatch = html.match(/\/assets\/[^"']+\.js/);
    expect(assetMatch, 'index.html에 해시 자산 참조가 있어야 한다').toBeTruthy();

    const asset = await request.get(assetMatch![0]);
    expect(asset.status()).toBe(200);
    expect(asset.headers()['cache-control']).toContain('immutable');

    const missing = await request.get('/assets/gone-0000000.js');
    expect(missing.status()).toBe(404);
  });
});

test.describe('실백엔드 UI 부팅', () => {
  test('홈 진입 시 실세션이 자동 생성되고 새로고침으로 복구된다(API-01→02)', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'mat-copilot' })).toBeVisible();

    // HomePage mount → 실제 API-01 → sessionId가 localStorage에 저장된다
    await page.waitForFunction(() => localStorage.getItem('matcopilot.sessionId') !== null);
    const sessionId = await page.evaluate(() => localStorage.getItem('matcopilot.sessionId'));

    // 새로고침 → useBootstrap이 API-02로 동일 세션을 복구 (만료 화면으로 빠지지 않음)
    await page.reload();
    await expect(page.getByRole('heading', { name: 'mat-copilot' })).toBeVisible();
    await expect(page).not.toHaveURL(/\/expired/);
    const after = await page.evaluate(() => localStorage.getItem('matcopilot.sessionId'));
    expect(after).toBe(sessionId);
  });

  test('딥링크 직접 진입이 서버 SPA fallback을 거쳐 렌더된다', async ({ page }) => {
    await page.goto('/expired'); // 클라이언트 라우팅 없이 서버가 직접 응답하는 경로
    await expect(page.locator('#root')).not.toBeEmpty();
  });
});
