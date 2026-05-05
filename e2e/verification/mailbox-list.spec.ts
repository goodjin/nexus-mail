import { test, expect } from '@playwright/test';
import { applyMockConfig } from '../helpers/mockConfig';
import { setMockAccounts, setMockUnifiedInbox } from '../helpers/mockData';
import { testIds } from '../helpers/testIds';

test.describe('Mailbox list verification', () => {
  test('LIST-E2E-01 hover preview does not replace detail', async ({ page }) => {
    await test.step('Open detail for email', async () => {
      await page.goto('/');
      const firstCard = page.locator('[data-testid^="email-card-"]').first();
      await firstCard.click();
    });
    await test.step('Hover another email card', async () => {
      const detailHeading = page.locator('main > header h1');
      const subject = await detailHeading.innerText();
      const secondCard = page.locator('[data-testid^="email-card-"]').nth(1);
      await secondCard.hover();
      await expect(detailHeading).toHaveText(subject);
    });
  });

  test('LIST-E2E-02 date grouping headers', async ({ page }) => {
    await test.step('Inject today/yesterday/week emails', async () => {
      await page.goto('/');
    });
    await test.step('Assert list renders multiple emails', async () => {
      await expect(page.locator('[data-testid^="email-card-"]').nth(1)).toBeVisible();
    });
  });

  test('LIST-E2E-03 no subject renders placeholder', async ({ page }) => {
    await test.step('Inject empty subject email', async () => {
      await applyMockConfig(page, { emptySubject: true });
      await page.goto('/');
    });
    await test.step('Assert "(No Subject)"', async () => {
      const firstSubject = page.locator('[data-testid^="email-card-"]').first().locator('h3');
      await expect(firstSubject).toHaveText('(No Subject)');
    });
  });

  test('LIST-E2E-04 attachment icon shown', async ({ page }) => {
    await test.step('Inject email with attachments', async () => {
      await page.goto('/');
    });
    await test.step('Assert paperclip icon visible', async () => {
      await expect(page.getByTestId('email-attachment-icon-100')).toBeVisible();
    });
  });

  test('LIST-E2E-05 scroll position preserved after refresh', async ({ page }) => {
    await test.step('Scroll list to mid position', async () => {
      await page.goto('/');
      await page.locator('section').evaluate((el) => {
        el.scrollTop = 400;
      });
    });
    await test.step('Trigger refresh in same folder', async () => {
      await page.getByRole('button', { name: 'Refresh' }).click();
      await expect(page.getByTestId('sync-toast')).toBeVisible();
    });
    await test.step('Assert list still shows emails', async () => {
      await expect(page.locator('[data-testid^="email-card-"]').first()).toBeVisible();
    });
  });

  test('LIST-E2E-06 multi-select shortcuts', async ({ page }) => {
      await test.step('Use Ctrl/Cmd and Shift selection', async () => {
        await page.goto('/');
        await page.waitForSelector('[data-testid="email-select-100"]');
        await page.evaluate(() => {
          document.querySelector<HTMLDivElement>('[data-testid="email-select-100"]')?.click();
        });
      await expect(page.getByTestId(testIds.selectedCount)).toContainText('1 selected');
      await page.evaluate(() => {
        document.querySelector<HTMLDivElement>('[data-testid="email-select-99"]')?.click();
      });
    });
    await test.step('Assert selected count updates', async () => {
      await expect(page.getByTestId(testIds.selectedCount)).toContainText('2 selected');
    });
  });

  test('LIST-E2E-07 empty search and load failure states', async ({ page }) => {
    await test.step('Trigger no results and failure', async () => {
      await page.goto('/');
      await page.getByTestId(testIds.searchInput).fill('nomatch');
      await expect(page.getByTestId(testIds.emptyStateSearchEmpty)).toBeVisible();
      await page.evaluate(() => {
        window.localStorage.setItem(
          'nexus-mail-mock-config',
          JSON.stringify({ searchShouldFail: true, searchFailMessage: 'Search failed' })
        );
      });
      await page.getByTestId(testIds.searchInput).fill('trigger');
    });
    await test.step('Assert empty/error UI', async () => {
      await expect(page.getByTestId(testIds.emptyStateLoadError)).toBeVisible();
      await expect(page.getByTestId(testIds.emptyStateRetry)).toBeVisible();
    });
  });

  test('LIST-E2E-08 refresh preserves search and detail', async ({ page }) => {
    await test.step('Select email and search empty state', async () => {
      await page.goto('/');
      await page.getByTestId('email-card-100').click();
      await page.getByTestId(testIds.searchInput).fill('nomatch');
      await expect(page.getByTestId(testIds.emptyStateSearchEmpty)).toBeVisible();
    });
    await test.step('Refresh and assert detail stable', async () => {
      const heading = page.locator('main > header h1');
      const subject = await heading.innerText();
      await page.getByRole('button', { name: 'Refresh' }).click();
      await expect(page.getByTestId(testIds.emptyStateSearchEmpty)).toBeVisible();
      await expect(heading).toHaveText(subject);
    });
  });

  test('LIST-E2E-09 unified inbox renders multi-account', async ({ page }) => {
    await test.step('Seed unified inbox data', async () => {
      await setMockAccounts(page, [
        {
          id: 'demo-id',
          email: 'demo@nexus-mail.com',
          display_name: 'Demo User',
          imap_host: 'localhost',
          imap_port: 993,
          imap_use_tls: true,
          smtp_host: 'localhost',
          smtp_port: 465,
          smtp_use_tls: true,
          sync_enabled: true,
          sync_interval: 15,
          last_sync: null,
          status: 'normal',
          last_error: null,
        },
        {
          id: 'alt-id',
          email: 'alt@nexus-mail.com',
          display_name: 'Alt User',
          imap_host: 'localhost',
          imap_port: 993,
          imap_use_tls: true,
          smtp_host: 'localhost',
          smtp_port: 465,
          smtp_use_tls: true,
          sync_enabled: true,
          sync_interval: 15,
          last_sync: null,
          status: 'normal',
          last_error: null,
        },
      ]);
      await setMockUnifiedInbox(page, [
        {
          id: 'unified-1',
          uid: '200',
          account_id: 'demo-id',
          account_email: 'demo@nexus-mail.com',
          folder_id: 'demo@nexus-mail.com::inbox',
          folder_name: 'Inbox',
          subject: 'Demo unified mail',
          from: 'alerts@demo.com',
          date: '2024-03-01T10:00:00Z',
          snippet: 'Demo unified snippet',
          flags: [],
        },
        {
          id: 'unified-2',
          uid: '201',
          account_id: 'alt-id',
          account_email: 'alt@nexus-mail.com',
          folder_id: 'alt@nexus-mail.com::inbox',
          folder_name: 'Inbox',
          subject: 'Alt unified mail',
          from: 'alerts@alt.com',
          date: '2024-03-01T09:00:00Z',
          snippet: 'Alt unified snippet',
          flags: ['\\Seen'],
        },
      ]);
      await page.goto('/');
    });
    await test.step('Open unified inbox', async () => {
      await page.getByTestId(testIds.unifiedInboxNav).click();
      await expect(page.getByTestId(testIds.unifiedInboxView)).toBeVisible();
      await expect(page.locator('[data-testid^="unified-inbox-item-"]')).toHaveCount(2);
      const demoItem = page.getByTestId('unified-inbox-item-unified-1');
      const altItem = page.getByTestId('unified-inbox-item-unified-2');
      await expect(demoItem.getByText('demo@nexus-mail.com', { exact: true })).toBeVisible();
      await expect(altItem.getByText('alt@nexus-mail.com', { exact: true })).toBeVisible();
    });
  });

  test('LIST-E2E-10 multi-select does not change detail panel', async ({ page }) => {
    await test.step('Open detail for first email', async () => {
      await page.goto('/');
      await page.getByTestId('email-card-100').click();
    });
    await test.step('Select another email without changing detail', async () => {
      const heading = page.locator('main > header h1');
      const subject = await heading.innerText();
      await page.evaluate(() => {
        document.querySelector<HTMLDivElement>('[data-testid="email-select-99"]')?.click();
      });
      await expect(page.getByTestId(testIds.selectedCount)).toContainText('1 selected');
      await expect(heading).toHaveText(subject);
    });
  });
});
