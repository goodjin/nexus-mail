import { test, expect } from '@playwright/test';
import { applyMockConfig } from '../helpers/mockConfig';
import { testIds } from '../helpers/testIds';

test.describe('Performance verification', () => {
test('LIST-PERF-01 list 1000 render <700ms', async ({ page }) => {
    await test.step('Inject 1000 emails', async () => {
      await applyMockConfig(page, { emailCount: 1000 });
      const start = Date.now();
      await page.goto('/');
      await page.getByTestId('email-card-1000').waitFor();
      const durationMs = Date.now() - start;
      expect(durationMs).toBeLessThan(700);
    });
  });

  test('SRCH-PERF-01 search p95 <500ms', async ({ page }) => {
    await test.step('Inject 1000 results and measure latency', async () => {
      await applyMockConfig(page, { searchResultCount: 1000 });
      await page.goto('/');
      await page.evaluate(() => (window as any).__nexusTest.resetSearchMetrics());
      const durations: number[] = [];
      for (let i = 0; i < 5; i += 1) {
        const before = await page.evaluate(async () => {
          const history = await (window as any).__nexusTest.getSearchHistory();
          return history.length;
        });
        const start = Date.now();
        await page.getByTestId(testIds.searchInput).fill(`perf-${i}`);
        await page.waitForFunction(async (prevLen) => {
          const history = await (window as any).__nexusTest.getSearchHistory();
          return history.length > prevLen;
        }, before);
        durations.push(Date.now() - start);
      }
      const metrics = await page.evaluate(() => (window as any).__nexusTest.getSearchMetrics());
      const samples = (metrics?.samples ?? []).slice(-durations.length);
      samples.sort((a: number, b: number) => a - b);
      const p95 = samples[Math.ceil(samples.length * 0.95) - 1] ?? durations.sort((a, b) => a - b)[Math.ceil(durations.length * 0.95) - 1];
      expect(p95).toBeLessThan(500);
    });
  });
});
