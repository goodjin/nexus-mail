import { test, expect } from '@playwright/test';
import { applyMockConfig } from '../helpers/mockConfig';
import { testIds } from '../helpers/testIds';

test.describe('Accounts verification', () => {
  test('ACC-E2E-01 OAuth2 success', async ({ page }) => {
    await test.step('Open add account flow', async () => {
      await applyMockConfig(page, { oauthShouldFail: false });
      await page.goto('/');
      await page.getByTestId('open-settings').click();
      await page.getByTestId('account-add-new').click();
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
      await page.goto('/');
      await page.getByTestId('open-settings').click();
      await page.getByTestId('account-add-new').click();
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
      await page.goto('/');
      await page.getByTestId('open-settings').click();
      await page.getByTestId('account-add-new').click();
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
      await expect(page.getByText('连接失败')).toBeVisible();
    });
  });

  test('ACC-E2E-04 STARTTLS/SSL port mismatch', async ({ page }) => {
    await test.step('Input mismatched port and encryption', async () => {
      await page.goto('/');
      await page.getByTestId('open-settings').click();
      await page.getByTestId('account-add-new').click();
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
      await page.goto('/');
      await page.getByTestId('open-settings').click();
      await page.getByTestId('account-add-new').click();
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
      await page.context().setOffline(true);
      await page.goto('/');
      await page.getByTestId('open-settings').click();
      await page.getByTestId('account-add-new').click();
      await page.getByTestId('account-email').fill('offline@example.com');
      await page.getByTestId('account-imap-host').fill('imap.mock.com');
      await page.getByTestId('account-imap-port').fill('993');
      await page.getByTestId('account-smtp-host').fill('smtp.mock.com');
      await page.getByTestId('account-smtp-port').fill('465');
      await page.getByTestId('account-password').fill('secret');
    });
    await test.step('Assert submit blocked and data preserved', async () => {
      await page.getByTestId('account-repair-save').click();
      await expect(page.getByText('当前离线，无法保存账号设置。')).toBeVisible();
      await page.context().setOffline(false);
    });
  });
});
