import { test, expect } from '@playwright/test';

test.describe('First Launch Experience', () => {
    test('should automatically seed and load the demo account on first launch', async ({ page }) => {
        // Go to the app
        await page.goto('/');

        // 1. Open Settings and Reset
        await page.locator('button:has(svg.lucide-settings)').click();
        await expect(page.getByText('Settings')).toBeVisible();
        
        // Click Reset and Handle Dialog
        page.on('dialog', dialog => dialog.accept());
        await page.getByRole('button', { name: /Clear Local Cache/i }).click();

        // App should reload. Wait for it.
        await page.waitForURL('**/');
        await page.waitForSelector('aside');

        // 1. Wait for Sidebar to load
        const sidebar = page.locator('aside');
        await expect(sidebar).toBeVisible();

        // 2. The account 'demo@nexus-mail.com' should be in the select dropdown
        const accountSelect = page.locator('select');
        await expect(accountSelect).toContainText('demo@nexus-mail.com');

        // 3. The 'Inbox' folder should be selected and show 100 unread
        const inboxBadge = page.getByTestId('badge-inbox');
        await expect(inboxBadge).toBeVisible();
        await expect(inboxBadge).toHaveText('100', { timeout: 10000 });

        // 4. The email list should be populated
        const firstEmail = page.locator('[data-testid^="email-card-"]').first();
        await expect(firstEmail).toBeVisible();
        await expect(firstEmail).toContainText('Nexus Mail Sample #100');
    });
});
