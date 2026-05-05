import { test, expect } from '@playwright/test';
import { applyMockConfig } from './helpers/mockConfig';

test.describe('Integration - Sync and Folders', () => {
  test('should load folders and email list on first sync', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('aside');

    await expect(page.getByTestId('folder-inbox')).toBeVisible();
    await expect(page.getByTestId('folder-inbox')).toHaveClass(/bg-nexus-primary/);
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

    await expect(page.getByTestId('sync-toast')).toContainText('Sync completed!');
    await expect(page.getByTestId('badge-inbox')).toHaveText('98');
    await expect(page.getByTestId('email-card-100')).toContainText('Synced Mail');
  });

  test('should switch folders and refresh list context', async ({ page }) => {
    await applyMockConfig(page, { folderSubjectMode: 'folder-key' });

    await page.goto('/');
    await page.waitForSelector('aside');

    await expect(page.getByTestId('email-card-100')).toContainText('INBOX');

    await page.getByTestId('folder-sent').click();
    await expect(page.getByTestId('folder-sent')).toHaveClass(/bg-nexus-primary/);
    await expect(page.getByTestId('email-card-100')).toContainText('SENT');
  });

  test('should show sync failure feedback', async ({ page }) => {
    await applyMockConfig(page, {
      syncShouldFail: true,
      syncFailMessage: 'Simulated sync error'
    });

    await page.goto('/');
    await page.waitForSelector('aside');

    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(page.getByTestId('sync-toast')).toContainText('Sync failed: Simulated sync error');
  });

  test('should show empty state for empty folder', async ({ page }) => {
    await applyMockConfig(page, { emptyFolders: ['archive'] });

    await page.goto('/');
    await page.waitForSelector('aside');

    await page.getByTestId('folder-archive').click();
    await expect(page.getByText('This folder is empty')).toBeVisible();
    await expect(page.locator('[data-testid^="email-card-"]')).toHaveCount(0);
  });
});
