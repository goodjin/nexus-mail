import { test, expect } from '@playwright/test';

test.describe('Selection Toolbar', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        // Wait for the email list to load
        await page.waitForSelector('[data-testid^="email-card-"]');
    });

    test('should show selection toolbar when an email is selected', async ({ page }) => {
        const firstEmail = page.locator('.group').first();
        // Hover to show checkbox
        await firstEmail.hover();
        
        // Find and click the checkbox (round div)
        const checkbox = firstEmail.locator('.rounded-full.border-2');
        await checkbox.click();

        // Verify toolbar is visible
        await expect(page.getByTitle('Select All')).toBeVisible();
        await expect(page.getByTitle('Invert Selection')).toBeVisible();
        await expect(page.getByTitle('Cancel')).toBeVisible();
        
        // Verify count
        await expect(page.getByTestId('selected-count')).toContainText('1');
    });

    test('should select all emails when "Select All" is clicked', async ({ page }) => {
        // Select one first to show toolbar
        const firstEmail = page.locator('.group').first();
        await firstEmail.hover();
        await firstEmail.locator('.rounded-full.border-2').click();

        // Click Select All
        await page.getByTitle('Select All').click();

        // Verify count is 100 (based on seed data)
        await expect(page.getByTestId('selected-count')).toContainText('100');
    });

    test('should invert selection when "Invert Selection" is clicked', async ({ page }) => {
        // Select one first
        const firstEmail = page.locator('.group').first();
        await firstEmail.hover();
        await firstEmail.locator('.rounded-full.border-2').click();

        // Click Invert Selection
        await page.getByTitle('Invert Selection').click();

        // Should now have 99 selected (100 total - 1 initially selected)
        await expect(page.getByTestId('selected-count')).toContainText('99');
    });

    test('should clear selection when "Cancel" is clicked', async ({ page }) => {
        // Select one
        const firstEmail = page.locator('.group').first();
        await firstEmail.hover();
        await firstEmail.locator('.rounded-full.border-2').click();

        // Click Cancel
        await page.getByTitle('Cancel').click();

        // Toolbar should disappear
        await expect(page.getByTitle('Select All')).not.toBeVisible();
    });
});
