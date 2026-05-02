import { test, expect } from '@playwright/test';

test.describe('Drag Move', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid^="email-card-"]');
  });

  test('should move email into target folder via drag and drop', async ({ page }) => {
    const firstCard = page.locator('[data-testid^="email-card-"]').first();
    const testId = await firstCard.getAttribute('data-testid');
    expect(testId).toBeTruthy();

    const targetFolder = page.getByTestId('folder-archive');
    await expect(targetFolder).toBeVisible();

    await firstCard.dragTo(targetFolder);

    await expect(page.locator(`[data-testid="${testId}"]`)).toHaveCount(0);
  });
});
