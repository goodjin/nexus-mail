import { test, expect } from '@playwright/test';

test.describe('Email Actions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:1420');
    // Select first email to show details
    await page.locator('[data-testid^="email-card-"]').first().click();
    await expect(page.getByTestId('action-delete')).toBeVisible();
  });

  test('should show action buttons in detail view', async ({ page }) => {
    await expect(page.getByTestId('action-unread')).toBeVisible();
    await expect(page.getByTestId('action-flag')).toBeVisible();
    await expect(page.getByTestId('action-delete')).toBeVisible();
  });

  test('should handle delete with confirmation', async ({ page }) => {
    // 1. Setup dialog listener
    page.on('dialog', dialog => dialog.accept());
    
    // 2. Click delete
    await page.getByTestId('action-delete').click();
    
    // 3. Page will reload (based on our window.location.reload() implementation)
    await page.waitForURL('**/');
  });

  test('should keep selected emails when bulk delete confirmation is dismissed', async ({ page }) => {
    await page.getByTestId('email-select-100').click();
    await page.getByTestId('email-select-99').click();
    await expect(page.getByTestId('selected-count')).toContainText('2 selected');

    const dialogPromise = new Promise<string>((resolve) => {
      page.once('dialog', async (dialog) => {
        expect(dialog.type()).toBe('confirm');
        const message = dialog.message();
        await dialog.dismiss();
        resolve(message);
      });
    });
    await page.getByTestId('bulk-delete').click();
    await expect(dialogPromise).resolves.toBe('Delete 2 emails?');

    await expect(page.getByTestId('selected-count')).toContainText('2 selected');
    await expect(page.getByTestId('email-card-100')).toBeVisible();
    await expect(page.getByTestId('email-card-99')).toBeVisible();
  });

  test('should show attachments in detail view', async ({ page }) => {
      // The first mock email includes attachments (uid=100).
      const attachmentsHeader = page.getByRole('heading', { name: /Attachments/i });
      await expect(attachmentsHeader).toBeVisible();
  });
});
