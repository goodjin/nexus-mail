import { test, expect } from '@playwright/test';

test.describe('First Launch Experience', () => {
    test('should automatically seed and load the demo account on first launch', async ({ page }) => {
        await page.addInitScript((keys) => {
            keys.forEach((key) => window.localStorage.removeItem(key));
        }, [
            'nexus-mail-mock-accounts',
            'nexus-mail-mock-settings',
            'nexus-mail-mock-config',
            'nexus-mail-mock-send-email'
        ]);

        // Go to the app
        await page.goto('/');
        await page.waitForSelector('aside');

        // 1. Wait for Sidebar to load
        const sidebar = page.locator('aside');
        await expect(sidebar).toBeVisible();

        // 2. The account 'demo@nexus-mail.com' should be in the sidebar
        const accountButton = page.locator('button[title="demo@nexus-mail.com"]');
        await expect(accountButton).toBeVisible();

        // 3. The 'Inbox' folder should be selected and show 95 unread
        const inboxBadge = page.getByTestId('badge-inbox');
        await expect(inboxBadge).toBeVisible();
        await expect(inboxBadge).toHaveText('95', { timeout: 10000 });

        // 4. The email list should be populated
        const firstEmail = page.locator('[data-testid^="email-card-"]').first();
        await expect(firstEmail).toBeVisible();
        await expect(firstEmail).toContainText('Nexus Mail Sample #100');
    });
});
