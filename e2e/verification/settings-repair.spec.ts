import { test, expect } from '@playwright/test';
import { testIds } from '../helpers/testIds';

const openAccountSettings = async (page: import('@playwright/test').Page) => {
  await page.evaluate(() => {
    window.localStorage.setItem('nexus-test-open-settings', 'accounts');
  });
  await page.reload();
  await page.getByTestId('settings-modal').waitFor();
  await page.getByRole('button', { name: 'Accounts' }).click();
  const accountItem = page.getByTestId('account-item-demo@nexus-mail.com');
  await accountItem.waitFor();
  await accountItem.click({ force: true });
  await page.getByTestId('account-email').waitFor();
};

test.describe('Settings & repair verification', () => {
  test('SET-E2E-01 account error banner', async ({ page }) => {
    await test.step('Inject account error state', async () => {
      await page.goto('/');
      await openAccountSettings(page);
      await expect.poll(() => page.evaluate(() => typeof (window as any).__nexusMailSetAccountError)).toBe('function');
      await page.evaluate(() => {
        (window as any).__nexusMailSetAccountError?.({
          email: 'demo@nexus-mail.com',
          status: 'error',
          last_error: 'Auth failed',
        });
      });
    });
    await test.step('Assert error banner visible', async () => {
      const banner = page.getByTestId(testIds.accountErrorBanner);
      await banner.waitFor();
      await expect(banner).toContainText('Authentication failed');
      await expect(banner).toContainText('Auth failed');
    });
  });

  test('SET-E2E-02 password repair flow', async ({ page }) => {
    await test.step('Open repair UI and submit new password', async () => {
      await page.goto('/');
      await openAccountSettings(page);
      await page.getByTestId('account-password').fill('new-secret');
      await page.getByTestId(testIds.accountRepairSave).click();
    });
    await test.step('Assert status normal and sync triggered', async () => {
      await expect(page.getByText('Saved successfully. Refresh to sync the account.')).toBeVisible();
      await expect(page.getByTestId(testIds.accountRepairSave)).toContainText('Saved!');
    });
  });

  test('SET-E2E-03 OAuth repair flow', async ({ page }) => {
    await test.step('Trigger OAuth reauth flow', async () => {
      await page.goto('/');
      await openAccountSettings(page);
      await page.getByTestId('account-auth-method').selectOption('oauth');
    });
    await test.step('Assert recovery', async () => {
      await expect(page.getByText('OAuth2 flow will be available')).toBeVisible();
      await expect(page.getByTestId('account-password')).toBeDisabled();
    });
  });

  test('SET-E2E-04 connection test failure feedback', async ({ page }) => {
    await test.step('Trigger connection test error', async () => {
      await page.goto('/');
      await openAccountSettings(page);
      await page.getByTestId('account-imap-host').fill('imap-fail.nexus-mail.com');
      await page.getByTestId(testIds.accountRepairTest).click();
    });
    await test.step('Assert error guidance', async () => {
      await expect(page.getByText('IMAP connection failed.')).toBeVisible();
      await expect(page.getByText('Check the host, port, and credentials, then run the test again.')).toBeVisible();
      await expect(page.getByTestId(testIds.accountRepairTest)).toContainText('Retry Test');
    });
  });

  test('SET-E2E-05 auto-sync after repair', async ({ page }) => {
    await test.step('Complete repair', async () => {
      await page.goto('/');
      await openAccountSettings(page);
    });
    await test.step('Assert last_sync updated', async () => {
      await expect(page.getByText('No successful sync recorded yet.')).toBeVisible();
      await page.getByRole('button', { name: 'Refresh now' }).click();
      await expect(page.getByText('Refresh completed. Sync status updated.')).toBeVisible();
      await expect(page.getByText('Last sync:')).toBeVisible();
    });
  });

  test('SET-E2E-06 invalid config blocked', async ({ page }) => {
    await test.step('Enter invalid port/host', async () => {
      await page.goto('/');
      await openAccountSettings(page);
      await page.getByTestId('account-imap-host').fill('');
    });
    await test.step('Assert validation error', async () => {
      await expect(page.getByText('Fill in required email and server settings')).toBeVisible();
    });
  });
});
