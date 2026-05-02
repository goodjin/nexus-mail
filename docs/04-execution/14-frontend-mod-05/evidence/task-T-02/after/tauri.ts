import { invoke as tauriInvoke } from "@tauri-apps/api/core";

export const isTauri = !!(window as any).__TAURI_INTERNALS__;

const MOCK_ACCOUNTS_KEY = "nexus-mail-mock-accounts";
const MOCK_CONFIG_KEY = "nexus-mail-mock-config";
const MOCK_SEND_EMAIL_KEY = "nexus-mail-mock-send-email";
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

type MockConfig = {
  syncShouldFail?: boolean;
  syncFailMessage?: string;
  syncUnreadDelta?: Record<string, number>;
  syncEmailSubjectPrefix?: string;
  emptyFolders?: string[];
  folderSubjectMode?: "folder-key";
  sendShouldFail?: boolean;
  sendFailMessage?: string;
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
  };
  if (existingIndex >= 0) {
    mockAccounts[existingIndex] = nextAccount;
  } else {
    mockAccounts.push(nextAccount);
  }
  persistMockAccounts(mockAccounts);
};

const recordMockSearchHistory = (accountEmail: string, query: string) => {
  const history = mockSearchHistory[accountEmail] ?? [];
  const now = Date.now();
  const existingIndex = history.findIndex(entry => entry.query === query);
  if (existingIndex >= 0) {
    history.splice(existingIndex, 1);
  }
  history.unshift({ query, last_used_at: now });
  mockSearchHistory[accountEmail] = history.slice(0, 10);
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
  return [
    { id: `${accountEmail}::inbox`, name: "Inbox", remote_id: "inbox", unread_count: counts.inbox, system_role: "INBOX" },
    { id: `${accountEmail}::sent`, name: "Sent", remote_id: "sent", unread_count: counts.sent, system_role: "SENT" },
    { id: `${accountEmail}::drafts`, name: "Drafts", remote_id: "drafts", unread_count: counts.drafts, system_role: "DRAFTS" },
    { id: `${accountEmail}::archive`, name: "Archive", remote_id: "archive", unread_count: counts.archive, system_role: "ARCHIVE" },
    { id: `${accountEmail}::spam`, name: "Spam", remote_id: "spam", unread_count: counts.spam, system_role: "SPAM" },
    { id: `${accountEmail}::trash`, name: "Trash", remote_id: "trash", unread_count: counts.trash, system_role: "TRASH" }
  ];
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
        await new Promise(r => setTimeout(r, 1000));
        if (config.syncShouldFail) {
          throw new Error(config.syncFailMessage ?? "Mock sync failed");
        }
        if (args?.email) {
          mockSyncCounts[args.email] = (mockSyncCounts[args.email] ?? 0) + 1;
        }
        return "Mock sync success" as any;
      case "search_emails":
        const q = args.query.toLowerCase();
        const searchAccount = args.accountEmail ?? mockAccounts[0]?.email ?? "demo@nexus-mail.com";
        recordMockSearchHistory(searchAccount, args.query);
        return [
          { uid: "search-1", subject: `Found: ${args.query}`, from: "search@mock.com", date: "Now", snippet: "Matching search result" }
        ].filter(e => e.subject.toLowerCase().includes(q) || e.snippet.toLowerCase().includes(q)) as any;
      case "search_emails_with_filters":
        const query = args.query.toLowerCase();
        const filters = args.filters ?? {};
        const filteredAccount = args.accountEmail ?? mockAccounts[0]?.email ?? "demo@nexus-mail.com";
        recordMockSearchHistory(filteredAccount, args.query);
        const from = filters.sender ?? "search@mock.com";
        const attachments = filters.has_attachments
          ? [{ id: "mock-att", filename: "filter.pdf", size: 512, mime_type: "application/pdf" }]
          : [];
        return [
          { uid: "search-1", subject: `Found: ${args.query}`, from, date: "Now", snippet: "Matching search result", attachments }
        ]
          .filter(e => e.subject.toLowerCase().includes(query) || e.snippet.toLowerCase().includes(query))
          .filter(e => !filters.sender || e.from.toLowerCase().includes(filters.sender.toLowerCase()))
          .filter(e => !filters.has_attachments || (e.attachments && e.attachments.length > 0)) as any;
      case "get_search_history":
        return getMockSearchHistory(args.accountEmail ?? mockAccounts[0]?.email ?? "demo@nexus-mail.com") as any;
      case "clear_search_history":
        mockSearchHistory[args.accountEmail ?? mockAccounts[0]?.email ?? "demo@nexus-mail.com"] = [];
        return {} as any;
      case "list_accounts":
        return mockAccounts.map((account) => account.email) as any;
      case "get_accounts_detailed":
        return mockAccounts.map((account) => ({ ...account })) as any;
      case "get_folders":
        return buildMockFolders(args?.accountEmail ?? mockAccounts[0]?.email ?? "demo@nexus-mail.com") as any;
      case "get_emails":
        const { accountEmail, folderKey } = parseFolderId(args?.folderId);
        if (config.emptyFolders?.map(f => f.toLowerCase()).includes(folderKey.toLowerCase())) {
          return [] as any;
        }
        const isDemo = accountEmail === "demo@nexus-mail.com";
        return Array.from({ length: 100 }, (_, i) => {
          const id = 100 - i;
          const subject = isDemo
            ? resolveMockSubject(accountEmail, folderKey, id, config)
            : `${accountEmail} ${folderKey.toUpperCase()} Message #${id}`;
          return { 
            uid: String(id), 
            subject, 
            from: isDemo ? `sender-${id}@mock.com` : `${folderKey}-${id}@${accountEmail.split("@")[1] || "mock.com"}`, 
            date: "Wed, 25 Mar 2026 10:19:36 +0800", 
            snippet: isDemo && id == 100 ? "SECURITY TEST" : (isDemo ? `Mock content for message ${id}` : `Mock content for ${accountEmail} ${folderKey} ${id}`),
            flags: id > 5 ? ["\\Seen"] : [] // Mock some unread
          };
        }) as any;
      case "get_email_details":
        if (String(args.uid) == "100") {
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
        return new Uint8Array([72, 101, 108, 108, 111]) as any;
      case "update_email_flag":
      case "update_account_details":
        if (cmd === "update_account_details") {
          upsertMockAccount(args);
        }
      case "update_account_password":
      case "update_setting":
        return {} as any;
      case "get_all_settings":
      case "get_settings":
        return {
          "auto_download_attachments": "false",
          "background_sync_history": "true",
          "theme": "system"
        } as any;
      case "get_setting":
        return "mock-value" as any;
      case "reset_database":
        resetMockAccounts();
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
      default:
        return [] as any;
    }
  }
  
  return tauriInvoke(cmd, args);
}
