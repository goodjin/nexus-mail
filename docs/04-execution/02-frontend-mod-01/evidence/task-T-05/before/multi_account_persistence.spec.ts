
import { test, expect } from '@playwright/test';

test.describe('Account and Data Persistence', () => {
  test('should show multiple accounts and persist emails after refresh', async ({ page }) => {
    // 1. Navigate to app
    await page.goto('http://localhost:1420');
    
    // 2. Wait for initial seed data
    await page.waitForSelector('[data-testid^="folder-"]');
    
    // 3. Open Settings and Add a new account
    await page.click('[data-testid="settings-button"]');
    await page.click('button:has-text("Accounts")');
    await page.click('button:has-text("Add New Account")');
    
    const newEmail = `test-${Date.now()}@test.com`;
    await page.fill('input[type="email"]', newEmail);
    // Fill display name
    await page.fill('input[value="New Account"]', 'Test Account'); 
    await page.fill('input[placeholder="Leave blank to keep current"]', 'password');
    await page.click('button:has-text("Create Account")');
    
    // Verify it appears in settings modal list
    await expect(page.locator(`[data-testid="account-item-${newEmail}"]`)).toBeVisible();
    
    // 4. Close settings and check Sidebar Account Bar
    await page.click('button:has-text("Done")');
    
    // Check for the account circle (initials should be TE from Test Account or the email)
    await expect(page.locator(`button[title="${newEmail}"]`)).toBeVisible();
    
    // 5. Test Persistence (Refresh)
    // Click the first account circle (Demo) to ensure we're on the right one
    await page.click('button[title="demo@nexus-mail.com"]');
    await page.waitForTimeout(1000); 
    
    const initialEmailCount = await page.locator('.email-item').count();
    expect(initialEmailCount).toBeGreaterThan(0);
    
    // Click Refresh
    await page.click('button:has-text("Refresh")');
    await page.waitForTimeout(3000); // Wait for sync
    
    const postRefreshCount = await page.locator('.email-item').count();
    expect(postRefreshCount).toBeGreaterThan(0); 
  });
});
