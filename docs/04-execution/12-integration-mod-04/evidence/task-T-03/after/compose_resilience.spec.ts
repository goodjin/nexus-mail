import { test, expect } from '@playwright/test';

const draftIntervalKey = 'nexus-compose-draft-interval-ms';
const draftStorageKey = 'nexus-compose-draft:demo@nexus-mail.com';
const mockConfigKey = 'nexus-mail-mock-config';

test.describe('Compose failure and draft recovery', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('button[title="demo@nexus-mail.com"]')).toBeVisible();
  });

  test('should keep content and show error on send failure', async ({ page }) => {
    await page.evaluate(({ key, config }) => {
      localStorage.setItem(key, JSON.stringify(config));
    }, {
      key: mockConfigKey,
      config: { sendShouldFail: true, sendFailMessage: 'Mock SMTP error' }
    });
    const storedConfig = await page.evaluate((key) => localStorage.getItem(key), mockConfigKey);
    expect(storedConfig).toContain('sendShouldFail');

    await page.getByTestId('compose-button').click();
    await expect(page.getByText('New Message')).toBeVisible();

    await page.fill('#to', 'fail-recipient@nexus-mail.com');
    await page.fill('#subject', 'Send failure flow');
    await page.locator('[contenteditable="true"]').fill('Retry content remains.');

    await page.getByTestId('compose-send-button').click();

    const errorMsg = page.getByTestId('compose-error');
    await expect(errorMsg).toBeVisible({ timeout: 10000 });
    await expect(errorMsg).toContainText('Mock SMTP error');
    await expect(page.locator('#to')).toHaveValue('fail-recipient@nexus-mail.com');
    await expect(page.locator('#subject')).toHaveValue('Send failure flow');
    await expect(page.locator('[contenteditable="true"]')).toContainText('Retry content remains.');

    await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({})), mockConfigKey);
  });

  test('should restore draft after autosave', async ({ page }) => {
    await page.evaluate(({ intervalKey, draftKey, configKey }) => {
      localStorage.removeItem(draftKey);
      localStorage.setItem(intervalKey, '500');
      localStorage.setItem(configKey, JSON.stringify({}));
    }, { intervalKey: draftIntervalKey, draftKey: draftStorageKey, configKey: mockConfigKey });

    await page.getByTestId('compose-button').click();
    await expect(page.getByText('New Message')).toBeVisible();

    await page.fill('#to', 'draft-recipient@nexus-mail.com');
    await page.fill('#subject', 'Draft subject');
    await page.locator('[contenteditable="true"]').fill('Draft body content.');

    await page.waitForFunction((key) => Boolean(localStorage.getItem(key)), draftStorageKey);
    await expect(page.getByTestId('compose-draft-status')).toHaveText(/Draft saved/i, { timeout: 10000 });
    const cancelButton = page.getByRole('button', { name: /Cancel/i });
    await cancelButton.evaluate((el: HTMLElement) => el.click());
    await expect(page.getByText('New Message')).not.toBeVisible();

    await page.getByTestId('compose-button').click();
    await expect(page.getByText('New Message')).toBeVisible();
    await expect(page.getByTestId('compose-draft-status')).toHaveText(/Draft loaded/i);
    await expect(page.locator('#to')).toHaveValue('draft-recipient@nexus-mail.com');
    await expect(page.locator('#subject')).toHaveValue('Draft subject');
    await expect(page.locator('[contenteditable="true"]')).toContainText('Draft body content.');

    await page.evaluate((intervalKey) => localStorage.removeItem(intervalKey), draftIntervalKey);
  });
});
