import { invoke as tauriInvoke } from "@tauri-apps/api/core";

export const isTauri = !!(window as any).__TAURI_INTERNALS__;

const MOCK_ACCOUNTS_KEY = "nexus-mail-mock-accounts";
const MOCK_CONFIG_KEY = "nexus-mail-mock-config";
const MOCK_SEND_EMAIL_KEY = "nexus-mail-mock-send-email";
const MOCK_SETTINGS_KEY = "nexus-mail-mock-settings";
const MOCK_FOLDERS_KEY = "nexus-mail-mock-folders";
const MOCK_SMART_INBOX_KEY = "nexus-mail-mock-smart-inbox";
const MOCK_UNIFIED_INBOX_KEY = "nexus-mail-mock-unified-inbox";
const defaultMockAccounts = [
  {
    id: "demo-id",
    email: "demo@nexus-mail.com",
    display_name: "Demo User",
    imap_host: "localhost",
    imap_port: 993,
    imap_use_tls: true,
    smtp_host: "localhost",
    smtp_port: 465,
    smtp_use_tls: true,
    sync_enabled: true,
    sync_interval: 15,
    last_sync: null,
    status: "normal",
    last_error: null,
  },
];

const loadMockAccounts = () => {
  if (typeof window === "undefined") {
    return [...defaultMockAccounts];
  }
  try {
    const stored = window.localStorage.getItem(MOCK_ACCOUNTS_KEY);
    if (!stored) return [...defaultMockAccounts];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [...defaultMockAccounts];
  } catch (error) {
    console.warn("Failed to load mock accounts, using defaults.", error);
    return [...defaultMockAccounts];
  }
};

const persistMockAccounts = (accounts: typeof defaultMockAccounts) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MOCK_ACCOUNTS_KEY, JSON.stringify(accounts));
};

let mockAccounts = loadMockAccounts();
const mockSyncCounts: Record<string, number> = {};
const mockSearchHistory: Record<string, { query: string; last_used_at: number }[]> = {};
const defaultMockSettings: Record<string, string> = {
  auto_download_attachments: "false",
  background_sync_history: "true",
  theme: "system",
  confirm_before_delete: "true",
  download_directory: "",
  remote_image_policy: "ask",
  search_history_limit: "10",
};

const loadMockSettings = () => {
  if (typeof window === "undefined") {
    return { ...defaultMockSettings };
  }
  try {
    const stored = window.localStorage.getItem(MOCK_SETTINGS_KEY);
    if (!stored) return { ...defaultMockSettings };
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object") return { ...defaultMockSettings };
    return { ...defaultMockSettings, ...(parsed as Record<string, string>) };
  } catch (error) {
    console.warn("Failed to load mock settings, using defaults.", error);
    return { ...defaultMockSettings };
  }
};

const persistMockSettings = (settings: Record<string, string>) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MOCK_SETTINGS_KEY, JSON.stringify(settings));
};

let mockSettings = loadMockSettings();
type MockFolder = {
  id: string;
  name: string;
  remote_id: string;
  unread_count: number;
  system_role?: string | null;
};

const loadMockFolders = (): Record<string, MockFolder[]> => {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const stored = window.localStorage.getItem(MOCK_FOLDERS_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.warn("Failed to load mock folders, using defaults.", error);
    return {};
  }
};

const persistMockFolders = (folders: Record<string, MockFolder[]>) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MOCK_FOLDERS_KEY, JSON.stringify(folders));
};

let mockCustomFolders = loadMockFolders();

type SmartInboxCategory = "important" | "personal" | "notifications" | "newsletters" | "low_priority";

type MockSmartInboxItem = {
  id: string;
  uid: string;
  account_id: string;
  folder_id: string;
  subject: string;
  from: string;
  date: string;
  flags: string[];
  category: SmartInboxCategory;
};

type MockSmartInboxState = {
  items: MockSmartInboxItem[];
};

const loadMockSmartInbox = (): Record<string, MockSmartInboxState> => {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const stored = window.localStorage.getItem(MOCK_SMART_INBOX_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.warn("Failed to load mock smart inbox data, using defaults.", error);
    return {};
  }
};

const persistMockSmartInbox = (data: Record<string, MockSmartInboxState>) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MOCK_SMART_INBOX_KEY, JSON.stringify(data));
};

let mockSmartInbox = loadMockSmartInbox();

type MockUnifiedInboxItem = {
  id: string;
  uid: string;
  account_id: string;
  account_email: string;
  folder_id: string;
  folder_name: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  flags: string[];
};

const loadMockUnifiedInbox = (): MockUnifiedInboxItem[] => {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const stored = window.localStorage.getItem(MOCK_UNIFIED_INBOX_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Failed to load mock unified inbox data, using defaults.", error);
    return [];
  }
};

const persistMockUnifiedInbox = (items: MockUnifiedInboxItem[]) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MOCK_UNIFIED_INBOX_KEY, JSON.stringify(items));
};

let mockUnifiedInbox = loadMockUnifiedInbox();

type MockConfig = {
  syncShouldFail?: boolean;
  syncFailMessage?: string;
  syncUnreadDelta?: Record<string, number>;
  syncEmailSubjectPrefix?: string;
  emptyFolders?: string[];
  folderSubjectMode?: "folder-key";
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
  discoveryResult?: {
    imap_host?: string;
    imap_port?: number;
    imap_use_tls?: boolean;
    smtp_host?: string;
    smtp_port?: number;
    smtp_use_tls?: boolean;
  };
  discoveryError?: string;
};

const readMockConfig = (): MockConfig => {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const stored = window.localStorage.getItem(MOCK_CONFIG_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.warn("Failed to load mock config, using defaults.", error);
    return {};
  }
};

const resetMockAccounts = () => {
  mockAccounts = [...defaultMockAccounts];
  persistMockAccounts(mockAccounts);
};

const upsertMockAccount = (args: any) => {
  const existingIndex = mockAccounts.findIndex((account) => account.email === args.email);
    const nextAccount = {
      id: existingIndex >= 0 ? mockAccounts[existingIndex].id : `mock-${Date.now()}`,
      email: args.email,
      display_name: args.displayName ?? null,
    imap_host: args.imapHost,
    imap_port: args.imapPort,
      imap_use_tls: args.imapUseTls,
      smtp_host: args.smtpHost,
      smtp_port: args.smtpPort,
      smtp_use_tls: args.smtpUseTls,
      sync_enabled: args.syncEnabled ?? (existingIndex >= 0 ? mockAccounts[existingIndex].sync_enabled : true),
      sync_interval: args.syncInterval ?? (existingIndex >= 0 ? mockAccounts[existingIndex].sync_interval : 15),
      last_sync: existingIndex >= 0 ? mockAccounts[existingIndex].last_sync : null,
      status: existingIndex >= 0 ? mockAccounts[existingIndex].status : "normal",
      last_error: existingIndex >= 0 ? mockAccounts[existingIndex].last_error : null,
    };
  if (existingIndex >= 0) {
    mockAccounts[existingIndex] = nextAccount;
  } else {
    mockAccounts.push(nextAccount);
  }
  persistMockAccounts(mockAccounts);
};

const getSearchHistoryLimit = () => {
  const parsed = Number.parseInt(mockSettings.search_history_limit ?? "10", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
};

const recordMockSearchHistory = (accountEmail: string, query: string) => {
  const history = mockSearchHistory[accountEmail] ?? [];
  const now = Date.now();
  const existingIndex = history.findIndex(entry => entry.query === query);
  if (existingIndex >= 0) {
    history.splice(existingIndex, 1);
  }
  history.unshift({ query, last_used_at: now });
  mockSearchHistory[accountEmail] = history.slice(0, getSearchHistoryLimit());
};

const getMockSearchHistory = (accountEmail: string) => {
  return mockSearchHistory[accountEmail] ?? [];
};

const resolveFolderCounts = (accountEmail: string) => {
  const config = readMockConfig();
  if (accountEmail === "demo@nexus-mail.com") {
    const counts = { inbox: 95, sent: 0, drafts: 2, archive: 0, spam: 5, trash: 0 };
    const updated = applySyncUnreadDelta(accountEmail, counts, config);
    return applyEmptyFolderOverrides(updated, config);
  }
  const counts = { inbox: 12, sent: 1, drafts: 0, archive: 0, spam: 0, trash: 0 };
  const updated = applySyncUnreadDelta(accountEmail, counts, config);
  return applyEmptyFolderOverrides(updated, config);
};

const buildMockFolders = (accountEmail: string) => {
  const counts = resolveFolderCounts(accountEmail);
  const baseFolders: MockFolder[] = [
    { id: `${accountEmail}::inbox`, name: "Inbox", remote_id: "inbox", unread_count: counts.inbox, system_role: "INBOX" },
    { id: `${accountEmail}::sent`, name: "Sent", remote_id: "sent", unread_count: counts.sent, system_role: "SENT" },
    { id: `${accountEmail}::drafts`, name: "Drafts", remote_id: "drafts", unread_count: counts.drafts, system_role: "DRAFTS" },
    { id: `${accountEmail}::archive`, name: "Archive", remote_id: "archive", unread_count: counts.archive, system_role: "ARCHIVE" },
    { id: `${accountEmail}::spam`, name: "Spam", remote_id: "spam", unread_count: counts.spam, system_role: "SPAM" },
    { id: `${accountEmail}::trash`, name: "Trash", remote_id: "trash", unread_count: counts.trash, system_role: "TRASH" }
  ];
  const customFolders = (mockCustomFolders[accountEmail] ?? []).map((folder) => ({
    ...folder,
    unread_count: folder.unread_count ?? 0,
    system_role: folder.system_role ?? null,
  }));
  return [...baseFolders, ...customFolders];
};

const SMART_INBOX_ORDER: SmartInboxCategory[] = [
  "important",
  "personal",
  "notifications",
  "newsletters",
  "low_priority",
];

const buildDefaultSmartInboxItems = (accountEmail: string): MockSmartInboxItem[] => {
  const baseDate = (offsetMinutes: number) =>
    new Date(Date.now() - offsetMinutes * 60 * 1000).toISOString();
  return [
    {
      id: `${accountEmail}-smart-1`,
      uid: "100",
      account_id: accountEmail,
      folder_id: `${accountEmail}::inbox`,
      subject: "Quarterly report review",
      from: "ceo@demo.com",
      date: baseDate(30),
      flags: [],
      category: "important",
    },
    {
      id: `${accountEmail}-smart-2`,
      uid: "99",
      account_id: accountEmail,
      folder_id: `${accountEmail}::inbox`,
      subject: "Lunch this week?",
      from: "friend@demo.com",
      date: baseDate(60),
      flags: [],
      category: "personal",
    },
    {
      id: `${accountEmail}-smart-3`,
      uid: "98",
      account_id: accountEmail,
      folder_id: `${accountEmail}::inbox`,
      subject: "Security alert",
      from: "no-reply@alerts.demo.com",
      date: baseDate(120),
      flags: ["\\Seen"],
      category: "notifications",
    },
    {
      id: `${accountEmail}-smart-4`,
      uid: "97",
      account_id: accountEmail,
      folder_id: `${accountEmail}::inbox`,
      subject: "Nexus Weekly Newsletter",
      from: "newsletter@demo.com",
      date: baseDate(180),
      flags: ["\\Seen"],
      category: "newsletters",
    },
    {
      id: `${accountEmail}-smart-5`,
      uid: "96",
      account_id: accountEmail,
      folder_id: `${accountEmail}::inbox`,
      subject: "Low priority notice",
      from: "updates@demo.com",
      date: baseDate(240),
      flags: ["\\Seen"],
      category: "low_priority",
    },
  ];
};

const resolveSmartInboxItems = (accountEmail: string) => {
  if (!mockSmartInbox[accountEmail]) {
    mockSmartInbox = {
      ...mockSmartInbox,
      [accountEmail]: { items: buildDefaultSmartInboxItems(accountEmail) },
    };
    persistMockSmartInbox(mockSmartInbox);
  }
  return mockSmartInbox[accountEmail]?.items ?? [];
};

const buildDefaultUnifiedInboxItems = (): MockUnifiedInboxItem[] => {
  const baseDate = (offsetMinutes: number) =>
    new Date(Date.now() - offsetMinutes * 60 * 1000).toISOString();
  return mockAccounts.flatMap((account, index) => {
    const folderId = `${account.email}::inbox`;
    const folderName = "Inbox";
    const domain = account.email.split("@")[1] ?? "mock.com";
    return [
      {
        id: `${account.id}-unified-1`,
        uid: "200",
        account_id: account.id,
        account_email: account.email,
        folder_id: folderId,
        folder_name: folderName,
        subject: `Unified ${account.email} update`,
        from: `updates@${domain}`,
        date: baseDate(15 + index * 5),
        snippet: "Unified inbox sample message",
        flags: [],
      },
      {
        id: `${account.id}-unified-2`,
        uid: "199",
        account_id: account.id,
        account_email: account.email,
        folder_id: folderId,
        folder_name: folderName,
        subject: `Meeting notes for ${account.display_name ?? account.email}`,
        from: `team@${domain}`,
        date: baseDate(45 + index * 7),
        snippet: "Notes from the latest meeting are ready.",
        flags: ["\\Seen"],
      },
    ];
  });
};

const resolveUnifiedInboxItems = (accountIds?: string[]) => {
  if (mockUnifiedInbox.length === 0) {
    mockUnifiedInbox = buildDefaultUnifiedInboxItems();
    persistMockUnifiedInbox(mockUnifiedInbox);
  }
  let items = mockUnifiedInbox;
  if (accountIds && accountIds.length > 0) {
    const ids = new Set(accountIds);
    items = items.filter((item) => ids.has(item.account_id));
  }
  return items;
};

const toTimestamp = (date: string) => {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const buildSmartInboxGroups = (items: MockSmartInboxItem[]) => {
  const stats: Record<string, { unread: number; latest: string; latestTs: number }> = {};
  SMART_INBOX_ORDER.forEach((label) => {
    stats[label] = { unread: 0, latest: "", latestTs: 0 };
  });
  items.forEach((item) => {
    const entry = stats[item.category] ?? { unread: 0, latest: "", latestTs: 0 };
    if (!item.flags?.includes("\\Seen")) {
      entry.unread += 1;
    }
    const ts = toTimestamp(item.date);
    if (ts >= entry.latestTs) {
      entry.latest = item.date;
      entry.latestTs = ts;
    }
    stats[item.category] = entry;
  });
  return SMART_INBOX_ORDER.map((label) => ({
    id: label,
    label,
    unread_count: stats[label]?.unread ?? 0,
    latest_at: stats[label]?.latest ?? "",
  }));
};

const parseFolderId = (folderId?: string) => {
  if (!folderId) {
    return { accountEmail: mockAccounts[0]?.email ?? "demo@nexus-mail.com", folderKey: "inbox" };
  }
  const [accountEmail, folderKey] = folderId.split("::");
  if (!folderKey) {
    return { accountEmail: mockAccounts[0]?.email ?? accountEmail, folderKey: folderId };
  }
  return { accountEmail, folderKey };
};

const applySyncUnreadDelta = (
  accountEmail: string,
  counts: Record<string, number>,
  config: MockConfig
) => {
  if (!config.syncUnreadDelta) return counts;
  if ((mockSyncCounts[accountEmail] ?? 0) === 0) return counts;
  const updated = { ...counts };
  Object.entries(config.syncUnreadDelta).forEach(([key, delta]) => {
    if (typeof delta !== "number") return;
    const normalized = key.toLowerCase();
    if (normalized in updated) {
      updated[normalized] = Math.max(0, updated[normalized] + delta);
    }
  });
  return updated;
};

const applyEmptyFolderOverrides = (counts: Record<string, number>, config: MockConfig) => {
  if (!config.emptyFolders?.length) return counts;
  const updated = { ...counts };
  config.emptyFolders.forEach((folderKey) => {
    const normalized = folderKey.toLowerCase();
    if (normalized in updated) {
      updated[normalized] = 0;
    }
  });
  return updated;
};

const resolveMockSubject = (
  accountEmail: string,
  folderKey: string,
  id: number,
  config: MockConfig
) => {
  if (accountEmail !== "demo@nexus-mail.com") {
    return `${accountEmail} ${folderKey.toUpperCase()} Message #${id}`;
  }
  if ((mockSyncCounts[accountEmail] ?? 0) > 0 && config.syncEmailSubjectPrefix) {
    return `${config.syncEmailSubjectPrefix} #${id}`;
  }
  if (config.folderSubjectMode === "folder-key") {
    return `${folderKey.toUpperCase()} Sample #${id}`;
  }
  return `Nexus Mail Sample #${id}`;
};

export async function invoke<T>(cmd: string, args?: any): Promise<T> {
  if (!isTauri) {
    console.log(`[Mock Invoke] ${cmd}`, args);
    const config = readMockConfig();
    
    // 模拟不同命令的返回
    switch (cmd) {
      case "send_email":
        if (config.offline) {
          throw new Error("Offline: unable to send email");
        }
        await new Promise(r => setTimeout(r, 500));
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(
              MOCK_SEND_EMAIL_KEY,
              JSON.stringify({ ...args, timestamp: new Date().toISOString() })
            );
          } catch (error) {
            console.warn("Failed to persist mock send payload", error);
          }
        }
        if (config.sendShouldFail) {
          throw new Error(config.sendFailMessage ?? "Mock send failed");
        }
        return "Mock email sent" as any;
      case "sync_account":
        if (config.offline) {
          throw new Error("Offline: unable to sync account");
        }
        await new Promise(r => setTimeout(r, 1000));
        if (config.syncShouldFail) {
          throw new Error(config.syncFailMessage ?? "Mock sync failed");
        }
        if (args?.email) {
          mockSyncCounts[args.email] = (mockSyncCounts[args.email] ?? 0) + 1;
          mockAccounts = mockAccounts.map((account) =>
            account.email === args.email
              ? {
                  ...account,
                  last_sync: Date.now(),
                  status: "normal",
                  last_error: null,
                }
              : account
          );
          persistMockAccounts(mockAccounts);
        }
        return "Mock sync success" as any;
      case "search_emails":
        if (config.offline) {
          throw new Error("Offline: search unavailable");
        }
        if (config.searchShouldFail) {
          throw new Error(config.searchFailMessage ?? "Mock search failed");
        }
        if (config.searchDelayMs) {
          await new Promise(r => setTimeout(r, config.searchDelayMs));
        }
        const q = args.query.toLowerCase();
        const searchAccount = args.accountEmail ?? mockAccounts[0]?.email ?? "demo@nexus-mail.com";
        recordMockSearchHistory(searchAccount, args.query);
        if (q.includes("nomatch")) {
          return [] as any;
        }
        const count = config.searchResultCount ?? 1;
        return Array.from({ length: count }, (_, i) => ({
          uid: `search-${i + 1}`,
          subject: `Found: ${args.query} #${i + 1}`,
          from: "search@mock.com",
          date: "Now",
          snippet: "Matching search result",
        })).filter(e => e.subject.toLowerCase().includes(q) || e.snippet.toLowerCase().includes(q)) as any;
      case "search_emails_with_filters":
        if (config.offline) {
          throw new Error("Offline: search unavailable");
        }
        if (config.searchShouldFail) {
          throw new Error(config.searchFailMessage ?? "Mock search failed");
        }
        if (config.searchDelayMs) {
          await new Promise(r => setTimeout(r, config.searchDelayMs));
        }
        const query = args.query.toLowerCase();
        const filters = args.filters ?? {};
        const filteredAccount = args.accountEmail ?? mockAccounts[0]?.email ?? "demo@nexus-mail.com";
        recordMockSearchHistory(filteredAccount, args.query);
        if (query.includes("nomatch")) {
          return [] as any;
        }
        const from = filters.sender ?? "search@mock.com";
        const attachments = filters.has_attachments
          ? [{ id: "mock-att", filename: "filter.pdf", size: 512, mime_type: "application/pdf" }]
          : [];
        const filteredCount = config.searchResultCount ?? 1;
        return Array.from({ length: filteredCount }, (_, i) => ({
          uid: `search-${i + 1}`,
          subject: `${filters.account_scope === "all_accounts" ? "[All accounts] " : ""}Found: ${args.query} #${i + 1}`,
          from,
          date: "Now",
          snippet:
            filters.account_scope === "current_folder"
              ? "Matching result in this folder"
              : filters.account_scope === "all_accounts"
                ? "Matching result across all accounts"
                : "Matching result in this account",
          attachments,
        }))
          .filter(e => e.subject.toLowerCase().includes(query) || e.snippet.toLowerCase().includes(query))
          .filter(e => !filters.sender || e.from.toLowerCase().includes(filters.sender.toLowerCase()))
          .filter(e => !filters.has_attachments || (e.attachments && e.attachments.length > 0)) as any;
      case "get_unified_inbox": {
        const accountIds = args?.account_ids as string[] | undefined;
        const folderIds = args?.folder_ids as string[] | undefined;
        let items = resolveUnifiedInboxItems(accountIds);
        if (folderIds && folderIds.length > 0) {
          const folderSet = new Set(folderIds);
          items = items.filter((item) => folderSet.has(item.folder_id));
        }
        return items as any;
      }
      case "search_emails_global":
      case "filter_search_results": {
        if (config.offline) {
          throw new Error("Offline: search unavailable");
        }
        if (config.searchShouldFail) {
          throw new Error(config.searchFailMessage ?? "Mock search failed");
        }
        if (config.searchDelayMs) {
          await new Promise(r => setTimeout(r, config.searchDelayMs));
        }
        const query = String(args?.query ?? "").toLowerCase();
        const filters = args?.filters ?? {};
        const accountIds = filters.account_ids as string[] | undefined;
        const folderIds = filters.folder_ids as string[] | undefined;
        let items = resolveUnifiedInboxItems(accountIds);
        if (folderIds && folderIds.length > 0) {
          const folderSet = new Set(folderIds);
          items = items.filter((item) => folderSet.has(item.folder_id));
        }
        if (query.includes("nomatch")) {
          return [] as any;
        }
        return items.filter((item) =>
          item.subject.toLowerCase().includes(query) || item.snippet.toLowerCase().includes(query)
        ) as any;
      }
      case "get_search_history":
        return getMockSearchHistory(args.accountEmail ?? mockAccounts[0]?.email ?? "demo@nexus-mail.com") as any;
      case "clear_search_history":
        mockSearchHistory[args.accountEmail ?? mockAccounts[0]?.email ?? "demo@nexus-mail.com"] = [];
        return {} as any;
      case "list_accounts":
        if (config.forceNoAccounts) {
          return [] as any;
        }
        return mockAccounts.map((account) => account.email) as any;
      case "get_accounts_detailed":
        if (config.forceNoAccounts) {
          return [] as any;
        }
        return mockAccounts.map((account) => {
          const accountErrorState = config.accountErrorState;
          if (accountErrorState && accountErrorState.email === account.email) {
            return {
              ...account,
              status: accountErrorState.status,
              last_error: accountErrorState.last_error ?? account.last_error,
            };
          }
          return { ...account };
        }) as any;
      case "get_folders":
        return buildMockFolders(args?.accountEmail ?? mockAccounts[0]?.email ?? "demo@nexus-mail.com") as any;
      case "get_smart_inbox_summary": {
        const accountEmail = args?.accountEmail ?? mockAccounts[0]?.email ?? "demo@nexus-mail.com";
        const items = resolveSmartInboxItems(accountEmail);
        const groups = buildSmartInboxGroups(items);
        const priority_items = items.filter((item) =>
          ["important", "personal"].includes(item.category)
        );
        return { groups, priority_items } as any;
      }
      case "list_smart_inbox_groups": {
        const accountEmail = args?.accountEmail ?? mockAccounts[0]?.email ?? "demo@nexus-mail.com";
        const items = resolveSmartInboxItems(accountEmail);
        return buildSmartInboxGroups(items) as any;
      }
      case "set_smart_inbox_override": {
        const accountEmail = args?.accountEmail ?? mockAccounts[0]?.email ?? "demo@nexus-mail.com";
        const emailId = String(args?.emailId ?? "");
        const category = String(args?.category ?? "important");
        const items = resolveSmartInboxItems(accountEmail);
        const updated = items.map((item) =>
          item.id === emailId ? { ...item, category } : item
        );
        mockSmartInbox = { ...mockSmartInbox, [accountEmail]: { items: updated } };
        persistMockSmartInbox(mockSmartInbox);
        return {
          id: `override-${Date.now()}`,
          email_id: emailId,
          account_id: accountEmail,
          category,
          reason: String(args?.reason ?? "user_mark_important"),
          created_at: new Date().toISOString(),
        } as any;
      }
      case "create_folder": {
        const accountEmail = args?.accountEmail ?? mockAccounts[0]?.email ?? "demo@nexus-mail.com";
        const name = String(args?.name ?? "").trim();
        if (!name) {
          throw new Error("Folder name cannot be empty");
        }
        if (name.length > 64) {
          throw new Error("Folder name must be 64 characters or fewer");
        }
        if (/[\\/]/.test(name)) {
          throw new Error("Folder name cannot contain / or \\");
        }
        const reservedNames = [
          "inbox",
          "sent",
          "drafts",
          "trash",
          "spam",
          "archive",
          "收件箱",
          "已发送",
          "草稿",
          "垃圾箱",
          "垃圾邮件",
          "归档",
        ];
        if (reservedNames.includes(name.toLowerCase()) || reservedNames.includes(name)) {
          throw new Error("System folder names are reserved");
        }
        const existing = mockCustomFolders[accountEmail] ?? [];
        if (existing.some((folder) => folder.name.toLowerCase() === name.toLowerCase())) {
          throw new Error("Folder name already exists");
        }
        const folder = {
          id: `custom-${Date.now()}`,
          name,
          remote_id: name,
          unread_count: 0,
          system_role: null,
        };
        mockCustomFolders = {
          ...mockCustomFolders,
          [accountEmail]: [...existing, folder],
        };
        persistMockFolders(mockCustomFolders);
        return folder as any;
      }
      case "rename_folder": {
        const accountEmail = args?.accountEmail ?? mockAccounts[0]?.email ?? "demo@nexus-mail.com";
        const folderId = String(args?.folderId ?? "");
        const newName = String(args?.newName ?? "").trim();
        if (!newName) {
          throw new Error("Folder name cannot be empty");
        }
        if (newName.length > 64) {
          throw new Error("Folder name must be 64 characters or fewer");
        }
        if (/[\\/]/.test(newName)) {
          throw new Error("Folder name cannot contain / or \\");
        }
        const reservedNames = [
          "inbox",
          "sent",
          "drafts",
          "trash",
          "spam",
          "archive",
          "收件箱",
          "已发送",
          "草稿",
          "垃圾箱",
          "垃圾邮件",
          "归档",
        ];
        if (reservedNames.includes(newName.toLowerCase()) || reservedNames.includes(newName)) {
          throw new Error("System folder names are reserved");
        }
        const existing = mockCustomFolders[accountEmail] ?? [];
        if (existing.some((folder) => folder.name.toLowerCase() === newName.toLowerCase() && folder.id !== folderId)) {
          throw new Error("Folder name already exists");
        }
        const updated = existing.map((folder) =>
          folder.id === folderId
            ? { ...folder, name: newName, remote_id: newName }
            : folder
        );
        mockCustomFolders = { ...mockCustomFolders, [accountEmail]: updated };
        persistMockFolders(mockCustomFolders);
        const renamed = updated.find((folder) => folder.id === folderId);
        if (!renamed) {
          throw new Error("Folder not found");
        }
        return renamed as any;
      }
      case "delete_folder": {
        const accountEmail = args?.accountEmail ?? mockAccounts[0]?.email ?? "demo@nexus-mail.com";
        const folderId = String(args?.folderId ?? "");
        const existing = mockCustomFolders[accountEmail] ?? [];
        const updated = existing.filter((folder) => folder.id !== folderId);
        if (updated.length === existing.length) {
          throw new Error("Folder not found");
        }
        mockCustomFolders = { ...mockCustomFolders, [accountEmail]: updated };
        persistMockFolders(mockCustomFolders);
        return {} as any;
      }
      case "get_emails":
        const { accountEmail, folderKey } = parseFolderId(args?.folderId);
        if (config.emptyFolders?.map(f => f.toLowerCase()).includes(folderKey.toLowerCase())) {
          return [] as any;
        }
        const isDemo = accountEmail === "demo@nexus-mail.com";
        const emailCount = config.emailCount ?? 100;
        return Array.from({ length: emailCount }, (_, i) => {
          const id = emailCount - i;
          const baseSubject = isDemo
            ? resolveMockSubject(accountEmail, folderKey, id, config)
            : `${accountEmail} ${folderKey.toUpperCase()} Message #${id}`;
          const isSecuritySample = isDemo && id === 100;
          const isEmptyBodySample = isDemo && id === 99;
           const subject = config.emptySubject && i === 0
             ? ""
             : isSecuritySample
             ? `${baseSubject} - Safe Title`
             : isEmptyBodySample
               ? `${baseSubject} - Empty Body`
               : baseSubject;
          const snippet = isSecuritySample
            ? "SECURITY TEST - Safe Title"
            : isEmptyBodySample
              ? "EMPTY BODY - Fallback snippet"
              : (isDemo ? `Mock content for message ${id}` : `Mock content for ${accountEmail} ${folderKey} ${id}`);
          const attachments = isSecuritySample
            ? [
                {
                  id: "mock-att-1",
                  filename: "welcome.pdf",
                  size: 2480,
                  mime_type: "application/pdf"
                },
                {
                  id: "mock-att-2",
                  filename: "preview.png",
                  size: 1024,
                  mime_type: "image/png"
                }
              ]
            : undefined;
          return { 
            uid: String(id), 
            subject, 
            from: isDemo ? `sender-${id}@mock.com` : `${folderKey}-${id}@${accountEmail.split("@")[1] || "mock.com"}`, 
            date: "Wed, 25 Mar 2026 10:19:36 +0800", 
            snippet,
            attachments,
            body_html: isSecuritySample
              ? "<div><h1>Safe Title</h1><img src=\"x\" onerror=\"window.XSS_EXECUTED=true\" /><script>window.XSS_EXECUTED=true</script></div>"
              : undefined,
            body_text: isSecuritySample ? "Safe Title" : undefined,
            flags: id > 5 ? ["\\Seen"] : [] // Mock some unread
          };
        }) as any;
      case "get_email_details":
        if (config.offline) {
          throw new Error("Offline: detail unavailable");
        }
        if (config.detailShouldFail) {
          throw new Error(config.detailFailMessage ?? "Mock detail failed");
        }
        if (config.detailDelayMs) {
          await new Promise(r => setTimeout(r, config.detailDelayMs));
        }
        if (String(args.uid) === "100") {
          return {
            uid: args.uid,
            body_html: "<div><h1>Safe Title</h1><img src=\"x\" onerror=\"window.XSS_EXECUTED=true\" /><script>window.XSS_EXECUTED=true</script></div>",
            body_text: "Safe Title",
            attachments: [
              {
                id: "mock-att-1",
                filename: "welcome.pdf",
                size: 2480,
                mime_type: "application/pdf"
              },
              {
                id: "mock-att-2",
                filename: "preview.png",
                size: 1024,
                mime_type: "image/png"
              }
            ]
          } as any;
        }
        if (String(args.uid) === "99") {
          return {
            uid: args.uid,
            body_html: null,
            body_text: null,
            attachments: []
          } as any;
        }
        return {
          uid: args.uid,
          body_html: "<div><h1>Mock Email Content</h1><p>This is a mock email.</p></div>",
          body_text: "Mock Email Content",
          attachments: [
            {
              id: "mock-att-1",
              filename: "welcome.pdf",
              size: 2480,
              mime_type: "application/pdf"
            },
            {
              id: "mock-att-2",
              filename: "preview.png",
              size: 1024,
              mime_type: "image/png"
            }
          ]
        } as any;
      case "get_attachment":
        if (config.offline) {
          throw new Error("Offline: attachment unavailable");
        }
        if (config.attachmentDownloadShouldFail) {
          throw new Error(
            config.attachmentDownloadFailMessage ?? "Mock attachment download failed"
          );
        }
        return new Uint8Array([72, 101, 108, 108, 111]) as any;
      case "update_email_flag":
      case "apply_email_action":
        return { processed: args.uids?.length ?? 0, failed: [] } as any;
      case "delete_email":
        if (config.deleteShouldFail) {
          throw new Error(config.deleteFailMessage ?? "Mock delete failed");
        }
        return {} as any;
      case "move_emails":
        return { moved: args.uids?.length ?? 0, failed: [] } as any;
      case "update_account_details":
        if (cmd === "update_account_details") {
          upsertMockAccount(args);
        }
        return {} as any;
      case "update_account_password":
      case "update_setting":
        if (cmd === "update_setting" && args?.key) {
          mockSettings = { ...mockSettings, [args.key]: String(args.value) };
          persistMockSettings(mockSettings);
        }
        return {} as any;
      case "update_app_settings":
        if (args?.settings) {
          mockSettings = {
            ...mockSettings,
            auto_download_attachments: String(Boolean(args.settings.auto_download_attachments)),
            background_sync_history: String(args.settings.background_sync_history !== false),
            theme: args.settings.theme ?? mockSettings.theme,
            confirm_before_delete: String(args.settings.confirm_before_delete !== false),
            download_directory: String(args.settings.download_directory ?? ""),
            remote_image_policy: args.settings.remote_image_policy ?? mockSettings.remote_image_policy,
            search_history_limit: String(args.settings.search_history_limit ?? 10),
          };
          persistMockSettings(mockSettings);
        }
        return {} as any;
      case "get_all_settings":
      case "get_settings":
        return { ...mockSettings } as any;
      case "get_app_settings":
        return {
          auto_download_attachments: mockSettings.auto_download_attachments === "true",
          background_sync_history: mockSettings.background_sync_history !== "false",
          theme: mockSettings.theme,
          confirm_before_delete: mockSettings.confirm_before_delete !== "false",
          download_directory: mockSettings.download_directory ?? "",
          remote_image_policy: mockSettings.remote_image_policy ?? "ask",
          search_history_limit: Number.parseInt(mockSettings.search_history_limit ?? "10", 10) || 10,
        } as any;
      case "get_setting":
        return "mock-value" as any;
      case "reset_database":
        resetMockAccounts();
        mockSettings = { ...defaultMockSettings };
        persistMockSettings(mockSettings);
        mockCustomFolders = {};
        persistMockFolders(mockCustomFolders);
        mockSmartInbox = {};
        persistMockSmartInbox(mockSmartInbox);
        return {} as any;
      case "test_account_connection":
        await new Promise(r => setTimeout(r, 1500));
        if (args.password === "error") {
          throw "IMAP Login Failed: Invalid password";
        }
        if (args.imapHost?.includes("imap-fail")) {
          throw "IMAP Connection Failed: Mock IMAP connection failed";
        }
        if (args.smtpHost?.includes("smtp-fail") || args.smtpPort === 0) {
          throw "SMTP Connection Failed: Mock SMTP connection failed";
        }
        return {} as any;
      case "discover_account_settings":
        if (config.discoveryError) {
          throw new Error(config.discoveryError);
        }
        if (config.discoveryResult) {
          return config.discoveryResult as any;
        }
        return null as any;
      default:
        return [] as any;
    }
  }
  
  return tauriInvoke(cmd, args);
}
