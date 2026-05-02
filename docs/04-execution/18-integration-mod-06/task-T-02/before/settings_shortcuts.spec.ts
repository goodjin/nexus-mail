import { test, expect } from '@playwright/test';

test.describe('Settings & Shortcuts (MOD-06)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('text=Nexus Mail Sample #100');
  });

  test('should switch theme mode from settings', async ({ page }) => {
    await page.locator('button[title="Settings"]').click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    await page.getByTestId('theme-option-dark').click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.getByTestId('theme-option-light').click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });

  test('should follow system theme when set to system', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.locator('button[title="Settings"]').click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    await page.getByTestId('theme-option-system').click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });

  test('should respond to keyboard shortcuts', async ({ page }) => {
    await page.keyboard.press('Control+N');
    await expect(page.getByText('New Message')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.keyboard.press('Control+K');
    await expect(page.getByTestId('search-input')).toBeFocused();
    await page.locator('[data-testid="email-card-100"]').click();

    await page.keyboard.press('Control+,');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });
});
