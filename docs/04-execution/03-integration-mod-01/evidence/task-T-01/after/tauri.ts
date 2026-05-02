import { invoke as tauriInvoke } from "@tauri-apps/api/core";

export const isTauri = !!(window as any).__TAURI_INTERNALS__;

const MOCK_ACCOUNTS_KEY = "nexus-mail-mock-accounts";
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

const resolveFolderCounts = (accountEmail: string) => {
  if (accountEmail === "demo@nexus-mail.com") {
    return { inbox: 95, sent: 0, drafts: 2, spam: 5, trash: 0 };
  }
  return { inbox: 12, sent: 1, drafts: 0, spam: 0, trash: 0 };
};

const buildMockFolders = (accountEmail: string) => {
  const counts = resolveFolderCounts(accountEmail);
  return [
    { id: `${accountEmail}::inbox`, name: "Inbox", remote_id: "inbox", unread_count: counts.inbox, system_role: "INBOX" },
    { id: `${accountEmail}::sent`, name: "Sent", remote_id: "sent", unread_count: counts.sent, system_role: "SENT" },
    { id: `${accountEmail}::drafts`, name: "Drafts", remote_id: "drafts", unread_count: counts.drafts, system_role: "DRAFTS" },
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

export async function invoke<T>(cmd: string, args?: any): Promise<T> {
  if (!isTauri) {
    console.log(`[Mock Invoke] ${cmd}`, args);
    
    // 模拟不同命令的返回
    switch (cmd) {
      case "send_email":
        await new Promise(r => setTimeout(r, 500));
        return "Mock email sent" as any;
      case "sync_account":
        await new Promise(r => setTimeout(r, 1000));
        return "Mock sync success" as any;
      case "search_emails":
        const q = args.query.toLowerCase();
        return [
          { uid: "search-1", subject: `Found: ${args.query}`, from: "search@mock.com", date: "Now", snippet: "Matching search result" }
        ].filter(e => e.subject.toLowerCase().includes(q) || e.snippet.toLowerCase().includes(q)) as any;
      case "list_accounts":
        return mockAccounts.map((account) => account.email) as any;
      case "get_accounts_detailed":
        return mockAccounts.map((account) => ({ ...account })) as any;
      case "get_folders":
        return buildMockFolders(args?.accountEmail ?? mockAccounts[0]?.email ?? "demo@nexus-mail.com") as any;
      case "get_emails":
        const { accountEmail, folderKey } = parseFolderId(args?.folderId);
        const isDemo = accountEmail === "demo@nexus-mail.com";
        return Array.from({ length: 100 }, (_, i) => {
          const id = 100 - i;
          const subject = isDemo
            ? `Nexus Mail Sample #${id}`
            : `${accountEmail} ${folderKey.toUpperCase()} Message #${id}`;
          return { 
            uid: String(id), 
            subject, 
            from: isDemo ? `sender-${id}@mock.com` : `${folderKey}-${id}@${accountEmail.split("@")[1] || "mock.com"}`, 
            date: "Wed, 25 Mar 2026 10:19:36 +0800", 
            snippet: isDemo ? `Mock content for message ${id}` : `Mock content for ${accountEmail} ${folderKey} ${id}`,
            flags: id > 5 ? ["\\Seen"] : [] // Mock some unread
          };
        }) as any;
      case "get_email_details":
        return {
          uid: args.uid,
          body_html: "<div><h1>Mock Email Content</h1><p>This is a mock email.</p></div>",
          body_text: "Mock Email Content",
          attachments: []
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
