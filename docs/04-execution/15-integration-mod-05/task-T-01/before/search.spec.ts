import { test, expect } from '@playwright/test';

test.describe('Search Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:1420');
    await expect(page.getByTestId('search-input')).toBeVisible();
  });

  test('should filter emails when searching', async ({ page }) => {
    const searchInput = page.getByTestId('search-input');
    
    // 1. Wait for the list to load
    await expect(page.locator('[data-testid^="email-card-"]').first()).toBeVisible();

    // 2. Set a sender filter and type "Project"
    await page.getByTestId('filter-sender').fill('search');
    await page.getByTestId('filter-attachments').check();
    await searchInput.fill('Project');
    
    // 3. In our mock, search_emails returns exactly one result with "Found: Project"
    await expect(page.locator('[data-testid^="email-card-"]')).toHaveCount(1);
    await expect(page.getByText('Found: Project')).toBeVisible();
    await expect(page.getByTestId('search-history-item').first()).toHaveText('Project');

    // 4. Clear search
    await page.locator('button:has(svg.lucide-x)').click();
    
    // 5. Clear history and restore list
    await page.getByTestId('search-history-clear').click();
    await expect(page.getByTestId('search-history-item')).toHaveCount(0);
    await expect(page.locator('[data-testid^="email-card-"]').first()).toBeVisible();
  });
});
