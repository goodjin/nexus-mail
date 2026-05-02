import { test, expect } from '@playwright/test';

test.describe('Search Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:1420');
    await expect(page.getByTestId('search-input')).toBeVisible();
  });

  test('should return matching results for search query', async ({ page }) => {
    const searchInput = page.getByTestId('search-input');

    await expect(page.locator('[data-testid^="email-card-"]').first()).toBeVisible();
    await searchInput.fill('Project');

    const firstCard = page.locator('[data-testid^="email-card-"]').first();
    await expect(page.locator('[data-testid^="email-card-"]')).toHaveCount(1);
    await expect(firstCard.getByRole('heading', { name: 'Found: Project' })).toBeVisible();
  });

  test('should show empty state when no results found', async ({ page }) => {
    const searchInput = page.getByTestId('search-input');

    await expect(page.locator('[data-testid^="email-card-"]').first()).toBeVisible();
    await searchInput.fill('NoMatch');

    await expect(page.locator('[data-testid^="email-card-"]')).toHaveCount(0);
    await expect(page.getByText('No matching messages')).toBeVisible();
  });

  test('should keep only the search input above the list', async ({ page }) => {
    const searchInput = page.getByTestId('search-input');

    await expect(page.locator('[data-testid^="email-card-"]').first()).toBeVisible();
    await searchInput.fill('Project');

    const firstCard = page.locator('[data-testid^="email-card-"]').first();
    await expect(page.locator('[data-testid^="email-card-"]')).toHaveCount(1);
    await expect(firstCard.getByRole('heading', { name: 'Found: Project' })).toBeVisible();
    await expect(page.getByTestId('filter-sender')).toHaveCount(0);
    await expect(page.getByTestId('filter-start-date')).toHaveCount(0);
    await expect(page.getByTestId('filter-end-date')).toHaveCount(0);
    await expect(page.getByTestId('filter-attachments')).toHaveCount(0);
    await expect(page.getByTestId('filter-folder-scope')).toHaveCount(0);
    await expect(page.getByTestId('search-history-item')).toHaveCount(0);
    await expect(page.getByTestId('search-history-clear')).toHaveCount(0);
  });
});
