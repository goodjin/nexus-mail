import { test, expect } from '@playwright/test';

test.describe('UX Enhancement (M30)', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:1420');
        await page.waitForSelector('text=Nexus Mail Sample #100');
    });

    test('should only render a subset of emails due to virtualization', async ({ page }) => {
        // Since there are 100 emails in the mock, virtualization should limit 
        // the number of rendered cards to something like 10-20.
        const renderedCount = await page.locator('[data-testid^="email-card-"]').count();
        console.log(`Rendered cards: ${renderedCount}`);
        expect(renderedCount).toBeLessThan(40); 
    });

    test('should allow multi-selecting emails and showing bulk actions', async ({ page }) => {
        const firstEmail = page.locator('[data-testid="email-card-100"]');
        await firstEmail.hover();
        
        const checkbox1 = firstEmail.locator('input[type="checkbox"]');
        await expect(checkbox1).toBeVisible();
        await checkbox1.click();

        const secondEmail = page.locator('[data-testid="email-card-99"]');
        await secondEmail.hover();
        await secondEmail.locator('input[type="checkbox"]').click();

        await expect(page.locator('[data-testid="selected-count"]')).toHaveText('2');
        await page.click('button:has(svg.lucide-x)');
        await expect(page.locator('[data-testid="selected-count"]')).not.toBeVisible();
    });

    test('should show optimistic UI for flagging', async ({ page }) => {
        const email = page.locator('[data-testid="email-card-100"]');
        await email.click();
        
        const flagButton = page.locator('[data-testid="action-flag"]');
        await flagButton.click();
        
        // Check for the flag indicator on the card (optimistically updated)
        const flagIndicator = email.locator('.bg-nexus-accent.rounded-bl-full');
        await expect(flagIndicator).toBeVisible();
    });

    test('should trigger load more on scroll in virtuoso', async ({ page }) => {
        // Virtuoso scroller is the parent with overflow-y: auto inside the flex-1
        const scroller = page.locator('[data-virtuoso-scroller="true"]');
        
        // Scroll to bottom
        await scroller.evaluate(e => e.scrollTo(0, e.scrollHeight));
        
        // Should fetch more items
        await expect(async () => {
            const lastItem = page.locator('[data-testid="email-card-1"]'); // Last item of first 100
            await expect(lastItem).toBeVisible();
        }).toPass();
    });
});
