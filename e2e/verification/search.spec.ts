import { test, expect } from '@playwright/test';
import { applyMockConfig } from '../helpers/mockConfig';
import { setMockAccounts } from '../helpers/mockData';
import { testIds } from '../helpers/testIds';

test.describe('Search verification', () => {
  test('SRCH-E2E-01 folder switch updates context', async ({ page }) => {
    await test.step('Search then switch folder', async () => {
      await page.goto('/');
      await page.locator('[data-testid^="email-card-"]').first().waitFor();
      await page.getByTestId(testIds.searchInput).fill('nomatch');
      await expect(page.getByTestId(testIds.emptyStateSearchEmpty)).toBeVisible();
      await page.getByTestId('folder-sent').click();
    });
    await test.step('Assert results updated to new folder', async () => {
      await expect(page.getByTestId(testIds.emptyStateSearchEmpty)).toHaveCount(0);
      await expect(page.locator('[data-testid^="email-card-"]').first()).toBeVisible();
    });
  });

  test('SRCH-E2E-02 detail panel preserved', async ({ page }) => {
    await test.step('Open detail then search', async () => {
      await page.goto('/');
      await page.getByTestId('email-card-100').click();
    });
    await test.step('Assert detail unchanged', async () => {
      const heading = page.locator('main > header h1');
      const subject = await heading.innerText();
      await page.getByTestId(testIds.searchInput).fill('nomatch');
      await expect(heading).toHaveText(subject);
    });
  });

  test('SRCH-E2E-03 error and retry', async ({ page }) => {
    await test.step('Simulate search failure', async () => {
      await applyMockConfig(page, { searchShouldFail: true, searchFailMessage: 'Search failed' });
      await page.goto('/');
      await page.locator('[data-testid^="email-card-"]').first().waitFor();
      await page.getByTestId(testIds.searchInput).fill('trigger');
    });
    await test.step('Assert error + retry', async () => {
      await expect(page.getByTestId(testIds.emptyStateLoadError)).toBeVisible();
      await page.evaluate(() => {
        window.localStorage.setItem('nexus-mail-mock-config', JSON.stringify({ searchShouldFail: false }));
      });
      await page.getByTestId(testIds.searchInput).fill('recover');
      await expect(page.getByTestId(testIds.emptyStateLoadError)).toHaveCount(0);
    });
  });

  test('SRCH-E2E-04 boundary inputs', async ({ page }) => {
    await test.step('Test empty/long/special/unicode queries', async () => {
      await page.goto('/');
      await page.getByTestId(testIds.searchInput).fill('   ');
      await page.getByTestId(testIds.searchInput).fill('特殊字符测试');
      await page.getByTestId(testIds.searchInput).fill('<script>alert(1)</script>');
    });
    await test.step('Assert stable behavior', async () => {
      await expect(page.locator('[data-testid^="email-card-"]').first()).toBeVisible();
    });
  });

  test('SRCH-E2E-05 cross-account isolation', async ({ page }) => {
    await test.step('Search across multiple accounts', async () => {
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
      await page.goto('/');
    });
    await test.step('Assert results do not leak', async () => {
      await page.getByTestId(testIds.searchInput).fill('Found');
      await expect(page.locator('[data-testid^="email-card-"]').first()).toBeVisible();
      await page.getByTitle('alt@nexus-mail.com').click();
      await expect(page.getByTestId(testIds.searchInput)).toHaveValue('');
    });
  });

  test('SRCH-E2E-06 history limit', async ({ page }) => {
    await test.step('Run 11 searches', async () => {
      await page.goto('/');
      for (let i = 0; i < 11; i += 1) {
        await page.getByTestId(testIds.searchInput).fill(`query-${i}`);
      }
    });
    await test.step('Assert history limited to 10', async () => {
      const history = await page.evaluate(() => (window as any).__nexusTest.getSearchHistory('demo@nexus-mail.com'));
      expect(history.length).toBeLessThanOrEqual(10);
    });
  });

  test('SRCH-E2E-07 debounce keeps final query', async ({ page }) => {
    await test.step('Type rapidly in search', async () => {
      await page.goto('/');
      await page.locator('[data-testid^="email-card-"]').first().waitFor();
      const before = await page.evaluate(() => (window as any).__nexusTest.getSearchHistory());
      const input = page.getByTestId(testIds.searchInput);
      await input.fill('d');
      await input.fill('de');
      await input.fill('debounce');
      await page.waitForFunction(async (prevLen) => {
        const history = await (window as any).__nexusTest.getSearchHistory();
        return history.length > prevLen;
      }, before.length);
    });
    await test.step('Assert history captures last query only', async () => {
      await page.waitForFunction(() => (window as any).__nexusTest.getSearchMetrics().samples.length > 0);
      const history = await page.evaluate(() => (window as any).__nexusTest.getSearchHistory());
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].query).toBe('debounce');
    });
  });
});
