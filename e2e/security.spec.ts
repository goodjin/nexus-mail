import { test, expect } from '@playwright/test';

test.describe('Security & XSS Validation', () => {
  test('should sanitize malicious HTML in email body', async ({ page }) => {
    await page.goto('http://localhost:1420');
    
    // 1. Find the malicious email
    const maliciousEmail = page.locator('[data-testid^="email-card-"]').filter({ hasText: 'SECURITY TEST' });
    await expect(maliciousEmail).toBeVisible();
    
    // 2. Open it
    await maliciousEmail.click();
    
    // 3. Verify content rendering
    await expect(page.getByText('Safe Title')).toBeVisible();
    
    // 4. Check if XSS was executed
    // Our mock XSS payload sets `window.XSS_EXECUTED = true`
    const isXssExecuted = await page.evaluate(() => (window as any).XSS_EXECUTED === true);
    expect(isXssExecuted).toBeFalsy();
    
    // 5. Verify script tags are removed from DOM
    const scriptCount = await page.locator('main').locator('script').count();
    expect(scriptCount).toBe(0);
    
    // 6. Verify image onerror is removed
    const imgOnerror = await page.locator('main').locator('img').getAttribute('onerror');
    expect(imgOnerror).toBeNull();
  });
});
