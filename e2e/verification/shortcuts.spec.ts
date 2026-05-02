import { test, expect } from '@playwright/test';
import { testIds } from '../helpers/testIds';

test.describe('Shortcut map & bindings', () => {
  test('SCT-E2E-01 shortcut map toggles', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', shiftKey: true }));
    });
    await expect(page.getByTestId(testIds.shortcutMap)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId(testIds.shortcutMap)).toHaveCount(0);
  });

  test('SCT-E2E-02 compose/search/reply shortcuts', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true }));
    });
    await expect(page.getByText('New Message')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    });
    await expect(page.getByTestId(testIds.searchInput)).toBeFocused();

    await page.getByTestId('email-card-100').click();
    await page.keyboard.press('r');
    await expect(page.getByText('New Message')).toBeVisible();
    await expect(page.getByTestId(testIds.composeTo)).toHaveValue('sender-100@mock.com');
    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  test('SCT-E2E-03 mark read shortcut', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('email-card-100').click();
    await page.waitForFunction(() => Boolean((window as any).__nexusTest?.getFirstEmail));
    const initialFlags = await page.evaluate(() => (window as any).__nexusTest?.getFirstEmail?.()?.flags ?? []);
    await page.keyboard.press('m');
    await page.waitForFunction((before) => {
      const flags = (window as any).__nexusTest?.getFirstEmail?.()?.flags ?? [];
      return flags.join(',') !== before;
    }, (initialFlags as string[]).join(','));
  });

  test('SCT-E2E-05 navigation shortcuts', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('email-card-100').click();
    const heading = page.locator('main > header h1');
    await expect(heading).toContainText('#100');
    await page.keyboard.press('ArrowDown');
    await expect(heading).toContainText('#99');
  });

  test('SCT-E2E-04 delete shortcut prompts confirmation', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('email-card-100').click();
    const dialogPromise = new Promise<void>((resolve) => {
      page.once('dialog', async (dialog) => {
        expect(dialog.type()).toBe('confirm');
        await dialog.dismiss();
        resolve();
      });
    });
    await page.keyboard.press('Delete');
    await dialogPromise;
    await expect(page.getByTestId('email-card-100')).toBeVisible();
  });
});
