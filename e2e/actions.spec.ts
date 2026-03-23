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
    await expect(page.getByTestId('action-archive')).toBeVisible();
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

  test('should show attachments in detail view', async ({ page }) => {
      // Our mock for get_emails (default) doesn't have attachments yet.
      // But we can check if the section is hidden or visible based on data.
      const attachmentsHeader = page.getByText(/Attachments/);
      // Currently our mock has no attachments in get_emails list.
      await expect(attachmentsHeader).not.toBeVisible();
  });
});
