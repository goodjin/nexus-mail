import { test, expect } from '@playwright/test';
import { setMockSmartInbox } from '../helpers/mockData';

test.describe('UX verification', () => {
  test('UX-VRT-01 dark theme baseline', async ({ page }) => {
    await test.step('Switch to dark theme and capture baseline', async () => {
      await page.addInitScript(() => {
        window.localStorage.setItem('nexus-test-open-settings', 'general');
      });
      await page.goto('/');
      await expect(page.getByTestId('settings-modal')).toBeVisible();
      await page.getByTestId('theme-option-dark').click();
      const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      expect(isDark).toBe(true);
    });
  });

  test('UX-E2E-01 context inheritance', async ({ page }) => {
    await test.step('Open detail then reply', async () => {
      await page.goto('/');
      await page.getByTestId('email-card-100').click();
      await page.getByRole('button', { name: 'Reply' }).click();
    });
    await test.step('Assert compose account matches context', async () => {
      await expect(page.getByTestId('compose-from')).toHaveText('demo@nexus-mail.com');
    });
  });

  test('UX-E2E-02 system folder protection', async ({ page }) => {
    await test.step('Attempt rename/delete on Inbox', async () => {
      await page.goto('/');
      const inbox = page.getByTestId('folder-inbox');
      await inbox.hover();
      await expect(inbox.locator('button[title="Rename folder"]')).toHaveCount(0);
      await expect(inbox.locator('button[title="Delete folder"]')).toHaveCount(0);
    });
  });

  test('UX-SI-01 smart inbox groups and priority view', async ({ page }) => {
    const now = Date.now();
    await setMockSmartInbox(page, {
      'demo@nexus-mail.com': {
        items: [
          {
            id: 'smart-1',
            uid: '100',
            account_id: 'demo@nexus-mail.com',
            folder_id: 'demo@nexus-mail.com::inbox',
            subject: 'Board deck review',
            from: 'ceo@demo.com',
            date: new Date(now - 1000 * 60).toISOString(),
            flags: [],
            category: 'important',
          },
          {
            id: 'smart-2',
            uid: '99',
            account_id: 'demo@nexus-mail.com',
            folder_id: 'demo@nexus-mail.com::inbox',
            subject: 'Team lunch',
            from: 'hr@demo.com',
            date: new Date(now - 1000 * 120).toISOString(),
            flags: ['\\Seen'],
            category: 'personal',
          },
          {
            id: 'smart-3',
            uid: '98',
            account_id: 'demo@nexus-mail.com',
            folder_id: 'demo@nexus-mail.com::inbox',
            subject: 'System alert',
            from: 'alerts@demo.com',
            date: new Date(now - 1000 * 180).toISOString(),
            flags: [],
            category: 'notifications',
          },
          {
            id: 'smart-4',
            uid: '97',
            account_id: 'demo@nexus-mail.com',
            folder_id: 'demo@nexus-mail.com::inbox',
            subject: 'Weekly digest',
            from: 'newsletter@demo.com',
            date: new Date(now - 1000 * 240).toISOString(),
            flags: ['\\Seen'],
            category: 'newsletters',
          },
          {
            id: 'smart-5',
            uid: '96',
            account_id: 'demo@nexus-mail.com',
            folder_id: 'demo@nexus-mail.com::inbox',
            subject: 'Low priority update',
            from: 'updates@demo.com',
            date: new Date(now - 1000 * 300).toISOString(),
            flags: [],
            category: 'low_priority',
          },
        ],
      },
    });

    await test.step('Open smart inbox and verify groups', async () => {
      await page.goto('/');
      await page.getByTestId('smart-inbox-nav').click();
      await expect(page.getByTestId('smart-inbox-group-unread-important')).toHaveText('1');
      await expect(page.getByTestId('smart-inbox-group-unread-notifications')).toHaveText('1');
      await expect(page.getByTestId('smart-inbox-group-unread-low_priority')).toHaveText('1');
    });

    await test.step('Verify priority items rendered', async () => {
      await expect(page.getByTestId('smart-inbox-item-smart-1')).toBeVisible();
      await expect(page.getByTestId('smart-inbox-item-smart-2')).toBeVisible();
    });
  });

  test('UX-SI-02 smart inbox override updates groups', async ({ page }) => {
    const now = Date.now();
    await setMockSmartInbox(page, {
      'demo@nexus-mail.com': {
        items: [
          {
            id: 'smart-1',
            uid: '100',
            account_id: 'demo@nexus-mail.com',
            folder_id: 'demo@nexus-mail.com::inbox',
            subject: 'Board deck review',
            from: 'ceo@demo.com',
            date: new Date(now - 1000 * 60).toISOString(),
            flags: [],
            category: 'important',
          },
          {
            id: 'smart-2',
            uid: '99',
            account_id: 'demo@nexus-mail.com',
            folder_id: 'demo@nexus-mail.com::inbox',
            subject: 'Team lunch',
            from: 'hr@demo.com',
            date: new Date(now - 1000 * 120).toISOString(),
            flags: [],
            category: 'personal',
          },
        ],
      },
    });
    await page.goto('/');
    await page.getByTestId('smart-inbox-nav').click();
    await page.getByTestId('smart-inbox-override-important-smart-2').click();
    await expect(page.getByTestId('smart-inbox-group-unread-important')).toHaveText('2');
    await expect(page.getByTestId('smart-inbox-group-unread-personal')).toHaveText('0');
  });
});
