import { test, expect } from '@playwright/test';

test.describe('Sync feedback', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('aside');
  });

  test('should show sync loading and completion toast', async ({ page }) => {
    const refreshButton = page.getByRole('button', { name: 'Refresh' });
    await expect(refreshButton).toBeVisible();
    await refreshButton.click();

    await expect(page.getByTestId('sync-toast')).toContainText('Syncing account...');
    await expect(page.getByRole('button', { name: /Syncing/ })).toBeVisible();
    await expect(page.getByTestId('sync-toast')).toContainText('Sync completed!');
  });
});
