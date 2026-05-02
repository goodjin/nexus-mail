import { test, expect } from '@playwright/test';

test.describe('Selection Toolbar', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        // Wait for the email list to load
        await page.waitForSelector('[data-testid^="email-card-"]');
    });

    test('should show selection toolbar when an email is selected', async ({ page }) => {
        const firstCard = page.locator('[data-testid^="email-card-"]').first();
        await expect(firstCard).toBeVisible();
        const checkbox = firstCard.locator('..').locator('.rounded-full.border-2');
        await firstCard.hover();
        await checkbox.click();

        // Verify toolbar is visible
        await expect(page.getByTitle('Select All')).toBeVisible();
        await expect(page.getByTitle('Invert Selection')).toBeVisible();
        await expect(page.getByTitle('Cancel')).toBeVisible();
        
        // Verify count
        await expect(page.getByTestId('selected-count')).toContainText('1 selected');
    });

    test('should select all emails when "Select All" is clicked', async ({ page }) => {
        // Select one first to show toolbar
        const firstCard = page.locator('[data-testid^="email-card-"]').first();
        await firstCard.hover();
        await firstCard.locator('..').locator('.rounded-full.border-2').click();

        // Click Select All
        await page.getByTitle('Select All').click();

        const selectedText = await page.getByTestId('selected-count').innerText();
        const selectedCount = Number.parseInt(selectedText, 10);
        expect(selectedCount).toBeGreaterThan(1);
    });

    test('should invert selection when "Invert Selection" is clicked', async ({ page }) => {
        // Select one first
        const firstCard = page.locator('[data-testid^="email-card-"]').first();
        await firstCard.hover();
        await firstCard.locator('..').locator('.rounded-full.border-2').click();

        // Click Invert Selection
        await page.getByTitle('Invert Selection').click();

        const selectedText = await page.getByTestId('selected-count').innerText();
        const selectedCount = Number.parseInt(selectedText, 10);
        expect(selectedCount).toBeGreaterThan(0);
    });

    test('should clear selection when "Cancel" is clicked', async ({ page }) => {
        // Select one
        const firstCard = page.locator('[data-testid^="email-card-"]').first();
        await firstCard.hover();
        await firstCard.locator('..').locator('.rounded-full.border-2').click();

        // Click Cancel
        await page.getByTitle('Cancel').evaluate((node) => (node as HTMLElement).click());

        // Toolbar should disappear
        await expect(page.getByTestId('selected-count')).toHaveCount(0);
    });

    test('should apply bulk actions and update list/badge', async ({ page }) => {
        const badge = page.getByTestId('badge-inbox');
        const initialText = await badge.innerText();
        const initialCount = Number.parseInt(initialText, 10);

        const firstCard = page.locator('[data-testid^="email-card-"]').first();
        const testId = await firstCard.getAttribute('data-testid');
        expect(testId).toBeTruthy();

        await firstCard.hover();
        await firstCard.locator('..').locator('.rounded-full.border-2').click();
        await expect(page.getByTestId('selected-count')).toContainText('1 selected');
        await page.getByRole('button', { name: 'Mark unread' }).click();
        await expect(badge).toHaveText(String(initialCount + 1));

        await firstCard.hover();
        await firstCard.locator('..').locator('.rounded-full.border-2').click();
        await expect(page.getByTestId('selected-count')).toContainText('1 selected');
        await page.getByRole('button', { name: 'Mark read' }).click();
        await expect(badge).toHaveText(String(initialCount));

        await page.evaluate(() => {
            window.confirm = () => true;
        });
        await firstCard.hover();
        await firstCard.locator('..').locator('.rounded-full.border-2').click();
        await expect(page.getByTestId('selected-count')).toContainText('1 selected');
        await page.getByTitle('Delete').evaluate((node) => (node as HTMLButtonElement).click());

        await expect(page.locator(`[data-testid="${testId}"]`)).toHaveCount(0);
    });
});
