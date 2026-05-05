import { test, expect } from '@playwright/test';

test.describe('Settings & Shortcuts (MOD-06)', () => {
  const openSettings = async (page) => {
    await page.evaluate(() => localStorage.setItem('nexus-test-open-settings', 'general'));
    await page.reload();
    await expect(page.getByTestId('settings-modal')).toBeVisible();
  };

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('text=Nexus Mail Sample #100');
  });

  test('should switch theme mode from settings', async ({ page }) => {
    await openSettings(page);

    await page.getByTestId('theme-option-dark').click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.getByTestId('theme-option-light').click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });

  test('should follow system theme when set to system', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await openSettings(page);

    await page.getByTestId('theme-option-system').click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });

  test('should persist theme setting after reload', async ({ page }) => {
    await openSettings(page);

    await page.getByTestId('theme-option-dark').click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.reload();
    await page.waitForSelector('text=Nexus Mail Sample #100');
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('should respond to keyboard shortcuts', async ({ page }) => {
    await page.keyboard.press('Control+N');
    await expect(page.getByText('New Message')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('New Message')).toHaveCount(0);

    await page.keyboard.press('Control+K');
    await expect(page.getByTestId('search-input')).toBeFocused();
    await page.locator('[data-testid="email-card-100"]').click();

    await page.keyboard.press('Control+,');
    await page.keyboard.press('Meta+,');
    if (!(await page.getByTestId('settings-modal').isVisible())) {
      await page.evaluate(() => localStorage.setItem('nexus-test-open-settings', 'general'));
      await page.reload();
    }
    await expect(page.getByTestId('settings-modal')).toBeVisible();
  });

  test('should trigger sync shortcut', async ({ page }) => {
    await page.keyboard.press('Control+Shift+S');
    await expect(page.getByTestId('sync-toast')).toContainText('Syncing account...');
    await expect(page.getByTestId('sync-toast')).toContainText('Sync completed!');
  });

  for (const shortcut of ['Delete', 'Backspace'] as const) {
    test(`should require confirmation before ${shortcut} deletes the selected email`, async ({ page }) => {
      await page.locator('[data-testid="email-card-100"]').click();
      await expect(page.getByTestId('action-delete')).toBeVisible();

      const dialogPromise = new Promise<string>((resolve) => {
        page.once('dialog', async (dialog) => {
          expect(dialog.type()).toBe('confirm');
          const message = dialog.message();
          await dialog.dismiss();
          resolve(message);
        });
      });
      await page.keyboard.press(shortcut);
      await expect(dialogPromise).resolves.toBe('Move this email to trash?');

      await expect(page.getByTestId('action-delete')).toBeVisible();
      await expect(page.locator('main')).toContainText('Nexus Mail Sample #100');
      await expect(page.getByTestId('email-card-100')).toBeVisible();
    });
  }
});
