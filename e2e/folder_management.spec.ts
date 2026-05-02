import { test, expect } from '@playwright/test';

test.describe('Folder management', () => {
  test('should create, rename, and delete a custom folder with Inbox fallback', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="folder-inbox"]');

    await page.getByTestId('create-folder').click();
    await page.getByTestId('folder-name-input').fill('Projects');
    await page.getByTestId('folder-dialog-confirm').click();

    const createdFolder = page.getByTestId('folder-projects');
    await expect(createdFolder).toBeVisible();
    await expect(createdFolder).toHaveClass(/bg-nexus-primary/);

    await createdFolder.hover();
    await createdFolder.locator('button[title="Rename folder"]').click();
    await page.getByTestId('folder-name-input').fill('Projects-2');
    await page.getByTestId('folder-dialog-confirm').click();

    const renamedFolder = page.getByTestId('folder-projects-2');
    await expect(renamedFolder).toBeVisible();
    await expect(createdFolder).toHaveCount(0);

    await renamedFolder.hover();
    const dialogPromise = new Promise<void>((resolve) => {
      page.once('dialog', async (dialog) => {
        expect(dialog.type()).toBe('confirm');
        await dialog.accept();
        resolve();
      });
    });
    await renamedFolder.locator('button[title="Delete folder"]').click();
    await dialogPromise;

    await expect(renamedFolder).toHaveCount(0);
    await expect(page.getByTestId('folder-inbox')).toHaveClass(/bg-nexus-primary/);
  });
});
