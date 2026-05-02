import { test, expect } from '@playwright/test';
import { applyMockConfig } from '../helpers/mockConfig';
import { testIds } from '../helpers/testIds';

test.describe('Empty states verification', () => {
  test('EMPTY-E2E-01 no accounts CTA', async ({ page }) => {
    await test.step('Clear accounts and open app', async () => {
      await applyMockConfig(page, { forceNoAccounts: true });
      await page.goto('/');
    });
    await test.step('Assert main CTA visible', async () => {
      await page.getByTestId(testIds.emptyStateNoAccounts).waitFor();
    });
  });

  test('EMPTY-E2E-02 empty folder actions', async ({ page }) => {
    await test.step('Open empty folder', async () => {
      await applyMockConfig(page, { emptyFolders: ['inbox'] });
      await page.goto('/');
    });
    await test.step('Assert refresh/switch actions', async () => {
      await expect(page.getByTestId(testIds.emptyStateFolderEmpty)).toBeVisible();
      await expect(page.getByTestId('empty-state-folder-refresh')).toBeVisible();
    });
  });

  test('EMPTY-E2E-03 search no results clear', async ({ page }) => {
    await test.step('Search with no results', async () => {
      await page.goto('/');
      await page.getByTestId(testIds.searchInput).fill('nomatch');
    });
    await test.step('Click clear and assert list restored', async () => {
      await expect(page.getByTestId(testIds.emptyStateSearchEmpty)).toBeVisible();
      await page.getByTestId('empty-state-search-clear').click();
      await expect(page.getByTestId(testIds.emptyStateSearchEmpty)).toHaveCount(0);
    });
  });

  test('EMPTY-E2E-04 load failure retry', async ({ page }) => {
    await test.step('Simulate load failure', async () => {
      await applyMockConfig(page, { searchShouldFail: true, searchFailMessage: 'Search failed' });
      await page.goto('/');
      await page.getByTestId(testIds.searchInput).fill('trigger');
    });
    await test.step('Retry and assert recovery', async () => {
      await expect(page.getByTestId(testIds.emptyStateLoadError)).toBeVisible();
      await page.evaluate(() => {
        window.localStorage.setItem('nexus-mail-mock-config', JSON.stringify({ searchShouldFail: false }));
      });
      await page.getByTestId(testIds.searchInput).fill('recover');
      await expect(page.getByTestId(testIds.emptyStateLoadError)).toHaveCount(0);
    });
  });
});
