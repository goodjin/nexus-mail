import type { Page } from '@playwright/test';

export type MockConfig = {
  syncShouldFail?: boolean;
  syncFailMessage?: string;
  syncUnreadDelta?: Record<string, number>;
  syncEmailSubjectPrefix?: string;
  emptyFolders?: string[];
  folderSubjectMode?: 'folder-key';
};

export const applyMockConfig = async (page: Page, config: MockConfig) => {
  await page.addInitScript((cfg) => {
    window.localStorage.setItem('nexus-mail-mock-config', JSON.stringify(cfg));
  }, config);
};
