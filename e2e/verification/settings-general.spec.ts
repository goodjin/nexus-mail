import { test, expect } from '@playwright/test';
import { testIds } from '../helpers/testIds';

test.describe('Settings general verification', () => {
  test('SETGEN-E2E-01 confirm delete toggle disables dialog', async ({ page }) => {
    await test.step('Disable confirm-before-delete', async () => {
      await page.goto('/');
      await page.evaluate(() => localStorage.setItem('nexus-test-open-settings', 'general'));
      await page.reload();
      await page.getByTestId('settings-modal').waitFor();
      await page.getByTestId(testIds.settingsConfirmDeleteToggle).waitFor();
      await page.evaluate(() => {
        document
          .querySelector<HTMLButtonElement>('[data-testid="settings-confirm-delete-toggle"]')
          ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      const stored = await page.evaluate(() => localStorage.getItem('nexus-mail-mock-settings'));
      const parsed = stored ? JSON.parse(stored) : {};
      expect(parsed.confirm_before_delete).toBe('false');
      await page.getByRole('button', { name: 'Close' }).click();
      await page.locator('[data-testid="settings-modal"]').waitFor({ state: 'detached' });
      await page.evaluate(() => localStorage.removeItem('nexus-test-open-settings'));
      await page.reload();
    });
    await test.step('Delete without confirmation dialog', async () => {
      await page.getByTestId('email-card-100').waitFor();
      await page.getByTestId('email-card-100').click();
      const dialogPromise = page.waitForEvent('dialog', { timeout: 500 });
      await page.getByTestId('action-delete').click();
      await expect(dialogPromise).rejects.toThrow();
      await expect(page.getByText('Select an email to read')).toBeVisible();
    });
  });

  test('SETGEN-E2E-02 search history limit applies', async ({ page }) => {
    await test.step('Set history limit to 3', async () => {
      await page.goto('/');
      await page.evaluate(() => localStorage.setItem('nexus-test-open-settings', 'general'));
      await page.reload();
      await page.getByTestId('settings-modal').waitFor();
      await page.getByTestId(testIds.settingsSearchHistoryLimit).fill('3');
      await page.getByRole('button', { name: 'Close' }).click();
      await page.locator('[data-testid="settings-modal"]').waitFor({ state: 'detached' });
      await page.evaluate(() => localStorage.removeItem('nexus-test-open-settings'));
      await page.evaluate(() => localStorage.setItem('nexus-search-debounce-ms', '0'));
      await page.reload();
    });
    await test.step('Run 4 searches and assert cap', async () => {
      await page.getByTestId(testIds.searchInput).waitFor();
      const input = page.getByTestId(testIds.searchInput);
      const queries = ['alpha', 'beta', 'gamma', 'delta'];
      for (let i = 0; i < queries.length; i += 1) {
        const query = queries[i];
        await input.fill(query);
        await page.waitForTimeout(300);
        const expectedMin = Math.min(i + 1, 3);
        await expect.poll(async () => {
          const history = await page.evaluate(() => (window as any).__nexusTest.getSearchHistory('demo@nexus-mail.com'));
          return history.length;
        }).toBeGreaterThanOrEqual(expectedMin);
      }
      const history = await page.evaluate(() => (window as any).__nexusTest.getSearchHistory('demo@nexus-mail.com'));
      expect(history.length).toBe(3);
      expect(history[0].query).toBe('delta');
    });
  });

  test('SETGEN-E2E-03 remote image policy and download directory persist', async ({ page }) => {
    await test.step('Update settings', async () => {
      await page.goto('/');
      await page.evaluate(() => localStorage.setItem('nexus-test-open-settings', 'general'));
      await page.reload();
      await page.getByTestId('settings-modal').waitFor();
      await page.getByTestId(testIds.settingsRemoteImagePolicy).selectOption('always');
      await page.getByTestId(testIds.settingsDownloadDirectory).fill('/tmp/nexus-downloads');
      const stored = await page.evaluate(() => localStorage.getItem('nexus-mail-mock-settings'));
      const parsed = stored ? JSON.parse(stored) : {};
      expect(parsed.remote_image_policy).toBe('always');
      expect(parsed.download_directory).toBe('/tmp/nexus-downloads');
      await page.getByRole('button', { name: 'Close' }).click();
      await page.locator('[data-testid="settings-modal"]').waitFor({ state: 'detached' });
      await page.evaluate(() => localStorage.removeItem('nexus-test-open-settings'));
      await page.reload();
    });
    await test.step('Assert remote images load without banner', async () => {
      await page.getByTestId('email-card-100').waitFor();
      await page.getByTestId('email-card-100').click();
      await expect(page.getByTestId(testIds.remoteImageBanner)).toHaveCount(0);
    });
  });
});
