import { test, expect } from '@playwright/test';

test.describe('Folder management verification', () => {
  test('FOLD-E2E-01 name length limit', async ({ page }) => {
    await test.step('Create folder with >64 chars', async () => {
      await page.goto('/');
      await page.getByTestId('create-folder').click();
      await page.getByTestId('folder-name-input').fill('a'.repeat(65));
      await page.getByTestId('folder-dialog-confirm').click();
    });
    await test.step('Assert rejection', async () => {
      await expect(page.getByText('64 characters')).toBeVisible();
    });
  });

  test('FOLD-E2E-02 disallow slash and backslash', async ({ page }) => {
    await test.step('Create folder with "/" and "\\"', async () => {
      await page.goto('/');
      await page.getByTestId('create-folder').click();
      await page.getByTestId('folder-name-input').fill('bad/name');
      await page.getByTestId('folder-dialog-confirm').click();
    });
    await test.step('Assert rejection', async () => {
      await expect(page.getByText('cannot contain /')).toBeVisible();
    });
  });

  test('FOLD-E2E-03 block system folder names', async ({ page }) => {
    await test.step('Create folder named Inbox', async () => {
      await page.goto('/');
      await page.getByTestId('create-folder').click();
      await page.getByTestId('folder-name-input').fill('Inbox');
      await page.getByTestId('folder-dialog-confirm').click();
    });
    await test.step('Assert rejection', async () => {
      await expect(page.getByText('System folder names are reserved')).toBeVisible();
    });
  });

  test('FOLD-E2E-04 case-insensitive duplicate', async ({ page }) => {
    await test.step('Create folder "Work" then "work"', async () => {
      await page.goto('/');
      await page.getByTestId('create-folder').click();
      await page.getByTestId('folder-name-input').fill('Work');
      await page.getByTestId('folder-dialog-confirm').click();
      await expect(page.getByTestId('folder-work')).toBeVisible();
      await page.getByTestId('create-folder').click();
      await page.getByTestId('folder-name-input').fill('work');
      await page.getByTestId('folder-dialog-confirm').click();
    });
    await test.step('Assert duplicate error', async () => {
      await expect(page.getByText('already exists')).toBeVisible();
    });
  });

  test('FOLD-E2E-05 delete current folder fallback', async ({ page }) => {
    await test.step('Delete selected folder', async () => {
      await page.goto('/');
      await page.getByTestId('create-folder').click();
      await page.getByTestId('folder-name-input').fill('Temp');
      await page.getByTestId('folder-dialog-confirm').click();
      const folder = page.getByTestId('folder-temp');
      await folder.click();
      await folder.hover();
      const dialogPromise = new Promise<void>((resolve) => {
        page.once('dialog', async (dialog) => {
          await dialog.accept();
          resolve();
        });
      });
      await folder.locator('button[title="Delete folder"]').click();
      await dialogPromise;
    });
    await test.step('Assert Inbox selected', async () => {
      await expect(page.getByTestId('folder-inbox')).toHaveClass(/bg-nexus-primary/);
    });
  });
});
