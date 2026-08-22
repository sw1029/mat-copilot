import { expect, test } from '@playwright/test';

// TC-E2E-01: 샘플 체험 완주 — 홈 → 인터뷰(자동 문답) → 결과물 자동 제출 → 분석 대기 → 결과 확인
test('샘플 체험으로 전체 여정을 완주한다', async ({ page }) => {
  await page.goto('/');

  // 홈: 3개 CTA 동일 위계 노출
  await expect(page.getByRole('button', { name: /샘플로 체험/ })).toBeVisible();

  await page.getByRole('button', { name: /샘플로 체험/ }).click();

  // 인터뷰 화면 진입 (mock 백엔드 fallback 포함)
  await expect(page).toHaveURL(/\/interview/, { timeout: 30_000 });

  // 샘플 자동 문답이 진행되어 결과물 제출 화면으로 이동
  await expect(page).toHaveURL(/\/artifacts/, { timeout: 60_000 });

  // 샘플 결과물 자동 제출 → 분석 자동 시작 → 분석 대기 화면
  await expect(page).toHaveURL(/\/analysis\//, { timeout: 60_000 });

  // 3단계 진행 표시 노출
  await expect(page.getByText(/차이 분석/).first()).toBeVisible();

  // 폴링 완료 후 결과 화면 도달
  await expect(page).toHaveURL(/\/report/, { timeout: 90_000 });

  // 결과 화면 핵심 요소: AI 고지, IntentDoc, finding 목록
  await expect(page.getByText('AI 분석 결과').first()).toBeVisible();
  await expect(page.getByText(/의도 기준선/).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /finding 목록/ })).toBeVisible();
});

test('새로고침 후에도 세션이 복구된다 (분석 결과 유지)', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /샘플로 체험/ }).click();
  await expect(page).toHaveURL(/\/report/, { timeout: 150_000 });

  // mock 백엔드는 메모리 상태이므로 새로고침 시 세션 조회가 실패하고
  // 만료/새 세션 안내로 안전하게 복구되어야 한다 (dead-end 금지).
  await page.reload();
  await expect(
    page.getByRole('button', { name: /새 세션|새로 시작|다시 시작/ }).first(),
  ).toBeVisible({ timeout: 30_000 });
});
