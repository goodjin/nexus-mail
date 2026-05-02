import { test, expect } from '@playwright/test';

test.describe('Search Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:1420');
    await expect(page.getByTestId('search-input')).toBeVisible();
  });

  test('should filter emails when searching', async ({ page }) => {
    const searchInput = page.getByTestId('search-input');
    
    // 1. Initially should have 100 emails (from our mock)
    // Wait for the list to load
    await expect(page.locator('[data-testid^="email-card-"]')).toHaveCount(100);

    // 2. Type "Project"
    await searchInput.fill('Project');
    
    // 3. In our mock, search_emails returns exactly one result with "Found: Project"
    await expect(page.locator('[data-testid^="email-card-"]')).toHaveCount(1);
    await expect(page.getByText('Found: Project')).toBeVisible();

    // 4. Clear search
    await page.locator('button:has(svg.lucide-x)').click();
    
    // 5. Should restore to 100 emails
    await expect(page.locator('[data-testid^="email-card-"]')).toHaveCount(100);
  });
});
