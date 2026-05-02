import type { Page } from '@playwright/test';

export type MockConfig = {
  syncShouldFail?: boolean;
  syncFailMessage?: string;
  syncUnreadDelta?: Record<string, number>;
  syncEmailSubjectPrefix?: string;
  emptyFolders?: string[];
  folderSubjectMode?: 'folder-key';
  emailCount?: number;
  searchResultCount?: number;
  searchDelayMs?: number;
  detailDelayMs?: number;
  forceNoAccounts?: boolean;
  offline?: boolean;
  emptySubject?: boolean;
  deleteShouldFail?: boolean;
  deleteFailMessage?: string;
  sendShouldFail?: boolean;
  sendFailMessage?: string;
  accountErrorState?: {
    email: string;
    status: string;
    last_error?: string;
  };
  oauthShouldFail?: boolean;
  oauthFailMessage?: string;
  searchShouldFail?: boolean;
  searchFailMessage?: string;
  detailShouldFail?: boolean;
  detailFailMessage?: string;
  attachmentDownloadShouldFail?: boolean;
  attachmentDownloadFailMessage?: string;
};

export const applyMockConfig = async (page: Page, config: MockConfig) => {
  await page.addInitScript((cfg) => {
    window.localStorage.setItem('nexus-mail-mock-config', JSON.stringify(cfg));
  }, config);
};
