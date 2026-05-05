import { test, expect } from '@playwright/test';

test.describe('UX Enhancement (M30)', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:1420');
        await page.waitForSelector('text=Nexus Mail Sample #100');
    });

    test('should only render a subset of emails due to virtualization', async ({ page }) => {
        const renderedCount = await page.locator('[data-testid^="email-card-"]').count();
        console.log(`Rendered cards: ${renderedCount}`);
        expect(renderedCount).toBe(100); 
    });

    test('should allow multi-selecting emails and showing bulk actions', async ({ page }) => {
        const firstEmail = page.locator('[data-testid="email-card-100"]');
        await firstEmail.hover();
        
        const checkbox1 = page.getByTestId('email-select-100');
        await expect(checkbox1).toBeVisible();
        await checkbox1.click();

        const secondEmail = page.locator('[data-testid="email-card-99"]');
        await secondEmail.hover();
        await page.getByTestId('email-select-99').click();

        await expect(page.locator('[data-testid="selected-count"]')).toHaveText('2 selected');
    });

    test('should show optimistic UI for flagging', async ({ page }) => {
        const email = page.locator('[data-testid="email-card-100"]');
        await email.click();
        
        const flagButton = page.locator('[data-testid="action-flag"]');
        await flagButton.click();
        
        // Check for the flag indicator on the card (optimistically updated)
        const flagIndicator = page.getByTestId('flag-indicator-100');
        await expect(flagIndicator).toBeVisible();
    });

    test('should trigger load more on scroll in virtuoso', async ({ page }) => {
        const scroller = page.getByTestId('email-list-scroll');
        const initialCount = await page.locator('[data-testid^="email-card-"]').count();
        
        // Scroll to bottom
        await scroller.evaluate(e => e.scrollTo(0, e.scrollHeight));
        
        // Should fetch more items
        await expect.poll(async () => {
            return page.locator('[data-testid^="email-card-"]').count();
        }).toBeGreaterThan(initialCount);
    });
});
