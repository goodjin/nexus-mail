import { test, expect } from '@playwright/test';

test.describe('Selection Toolbar', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        // Wait for the email list to load
        await page.waitForSelector('[data-testid^="email-card-"]');
    });

    test('should show only mark read and delete actions when emails are selected', async ({ page }) => {
        const firstCard = page.locator('[data-testid^="email-card-"]').first();
        await expect(firstCard).toBeVisible();
        const checkbox = firstCard.locator('..').locator('.rounded-full.border-2');
        await firstCard.hover();
        await checkbox.click();

        await expect(page.getByTestId('selected-count')).toContainText('1 selected');
        await expect(page.getByTestId('bulk-mark-read')).toBeVisible();
        await expect(page.getByTestId('bulk-delete')).toBeVisible();
        await expect(page.getByTitle('Select All')).toHaveCount(0);
        await expect(page.getByTitle('Invert Selection')).toHaveCount(0);
        await expect(page.getByTitle('Cancel')).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Mark unread' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Flag' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Unflag' })).toHaveCount(0);
    });

    test('should mark selected emails as read and clear the selection', async ({ page }) => {
        const badge = page.getByTestId('badge-inbox');
        const initialText = await badge.innerText();
        const initialCount = Number.parseInt(initialText, 10);

        const firstCard = page.locator('[data-testid^="email-card-"]').first();
        await firstCard.hover();
        await firstCard.locator('..').locator('.rounded-full.border-2').click();
        await expect(page.getByTestId('selected-count')).toContainText('1 selected');
        await page.getByTestId('bulk-mark-read').click();
        await expect(badge).toHaveText(String(initialCount));
        await expect(page.getByTestId('selected-count')).toHaveCount(0);
    });

    test('should delete selected emails from the simplified toolbar', async ({ page }) => {
        const firstCard = page.locator('[data-testid^="email-card-"]').first();
        const testId = await firstCard.getAttribute('data-testid');
        expect(testId).toBeTruthy();

        await firstCard.hover();
        await firstCard.locator('..').locator('.rounded-full.border-2').click();
        await expect(page.getByTestId('selected-count')).toContainText('1 selected');

        const dialogPromise = new Promise<void>((resolve) => {
            page.once('dialog', async (dialog) => {
                expect(dialog.type()).toBe('confirm');
                await dialog.accept();
                resolve();
            });
        });
        await page.getByTestId('bulk-delete').click();
        await dialogPromise;

        await expect(page.locator(`[data-testid="${testId}"]`)).toHaveCount(0);
    });
});
