import type { Page } from '@playwright/test';

export const setMockAccounts = async (
  page: Page,
  accounts: Array<Record<string, any>>
) => {
  await page.addInitScript((value) => {
    window.localStorage.setItem('nexus-mail-mock-accounts', JSON.stringify(value));
  }, accounts);
};

export const setMockSettings = async (
  page: Page,
  settings: Record<string, string>
) => {
  await page.addInitScript((value) => {
    window.localStorage.setItem('nexus-mail-mock-settings', JSON.stringify(value));
  }, settings);
};
