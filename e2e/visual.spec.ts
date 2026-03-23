import { test, expect } from '@playwright/test';

test.describe('Visual Regression Testing', () => {
  test('Dashboard should match baseline', async ({ page }) => {
    // Navigate to the app (running via Vite dev server)
    await page.goto('/');
    
    // Wait for the mock data to render
    await page.waitForSelector('text=Nexus');
    await page.waitForSelector('text=Inbox');
    await page.waitForSelector('text=Nexus Mail Sample #100');
    
    // Take a screenshot of the entire page and compare it to the baseline
    // The first time this runs, it will create the baseline.
    // Subsequent runs will compare against it.
    await expect(page).toHaveScreenshot('dashboard-main.png', {
      maxDiffPixelRatio: 0.05, // Allow for small rendering variations
      fullPage: true,
    });
  });

  test('Sidebar should be consistent', async ({ page }) => {
    await page.goto('/');
    const sidebar = page.locator('aside');
    await expect(sidebar).toHaveScreenshot('sidebar.png');
  });

  test('Email List should be consistent', async ({ page }) => {
    await page.goto('/');
    const list = page.locator('section'); // EmailList is a <section>
    await expect(list).toHaveScreenshot('email-list.png');
  });
});
