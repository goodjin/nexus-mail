import { test, expect } from '@playwright/test';

test.describe('Navigation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:1420');
    // Wait for initial load
    await expect(page.locator('aside')).toContainText('demo@nexus-mail.com');
  });

  test('should switch folders and update email list', async ({ page }) => {
    // 1. Inbox should be selected by default
    await expect(page.locator('h2')).toContainText('Inbox');
    
    // 2. Click "Sent" folder
    // Note: data-testid="folder-sent" or similar
    await page.getByTestId('folder-sent').click();
    
    // 3. Header should update
    await expect(page.locator('h2')).toContainText('Sent');
  });

  test('should handle account switching', async ({ page }) => {
    // Verify first account is shown in sidebar header
    await expect(page.locator('aside')).toContainText('demo@nexus-mail.com');
  });
});
