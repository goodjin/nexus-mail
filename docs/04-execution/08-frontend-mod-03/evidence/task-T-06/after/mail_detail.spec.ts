import { test, expect } from '@playwright/test';

test.describe('Mail List Enhancements', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:1420');
    await page.waitForSelector('[data-testid^="email-card-"]');
  });

  test('should show list card metadata', async ({ page }) => {
    const card = page.getByTestId('email-card-98');
    await expect(card).toContainText('Nexus Mail Sample #98');
    await expect(card).toContainText('sender-98@mock.com');
    await expect(card).toContainText('Mock content for message 98');
    await expect(card).toContainText('2026-03-25');
  });

  test('should show unread indicator when scrolled to bottom', async ({ page }) => {
    const scroller = page.locator('[data-virtuoso-scroller="true"]');
    await scroller.evaluate((element) => element.scrollTo(0, element.scrollHeight));

    const unreadCard = page.getByTestId('email-card-1');
    await expect(unreadCard).toBeVisible();
    await expect(unreadCard.locator('div.bg-nexus-accent.rounded-full')).toBeVisible();
  });
});
