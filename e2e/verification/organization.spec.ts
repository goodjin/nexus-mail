import { test, expect } from '@playwright/test';
import { applyMockConfig } from '../helpers/mockConfig';

test.describe('Organization verification', () => {
  test('ORG-E2E-01 delete cancel no side effects', async ({ page }) => {
    await test.step('Select and click delete, dismiss confirm', async () => {
      await page.goto('/');
      const firstCard = page.locator('[data-testid^="email-card-"]').first();
      const testId = await firstCard.getAttribute('data-testid');
      expect(testId).toBeTruthy();
      const uid = (testId ?? '').replace('email-card-', '');
      await page.evaluate((id) => {
        document.querySelector<HTMLDivElement>(`[data-testid="email-select-${id}"]`)?.click();
      }, uid);
      const dialogPromise = new Promise<void>((resolve) => {
        page.once('dialog', async (dialog) => {
          await dialog.dismiss();
          resolve();
        });
      });
      await page.getByTestId('bulk-delete').click();
      await dialogPromise;
      await expect(page.locator(`[data-testid="${testId}"]`)).toBeVisible();
    });
    await test.step('Assert list and selection unchanged', async () => {
      await expect(page.getByTestId('selected-count')).toContainText('1 selected');
    });
  });

  test('ORG-E2E-02 multi-select drag', async ({ page }) => {
    await test.step('Select two emails and drag', async () => {
      await page.goto('/');
      const firstCard = page.locator('[data-testid^="email-card-"]').first();
      const secondCard = page.locator('[data-testid^="email-card-"]').nth(1);
      const firstId = await firstCard.getAttribute('data-testid');
      const secondId = await secondCard.getAttribute('data-testid');
      expect(firstId).toBeTruthy();
      expect(secondId).toBeTruthy();
      const firstUid = (firstId ?? '').replace('email-card-', '');
      const secondUid = (secondId ?? '').replace('email-card-', '');
      await page.evaluate(({ first, second }) => {
        document.querySelector<HTMLDivElement>(`[data-testid="email-select-${first}"]`)?.click();
        document.querySelector<HTMLDivElement>(`[data-testid="email-select-${second}"]`)?.click();
      }, { first: firstUid, second: secondUid });
      const targetFolder = page.getByTestId('folder-archive');
      const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
      await firstCard.dispatchEvent('dragstart', { dataTransfer });
      await targetFolder.dispatchEvent('dragover', { dataTransfer });
      await targetFolder.dispatchEvent('drop', { dataTransfer });
      await expect(page.locator(`[data-testid="${firstId}"]`)).toHaveCount(0);
      await expect(page.locator(`[data-testid="${secondId}"]`)).toHaveCount(0);
    });
  });

  test('ORG-E2E-03 drag to same folder no-op', async ({ page }) => {
    await test.step('Drag to current folder', async () => {
      await page.goto('/');
      const firstCard = page.locator('[data-testid^="email-card-"]').first();
      const testId = await firstCard.getAttribute('data-testid');
      expect(testId).toBeTruthy();
      const targetFolder = page.getByTestId('folder-inbox');
      const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
      await firstCard.dispatchEvent('dragstart', { dataTransfer });
      await targetFolder.dispatchEvent('dragover', { dataTransfer });
      await targetFolder.dispatchEvent('drop', { dataTransfer });
      await expect(page.locator(`[data-testid="${testId}"]`)).toBeVisible();
    });
  });

  test('ORG-E2E-04 partial failure rollback', async ({ page }) => {
    await test.step('Simulate partial delete failure', async () => {
      await applyMockConfig(page, { deleteShouldFail: true, deleteFailMessage: 'Delete failed' });
      await page.goto('/');
      const firstCard = page.locator('[data-testid^="email-card-"]').first();
      const testId = await firstCard.getAttribute('data-testid');
      expect(testId).toBeTruthy();
      const uid = (testId ?? '').replace('email-card-', '');
      await page.evaluate((id) => {
        document.querySelector<HTMLDivElement>(`[data-testid="email-select-${id}"]`)?.click();
      }, uid);
      const dialogPromise = new Promise<void>((resolve) => {
        page.once('dialog', async (dialog) => {
          await dialog.accept();
          resolve();
        });
      });
      await page.getByTestId('bulk-delete').click();
      await dialogPromise;
      await expect(page.locator(`[data-testid="${testId}"]`)).toBeVisible();
    });
    await test.step('Assert failed items remain', async () => {
      await expect(page.getByTestId('selected-count')).toContainText('1 selected');
    });
  });

  test('ORG-E2E-05 clear selection on folder switch', async ({ page }) => {
    await test.step('Select emails then change folder', async () => {
      await page.goto('/');
      const firstCard = page.locator('[data-testid^="email-card-"]').first();
      const testId = await firstCard.getAttribute('data-testid');
      const uid = (testId ?? '').replace('email-card-', '');
      await page.evaluate((id) => {
        document.querySelector<HTMLDivElement>(`[data-testid="email-select-${id}"]`)?.click();
      }, uid);
      await page.getByTestId('folder-sent').click();
    });
    await test.step('Assert selection cleared', async () => {
      await expect(page.getByTestId('selected-count')).toHaveCount(0);
    });
  });

  test('ORG-E2E-06 undo bulk delete restores items', async ({ page }) => {
    await test.step('Delete selected email', async () => {
      await page.goto('/');
      const firstCard = page.locator('[data-testid^="email-card-"]').first();
      const testId = await firstCard.getAttribute('data-testid');
      expect(testId).toBeTruthy();
      const uid = (testId ?? '').replace('email-card-', '');
      await page.evaluate((id) => {
        document.querySelector<HTMLDivElement>(`[data-testid="email-select-${id}"]`)?.click();
      }, uid);
      const dialogPromise = new Promise<void>((resolve) => {
        page.once('dialog', async (dialog) => {
          await dialog.accept();
          resolve();
        });
      });
      await page.getByTestId('bulk-delete').click();
      await dialogPromise;
      await expect(page.locator(`[data-testid="${testId}"]`)).toHaveCount(0);
    });
    await test.step('Undo deletion', async () => {
      await expect(page.getByTestId('bulk-undo-toast')).toBeVisible();
      await page.getByTestId('bulk-undo-button').click();
      await expect(page.locator('[data-testid^="email-card-"]').first()).toBeVisible();
    });
  });

  test('ORG-E2E-07 undo move restores items', async ({ page }) => {
    await test.step('Move selected emails', async () => {
      await page.goto('/');
      const firstCard = page.locator('[data-testid^="email-card-"]').first();
      const secondCard = page.locator('[data-testid^="email-card-"]').nth(1);
      const firstId = await firstCard.getAttribute('data-testid');
      const secondId = await secondCard.getAttribute('data-testid');
      expect(firstId).toBeTruthy();
      expect(secondId).toBeTruthy();
      const firstUid = (firstId ?? '').replace('email-card-', '');
      const secondUid = (secondId ?? '').replace('email-card-', '');
      await page.evaluate(({ first, second }) => {
        document.querySelector<HTMLDivElement>(`[data-testid="email-select-${first}"]`)?.click();
        document.querySelector<HTMLDivElement>(`[data-testid="email-select-${second}"]`)?.click();
      }, { first: firstUid, second: secondUid });
      const targetFolder = page.getByTestId('folder-archive');
      const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
      await firstCard.dispatchEvent('dragstart', { dataTransfer });
      await targetFolder.dispatchEvent('dragover', { dataTransfer });
      await targetFolder.dispatchEvent('drop', { dataTransfer });
      await expect(page.locator(`[data-testid="${firstId}"]`)).toHaveCount(0);
      await expect(page.locator(`[data-testid="${secondId}"]`)).toHaveCount(0);
    });
    await test.step('Undo move', async () => {
      await expect(page.getByTestId('bulk-undo-toast')).toBeVisible();
      await page.getByTestId('bulk-undo-button').click();
      await expect(page.locator('[data-testid^="email-card-"]').first()).toBeVisible();
    });
  });

  test('ORG-E2E-08 undo mark read restores unread state', async ({ page }) => {
    await test.step('Load unread emails', async () => {
      await applyMockConfig(page, { emailCount: 5 });
      await page.goto('/');
      await page.getByTestId('email-card-5').waitFor();
      await page.evaluate(() => {
        document.querySelector<HTMLDivElement>('[data-testid="email-select-5"]')?.click();
      });
      await expect(page.getByTestId('selected-count')).toContainText('1 selected');
    });
    await test.step('Mark read and undo', async () => {
      await expect(page.getByTestId('unread-indicator-5').first()).toBeVisible();
      await page.getByTestId('bulk-mark-read').click({ force: true });
      await expect(page.getByTestId('unread-indicator-5')).toHaveCount(0);
      await expect(page.getByTestId('bulk-undo-toast')).toBeVisible();
      await page.getByTestId('bulk-undo-button').click();
      await expect(page.getByTestId('unread-indicator-5').first()).toBeVisible();
    });
  });

  test('ORG-E2E-09 undo toast expires after timeout', async ({ page }) => {
    await test.step('Set short timeout and delete', async () => {
      await page.goto('/');
      await page.evaluate(() => {
        window.localStorage.setItem('nexus-mail-undo-timeout-ms', '200');
      });
      const firstCard = page.locator('[data-testid^="email-card-"]').first();
      const testId = await firstCard.getAttribute('data-testid');
      expect(testId).toBeTruthy();
      const uid = (testId ?? '').replace('email-card-', '');
      await page.evaluate((id) => {
        document.querySelector<HTMLDivElement>(`[data-testid="email-select-${id}"]`)?.click();
      }, uid);
      const dialogPromise = new Promise<void>((resolve) => {
        page.once('dialog', async (dialog) => {
          await dialog.accept();
          resolve();
        });
      });
      await page.getByTestId('bulk-delete').click();
      await dialogPromise;
      await expect(page.getByTestId('bulk-undo-toast')).toBeVisible();
      await page.waitForTimeout(300);
      await expect(page.getByTestId('bulk-undo-toast')).toHaveCount(0);
      await expect(page.locator(`[data-testid="${testId}"]`)).toHaveCount(0);
    });
  });
});
