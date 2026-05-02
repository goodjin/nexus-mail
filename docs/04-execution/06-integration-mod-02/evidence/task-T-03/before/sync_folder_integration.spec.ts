import { test, expect } from '@playwright/test';
import { applyMockConfig } from './helpers/mockConfig';

test.describe('Integration - Sync and Folders', () => {
  test('should load folders and email list on first sync', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('aside');

    await expect(page.getByTestId('folder-inbox')).toBeVisible();
    await expect(page.locator('h2')).toContainText('Inbox');
    await expect(page.locator('[data-testid^="email-card-"]').first()).toBeVisible();
  });

  test('should update unread count and list after refresh', async ({ page }) => {
    await applyMockConfig(page, {
      syncUnreadDelta: { inbox: 3 },
      syncEmailSubjectPrefix: 'Synced Mail'
    });

    await page.goto('/');
    await page.waitForSelector('aside');

    await expect(page.getByTestId('badge-inbox')).toHaveText('95');

    const refreshButton = page.getByRole('button', { name: 'Refresh' });
    await refreshButton.click();

    await expect(page.getByText('Sync completed!')).toBeVisible();
    await expect(page.getByTestId('badge-inbox')).toHaveText('98');
    await expect(page.getByTestId('email-card-100')).toContainText('Synced Mail');
  });
});
