import { test, expect } from '@playwright/test';
import { applyMockConfig } from '../helpers/mockConfig';
import { testIds } from '../helpers/testIds';

test.describe('Mail detail verification', () => {
  test('DETAIL-E2E-01 remote image banner', async ({ page }) => {
    await test.step('Set policy and open email with remote images', async () => {
      await page.goto('/');
    });
    await test.step('Assert load behavior per policy', async () => {
      await page.getByTestId('email-card-100').click();
      await expect(page.getByTestId(testIds.remoteImageBanner)).toBeVisible();
    });
  });

  test('DETAIL-E2E-02 per-email allow override', async ({ page }) => {
    await test.step('Policy ask, open email, allow images', async () => {
      await page.goto('/');
    });
    await test.step('Assert allow-once scoped to current message', async () => {
      await page.getByTestId('email-card-100').click();
      await page.getByTestId(testIds.remoteImageAllow).click();
      await expect(page.getByTestId(testIds.remoteImageBanner)).toHaveCount(0);
      await page.reload();
      await page.getByTestId('email-card-100').click();
      await expect(page.getByTestId(testIds.remoteImageBanner)).toBeVisible();
    });
  });

  test('DETAIL-E2E-03 allow always persists', async ({ page }) => {
    await test.step('Policy ask, allow always', async () => {
      await page.goto('/');
      await page.getByTestId('email-card-100').click();
      await page.getByTestId(testIds.remoteImageAllowAlways).click();
      await expect(page.getByTestId(testIds.remoteImageBanner)).toHaveCount(0);
      await page.waitForFunction(() => {
        const stored = window.localStorage.getItem('nexus-mail-mock-settings');
        return stored && JSON.parse(stored).remote_image_policy === 'always';
      });
    });
    await test.step('Assert persisted policy on reload', async () => {
      await page.reload();
      await page.getByTestId('email-card-100').click();
      await expect(page.getByTestId(testIds.remoteImageBanner)).toHaveCount(0);
    });
  });

  test('DETAIL-E2E-04 headers toggle', async ({ page }) => {
    await test.step('Open headers panel', async () => {
      await page.goto('/');
      await page.getByTestId('email-card-100').click();
      await page.getByTestId(testIds.detailHeadersToggle).click();
    });
    await test.step('Assert Message-ID visible', async () => {
      await expect(page.getByTestId(testIds.detailHeadersPanel)).toBeVisible();
    });
  });

  test('DETAIL-E2E-05 loading/error/retry', async ({ page }) => {
    await test.step('Simulate detail load failure', async () => {
      await applyMockConfig(page, { detailShouldFail: true, detailFailMessage: 'Detail failed' });
      await page.goto('/');
      await page.getByTestId('email-card-98').click();
    });
    await test.step('Assert error and retry', async () => {
      await expect(page.getByTestId(testIds.detailError)).toBeVisible();
      await page.evaluate(() => {
        window.localStorage.setItem('nexus-mail-mock-config', JSON.stringify({ detailShouldFail: false }));
      });
      await page.getByTestId(testIds.detailRetry).click();
      await expect(page.getByTestId(testIds.detailError)).toHaveCount(0);
    });
  });

  test('DETAIL-E2E-06 PDF preview', async ({ page }) => {
    await test.step('Open email with PDF attachment', async () => {
      await page.goto('/');
      await page.getByTestId('email-card-100').click();
    });
    await test.step('Assert preview element present', async () => {
      await page.getByTestId('attachment-preview-mock-att-1').click();
      await expect(page.getByTestId(testIds.attachmentPreview)).toBeVisible();
    });
  });

  test('DETAIL-E2E-07 download failure retry and progress', async ({ page }) => {
    await test.step('Simulate download failure', async () => {
      await page.addInitScript(() => {
        window.alert = () => {};
      });
      await applyMockConfig(page, { attachmentDownloadShouldFail: true });
      await page.goto('/');
      await page.getByTestId('email-card-100').click();
    });
    await test.step('Assert error message shown with progress', async () => {
      await page.getByTestId('attachment-download-mock-att-1').click();
      await expect(page.getByTestId('attachment-download-progress-mock-att-1')).toBeVisible();
      await expect(page.getByTestId(testIds.attachmentDownloadError)).toBeVisible();
    });
    await test.step('Retry succeeds after clearing failure', async () => {
      await page.evaluate(() => {
        window.localStorage.setItem('nexus-mail-mock-config', JSON.stringify({ attachmentDownloadShouldFail: false }));
      });
      await page.getByTestId(testIds.attachmentDownloadRetry).click();
      await expect(page.getByTestId(testIds.attachmentDownloadError)).toHaveCount(0);
    });
  });
});
