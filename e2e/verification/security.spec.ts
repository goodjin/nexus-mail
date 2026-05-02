import { test, expect } from '@playwright/test';
import { testIds } from '../helpers/testIds';

const openAccountSettings = async (page: import('@playwright/test').Page) => {
  await page.getByTestId('open-settings').click();
  await page.getByRole('button', { name: 'Accounts' }).click();
  const accountItem = page.getByTestId('account-item-demo@nexus-mail.com');
  await accountItem.waitFor();
  await accountItem.click();
};

test.describe('Security verification', () => {
  test('ACC-SEC-01 password not leaked in errors', async ({ page }) => {
    await test.step('Trigger auth failure and inspect error text', async () => {
      await page.goto('/');
      await openAccountSettings(page);
      await page.getByTestId('account-password').fill('supersecret');
      await page.getByTestId('account-imap-host').fill('imap-fail.local');
      await page.getByTestId(testIds.accountRepairTest).click();
    });
    await test.step('Assert password not present', async () => {
      const errorBanner = page.locator('div', { hasText: 'Test Failed:' }).last();
      await expect(errorBanner).toBeVisible();
      await expect(errorBanner).not.toContainText('supersecret');
    });
  });

  test('DETAIL-SEC-01 HTML/text sanitization', async ({ page }) => {
    await test.step('Inject XSS payload in email body', async () => {
      await page.goto('/');
      await page.evaluate(() => {
        (window as any).XSS_EXECUTED = false;
      });
      await page.getByTestId('email-card-100').click();
    });
    await test.step('Assert script not executed', async () => {
      const executed = await page.evaluate(() => (window as any).XSS_EXECUTED);
      expect(executed).not.toBe(true);
    });
  });

  test('SRCH-SEC-01 search query XSS', async ({ page }) => {
    await test.step('Search with XSS payload', async () => {
      await page.goto('/');
      await page.evaluate(() => {
        (window as any).XSS_EXECUTED = false;
      });
      await page.getByTestId(testIds.searchInput).fill('<img src=x onerror="window.XSS_EXECUTED=true" />');
    });
    await test.step('Assert no script execution', async () => {
      const executed = await page.evaluate(() => (window as any).XSS_EXECUTED);
      expect(executed).not.toBe(true);
    });
  });
});
