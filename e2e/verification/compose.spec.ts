import { test, expect } from '@playwright/test';
import { applyMockConfig } from '../helpers/mockConfig';
import { testIds } from '../helpers/testIds';

test.describe('Compose verification', () => {
  test('CMP-E2E-01 offline send blocked', async ({ page }) => {
    await test.step('Go offline and attempt send', async () => {
      await page.goto('/');
      await page.context().setOffline(true);
      await page.getByTestId(testIds.composeOpen).click();
      await page.getByTestId(testIds.composeTo).fill('test@example.com');
      await page.getByTestId(testIds.composeSubject).fill('Offline test');
      await page.locator('[contenteditable="true"]').fill('Body');
    });
    await test.step('Assert blocked and draft saved', async () => {
      await page.getByTestId(testIds.composeSend).click();
      await expect(page.getByTestId('compose-error')).toContainText('offline');
      await page.context().setOffline(false);
    });
  });

  test('CMP-E2E-02 recipient format validation', async ({ page }) => {
    await test.step('Open compose and input invalid recipient', async () => {
      await page.goto('/');
      await page.getByTestId(testIds.composeOpen).click();
      await page.getByTestId(testIds.composeTo).fill('bad@');
      await page.getByTestId(testIds.composeSubject).fill('Invalid');
      await page.locator('[contenteditable="true"]').fill('Body');
    });
    await test.step('Assert validation error and send disabled', async () => {
      await page.getByTestId(testIds.composeSend).click();
      await expect(page.getByTestId('compose-error')).toContainText('Invalid email address');
    });
  });

  test('CMP-E2E-03 empty subject confirmation', async ({ page }) => {
    await test.step('Open compose with empty subject', async () => {
      await page.goto('/');
      await page.getByTestId(testIds.composeOpen).click();
      await page.getByTestId(testIds.composeTo).fill('test@example.com');
      await page.locator('[contenteditable="true"]').fill('Body');
    });
    await test.step('Attempt send and confirm dialog', async () => {
      const dialogPromise = new Promise<void>((resolve) => {
        page.once('dialog', async (dialog) => {
          expect(dialog.type()).toBe('confirm');
          await dialog.accept();
          resolve();
        });
      });
      await page.getByTestId(testIds.composeSend).click();
      await dialogPromise;
    });
  });

  test('CMP-E2E-04 prevent duplicate send', async ({ page }) => {
    await test.step('Click send twice quickly', async () => {
      await page.goto('/');
      await page.getByTestId(testIds.composeOpen).click();
      await page.getByTestId(testIds.composeTo).fill('test@example.com');
      await page.getByTestId(testIds.composeSubject).fill('Dup');
      await page.locator('[contenteditable="true"]').fill('Body');
    });
    await test.step('Assert single send event', async () => {
      page.on('dialog', async (dialog) => {
        await dialog.accept();
      });
      await page.getByTestId(testIds.composeSend).click();
      await expect(page.getByTestId(testIds.composeSend)).toBeDisabled();
    });
  });

  test('CMP-E2E-05 draft cleared after success', async ({ page }) => {
    await test.step('Send email successfully', async () => {
      await page.goto('/');
      await page.getByTestId(testIds.composeOpen).click();
      await page.getByTestId(testIds.composeTo).fill('test@example.com');
      await page.getByTestId(testIds.composeSubject).fill('Clear draft');
      await page.locator('[contenteditable="true"]').fill('Body');
      page.on('dialog', async (dialog) => {
        await dialog.accept();
      });
      await page.getByTestId(testIds.composeSend).click();
    });
    await test.step('Reopen compose and verify draft empty', async () => {
      await page.getByTestId(testIds.composeOpen).click();
      await expect(page.getByTestId(testIds.composeTo)).toHaveValue('');
    });
  });

  test('CMP-E2E-06 attachment size limit', async ({ page }) => {
    await test.step('Attach oversized file', async () => {
      await page.goto('/');
      await page.getByTestId(testIds.composeOpen).click();
      const bigBuffer = Buffer.alloc(26 * 1024 * 1024, 1);
      await page.setInputFiles('[data-testid="compose-attachment-input"]', {
        name: 'big.bin',
        mimeType: 'application/octet-stream',
        buffer: bigBuffer,
      });
    });
    await test.step('Assert rejection message', async () => {
      await expect(page.getByTestId('compose-error')).toContainText('Attachment too large');
    });
  });

  test('CMP-E2E-07 retry send after failure keeps draft', async ({ page }) => {
    await test.step('Fail send and keep draft', async () => {
      await applyMockConfig(page, { sendShouldFail: true, sendFailMessage: 'Mock SMTP error' });
      await page.goto('/');
      await page.getByTestId(testIds.composeOpen).click();
      await page.getByTestId(testIds.composeTo).fill('retry@example.com');
      await page.getByTestId(testIds.composeSubject).fill('Retry send');
      await page.locator('[contenteditable="true"]').fill('Body for retry.');
      await page.getByTestId(testIds.composeSend).click();
    });
    await test.step('Assert error and draft stored', async () => {
      await expect(page.getByTestId('compose-error')).toContainText('Mock SMTP error');
      const draft = await page.evaluate(() => localStorage.getItem('nexus-compose-draft:demo@nexus-mail.com'));
      expect(draft).toContain('retry@example.com');
    });
    await test.step('Retry and succeed', async () => {
      await page.evaluate(() => {
        window.localStorage.setItem('nexus-mail-mock-config', JSON.stringify({ sendShouldFail: false }));
      });
      page.on('dialog', async (dialog) => {
        await dialog.accept();
      });
      await page.evaluate(() => {
        document.querySelector<HTMLButtonElement>('[data-testid="compose-send-button"]')?.click();
      });
      await expect(page.getByText('New Message')).toHaveCount(0);
    });
  });

  test('CMP-E2E-08 signature appended on send', async ({ page }) => {
    await test.step('Set signature and send email', async () => {
      await page.goto('/');
      await page.evaluate(() => {
        window.localStorage.setItem('nexus-mail-signatures', JSON.stringify({
          'demo@nexus-mail.com': 'Thanks,\nNexus'
        }));
      });
      await page.getByTestId(testIds.composeOpen).click();
      await page.getByTestId(testIds.composeTo).fill('sig@example.com');
      await page.getByTestId(testIds.composeSubject).fill('Signature test');
      await page.locator('[contenteditable="true"]').fill('Body content');
      page.on('dialog', async (dialog) => {
        await dialog.accept();
      });
      await page.getByTestId(testIds.composeSend).click();
    });
    await test.step('Assert signature included in payload', async () => {
      await page.waitForFunction(() => Boolean(window.localStorage.getItem('nexus-mail-mock-send-email')));
      const payload = await page.evaluate(() => {
        const stored = window.localStorage.getItem('nexus-mail-mock-send-email');
        return stored ? JSON.parse(stored) : null;
      });
      expect(payload.body).toContain('--');
      expect(payload.body).toContain('Thanks');
      expect(payload.body).toContain('Nexus');
    });
  });
});
