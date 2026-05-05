import { test, expect } from '@playwright/test';

test.describe('Mail List Enhancements', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:1420');
    await page.waitForSelector('[data-testid^="email-card-"]');
    await expect(page.getByTestId('folder-inbox')).toHaveClass(/bg-nexus-primary/);
  });

  test('should show list card metadata', async ({ page }) => {
    const card = page.getByTestId('email-card-98');
    await expect(card).toContainText('Nexus Mail Sample #98');
    await expect(card).toContainText('sender-98@mock.com');
    await expect(card).toContainText('Mock content for message 98');
    await expect(card).toContainText('2026-03-25');
  });

  test('should show unread indicator when scrolled to bottom', async ({ page }) => {
    const scroller = page.getByTestId('email-list-scroll');
    await scroller.evaluate((element) => element.scrollTo(0, element.scrollHeight));

    const unreadCard = page.getByTestId('email-card-1').first();
    await expect(unreadCard).toBeVisible();
    await expect(page.getByTestId('unread-indicator-1').first()).toBeVisible();
  });

  test('should open email and render detail content', async ({ page }) => {
    await page.getByTestId('email-card-98').click();

    await expect(page.getByTestId('action-delete')).toBeVisible();
    await expect(page.locator('main')).toContainText('Nexus Mail Sample #98');
    await expect(page.locator('main')).toContainText('sender-98@mock.com');
    await expect(page.locator('main')).toContainText('Mock Email Content');
  });

  test('should reset detail after deleting current email', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await page.getByTestId('email-card-98').click();
    await expect(page.getByTestId('action-delete')).toBeVisible();
    await page.getByTestId('action-delete').click();
    await expect(page.getByText('Select an email to read')).toBeVisible();
  });

  test('should keep detail open when delete confirmation is dismissed', async ({ page }) => {
    await page.getByTestId('email-card-98').click();
    await expect(page.getByTestId('action-delete')).toBeVisible();

    const dialogPromise = new Promise<string>((resolve) => {
      page.once('dialog', async (dialog) => {
        expect(dialog.type()).toBe('confirm');
        const message = dialog.message();
        await dialog.dismiss();
        resolve(message);
      });
    });
    await page.getByTestId('action-delete').click();
    await expect(dialogPromise).resolves.toBe('Move this email to trash?');

    await expect(page.getByTestId('action-delete')).toBeVisible();
    await expect(page.locator('main')).toContainText('Nexus Mail Sample #98');
  });

  test('should fallback to snippet when body is empty', async ({ page }) => {
    const emptyCard = page.getByTestId('email-card-99').first();
    await emptyCard.scrollIntoViewIfNeeded();
    await emptyCard.evaluate((node) => (node as HTMLElement).click());
    await expect(page.getByTestId('action-delete')).toBeVisible();
    await expect(page.locator('main')).toContainText('EMPTY BODY - Fallback snippet');
  });
});
