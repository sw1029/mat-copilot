import { expect, test } from '@playwright/test';

// TRD §9 접근성 스모크: 랜드마크/포커스/레이블 기본 보장
test('홈 화면 접근성 기본기 (lang, 제목, 포커스 이동)', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // 모든 버튼은 접근 가능한 이름을 가져야 한다
  const buttons = page.getByRole('button');
  const count = await buttons.count();
  for (let i = 0; i < count; i += 1) {
    await expect(buttons.nth(i), `button #${i} accessible name`).toHaveAccessibleName(/\S/);
  }

  // Tab 키로 포커스 이동 가능해야 한다
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => document.activeElement?.tagName);
  expect(focused).toBeTruthy();
  expect(focused).not.toBe('BODY');
});
