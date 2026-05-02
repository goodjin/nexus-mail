import { test, expect } from '@playwright/test';
import { applyMockConfig } from '../helpers/mockConfig';
import { testIds } from '../helpers/testIds';

test.describe('Sync status verification', () => {
  test('SYNC-E2E-01 sidebar shows status and last sync', async ({ page }) => {
      await test.step('Trigger sync', async () => {
        await page.goto('/');
        await page.getByTestId(testIds.syncRefresh).click();
      });
    await test.step('Assert status and timestamp', async () => {
      await expect(page.getByTestId(testIds.syncStatus)).toContainText('Sync');
      await expect(page.getByTestId(testIds.syncLastSync)).toBeVisible();
    });
  });

  test('SYNC-E2E-02 failure displays error status', async ({ page }) => {
      await test.step('Fail sync', async () => {
        await applyMockConfig(page, { syncShouldFail: true, syncFailMessage: 'Sync failed' });
        await page.goto('/');
        await page.getByTestId(testIds.syncRefresh).click();
      });
    await test.step('Assert error message', async () => {
      await expect(page.getByTestId(testIds.syncStatus)).toContainText('Sync failed');
    });
  });
});
