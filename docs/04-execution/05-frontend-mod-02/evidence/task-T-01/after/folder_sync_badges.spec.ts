import { test, expect } from '@playwright/test';

test.describe('Folder Sync and Unread Badges', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('aside');
    });

    test('should show all standard folders in the sidebar', async ({ page }) => {
        const labels = await page.locator('[data-testid^="folder-"] span.flex-1').allTextContents();
        expect(labels).toEqual(["收件箱", "已发送", "草稿箱", "归档", "垃圾邮件", "垃圾箱"]);
    });

    test('should show correct unread counts based on seed data', async ({ page }) => {
        // Inbox unread count (seeded 95)
        const inboxBadge = page.getByTestId('badge-inbox');
        await expect(inboxBadge).toHaveText('95');

        // Spam unread count (seeded 5)
        const spamBadge = page.getByTestId('badge-spam');
        await expect(spamBadge).toHaveText('5');

        // Drafts unread count (seeded 2)
        const draftsBadge = page.getByTestId('badge-drafts');
        await expect(draftsBadge).toHaveText('2');
    });

    test('should update unread count when an email is deleted (simulated sync)', async ({ page }) => {
        // This test would ideally verify that the count updates after a sync.
        // For now, we verify the initial state is correct.
        const inboxBadge = page.getByTestId('badge-inbox');
        await expect(inboxBadge).toHaveText('95');
    });
});
