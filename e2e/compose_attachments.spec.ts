import { test, expect } from '@playwright/test';

const mockSendPayloadKey = 'nexus-mail-mock-send-email';
const mockConfigKey = 'nexus-mail-mock-config';

test.describe('Compose attachments', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate((key) => localStorage.removeItem(key), mockSendPayloadKey);
    await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({})), mockConfigKey);
    await expect(page.locator('button[title="demo@nexus-mail.com"]')).toBeVisible();
  });

  test('should include attachments when sending', async ({ page }) => {
    await page.getByTestId('compose-button').click();
    await expect(page.getByText('New Message')).toBeVisible();

    await page.setInputFiles('[data-testid="compose-attachment-input"]', {
      name: 'attachment.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('attachment content')
    });

    await expect(page.getByText('attachment.txt')).toBeVisible();

    await page.fill('#to', 'attachment-recipient@nexus-mail.com');
    await page.fill('#subject', 'Attachment send');
    await page.locator('[contenteditable="true"]').fill('Attachment body.');

    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    const sendButton = page.getByTestId('compose-send-button');
    await sendButton.evaluate((el: HTMLElement) => el.click());
    await expect(page.getByText('New Message')).not.toBeVisible();

    const payload = await page.evaluate((key) => {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : null;
    }, mockSendPayloadKey);

    expect(payload).toBeTruthy();
    expect(payload.attachments).toContain('attachment.txt');
  });
});
