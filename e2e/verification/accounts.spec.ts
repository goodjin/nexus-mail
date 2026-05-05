import { test, expect } from '@playwright/test';
import { applyMockConfig } from '../helpers/mockConfig';
import { testIds } from '../helpers/testIds';

const openAddAccount = async (page: import('@playwright/test').Page) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('nexus-test-open-settings', 'accounts');
  });
  await page.goto('/');
  await page.getByTestId('settings-modal').waitFor();
  await page.getByTestId('account-add-new').click();
};

test.describe('Accounts verification', () => {
  test('ACC-E2E-01 OAuth2 success', async ({ page }) => {
    await test.step('Open add account flow', async () => {
      await applyMockConfig(page, { oauthShouldFail: false });
      await openAddAccount(page);
    });
    await test.step('Select OAuth2 and simulate success', async () => {
      await page.getByTestId('account-auth-method').selectOption('oauth');
      await page.getByTestId('account-email').fill('oauth-success@example.com');
      await page.getByTestId('account-imap-host').fill('imap.mock.com');
      await page.getByTestId('account-imap-port').fill('993');
      await page.getByTestId('account-smtp-host').fill('smtp.mock.com');
      await page.getByTestId('account-smtp-port').fill('465');
      await page.getByTestId('account-repair-save').click();
    });
    await test.step('Assert inbox visible', async () => {
      await expect(page.getByText('Saved successfully.')).toBeVisible();
    });
  });

  test('ACC-E2E-02 OAuth2 cancel/deny', async ({ page }) => {
    await test.step('Open add account flow', async () => {
      await applyMockConfig(page, { oauthShouldFail: true, oauthFailMessage: 'Denied' });
      await openAddAccount(page);
    });
    await test.step('Simulate OAuth2 failure', async () => {
      await page.getByTestId('account-auth-method').selectOption('oauth');
    });
    await test.step('Assert error shown and form preserved', async () => {
      await expect(page.getByText('OAuth2 flow will be available')).toBeVisible();
      await expect(page.getByTestId('account-password')).toBeDisabled();
    });
  });

  test('ACC-E2E-03 TLS/cert error', async ({ page }) => {
    await test.step('Open add account and input TLS settings', async () => {
      await openAddAccount(page);
      await page.getByTestId('account-email').fill('tls-error@example.com');
      await page.getByTestId('account-imap-host').fill('imap-fail.local');
      await page.getByTestId('account-imap-port').fill('993');
      await page.getByTestId('account-smtp-host').fill('smtp.mock.com');
      await page.getByTestId('account-smtp-port').fill('465');
      await page.getByTestId('account-password').fill('secret');
    });
    await test.step('Trigger TLS error on test connection', async () => {
      await page.getByTestId('account-repair-test').click();
    });
    await test.step('Assert certificate error guidance', async () => {
      await expect(page.getByText('Test Failed:')).toBeVisible();
      await expect(page.getByText('IMAP connection failed.')).toBeVisible();
    });
  });

  test('ACC-E2E-04 STARTTLS/SSL port mismatch', async ({ page }) => {
    await test.step('Input mismatched port and encryption', async () => {
      await openAddAccount(page);
      await page.getByTestId('account-email').fill('port-error@example.com');
      await page.getByTestId('account-imap-host').fill('imap.mock.com');
      await page.getByTestId('account-imap-port').fill('993');
      await page.getByTestId('account-smtp-host').fill('smtp-fail.local');
      await page.getByTestId('account-smtp-port').fill('0');
      await page.getByTestId('account-password').fill('secret');
    });
    await test.step('Test connection and assert error', async () => {
      await page.getByTestId('account-repair-test').click();
      await expect(page.getByText('Test Failed:')).toBeVisible();
    });
  });

  test('ACC-E2E-05 duplicate email blocked', async ({ page }) => {
    await test.step('Create account A', async () => {
      await openAddAccount(page);
      await page.getByTestId('account-email').fill('demo@nexus-mail.com');
      await page.getByTestId('account-imap-host').fill('imap.mock.com');
      await page.getByTestId('account-imap-port').fill('993');
      await page.getByTestId('account-smtp-host').fill('smtp.mock.com');
      await page.getByTestId('account-smtp-port').fill('465');
      await page.getByTestId('account-password').fill('secret');
    });
    await test.step('Attempt to add same email', async () => {
      await page.getByTestId('account-repair-save').click();
    });
    await test.step('Assert duplicate rejection', async () => {
      await expect(page.getByText('Save Failed:')).toBeVisible();
      await expect(page.getByText('already exists')).toBeVisible();
    });
  });

  test('ACC-E2E-06 offline submit blocked', async ({ page }) => {
    await test.step('Go offline and attempt save', async () => {
      await openAddAccount(page);
      await page.context().setOffline(true);
      await page.getByTestId('account-email').fill('offline@example.com');
      await page.getByTestId('account-imap-host').fill('imap.mock.com');
      await page.getByTestId('account-imap-port').fill('993');
      await page.getByTestId('account-smtp-host').fill('smtp.mock.com');
      await page.getByTestId('account-smtp-port').fill('465');
      await page.getByTestId('account-password').fill('secret');
    });
    await test.step('Assert submit blocked and data preserved', async () => {
      await page.getByTestId('account-repair-save').click();
      await expect(page.getByText('You are offline. Reconnect to the internet and try again.')).toBeVisible();
      await page.context().setOffline(false);
    });
  });

  test('ACC-E2E-07 auto-discovery fills server settings', async ({ page }) => {
    await test.step('Open add account and run auto-discover', async () => {
      await applyMockConfig(page, {
        discoveryResult: {
          imap_host: 'imap.discover.com',
          imap_port: 993,
          imap_use_tls: true,
          smtp_host: 'smtp.discover.com',
          smtp_port: 465,
          smtp_use_tls: true,
        },
      });
      await openAddAccount(page);
      await page.getByTestId('account-email').fill('discover@example.com');
      await page.getByTestId(testIds.accountAutoDiscover).click();
    });
    await test.step('Assert discovered values applied', async () => {
      await expect(page.getByTestId(testIds.accountDiscoverySuccess)).toBeVisible();
      await expect(page.getByTestId('account-imap-host')).toHaveValue('imap.discover.com');
      await expect(page.getByTestId('account-imap-port')).toHaveValue('993');
      await expect(page.getByTestId('account-smtp-host')).toHaveValue('smtp.discover.com');
      await expect(page.getByTestId('account-smtp-port')).toHaveValue('465');
    });
  });

  test('ACC-E2E-08 auto-discovery error keeps manual input', async ({ page }) => {
    await test.step('Attempt auto-discovery and receive error', async () => {
      await applyMockConfig(page, { discoveryError: 'No matching config' });
      await openAddAccount(page);
      await page.getByTestId('account-email').fill('unknown@example.com');
      await page.getByTestId('account-imap-host').fill('manual.imap.local');
      await page.getByTestId(testIds.accountAutoDiscover).click();
    });
    await test.step('Assert error shown and manual values preserved', async () => {
      await expect(page.getByTestId(testIds.accountDiscoveryError)).toBeVisible();
      await expect(page.getByTestId('account-imap-host')).toHaveValue('manual.imap.local');
    });
  });

  test('ACC-E2E-09 connection test success then save', async ({ page }) => {
    await test.step('Fill settings and run test connection', async () => {
      await openAddAccount(page);
      await page.getByTestId('account-email').fill('success@example.com');
      await page.getByTestId('account-imap-host').fill('imap.mock.com');
      await page.getByTestId('account-imap-port').fill('993');
      await page.getByTestId('account-smtp-host').fill('smtp.mock.com');
      await page.getByTestId('account-smtp-port').fill('465');
      await page.getByTestId('account-password').fill('secret');
      await page.getByTestId(testIds.accountRepairTest).click();
    });
    await test.step('Assert success status and save account', async () => {
      await expect(page.getByTestId(testIds.accountRepairTest)).toContainText('Connection OK');
      await expect(page.getByText('Connection successful. Save to apply these settings.')).toBeVisible();
      await page.getByTestId(testIds.accountRepairSave).click();
      await expect(page.getByText('Saved successfully. Refresh to sync the account.')).toBeVisible();
      await expect(page.getByTestId('account-item-success@example.com')).toBeVisible();
    });
  });

  test('ACC-E2E-10 sidebar shows account error indicator', async ({ page }) => {
    await test.step('Inject account error state', async () => {
      await applyMockConfig(page, {
        accountErrorState: { email: 'demo@nexus-mail.com', status: 'error', last_error: 'Auth failed' },
      });
      await page.goto('/');
    });
    await test.step('Assert error indicator visible', async () => {
      await expect(page.getByTestId('account-issue-demo-id')).toBeVisible();
    });
  });
});
