import { test, expect } from '@playwright/test';

test.describe('UX verification', () => {
  test('UX-VRT-01 dark theme baseline', async ({ page }) => {
    await test.step('Switch to dark theme and capture baseline', async () => {
      await page.goto('/');
      await page.getByTestId('open-settings').click();
      await page.getByTestId('theme-option-dark').click();
      const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      expect(isDark).toBe(true);
    });
  });

  test('UX-E2E-01 context inheritance', async ({ page }) => {
    await test.step('Open detail then reply', async () => {
      await page.goto('/');
      await page.getByTestId('email-card-100').click();
      await page.getByRole('button', { name: 'Reply' }).click();
    });
    await test.step('Assert compose account matches context', async () => {
      await expect(page.getByTestId('compose-from')).toHaveText('demo@nexus-mail.com');
    });
  });

  test('UX-E2E-02 system folder protection', async ({ page }) => {
    await test.step('Attempt rename/delete on Inbox', async () => {
      await page.goto('/');
      const inbox = page.getByTestId('folder-inbox');
      await inbox.hover();
      await expect(inbox.locator('button[title="Rename folder"]')).toHaveCount(0);
      await expect(inbox.locator('button[title="Delete folder"]')).toHaveCount(0);
    });
  });
});
