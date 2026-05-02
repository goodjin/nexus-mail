import { invoke as tauriInvoke } from "@tauri-apps/api/core";

export const isTauri = !!(window as any).__TAURI_INTERNALS__;

const mockAccounts = [
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
        return [
          { id: "mock-inbox", name: "Inbox", remote_id: "inbox", unread_count: 95, system_role: "INBOX" },
          { id: "mock-sent", name: "Sent", remote_id: "sent", unread_count: 0, system_role: "SENT" },
          { id: "mock-drafts", name: "Drafts", remote_id: "drafts", unread_count: 2, system_role: "DRAFTS" },
          { id: "mock-spam", name: "Spam", remote_id: "spam", unread_count: 5, system_role: "SPAM" },
          { id: "mock-trash", name: "Trash", remote_id: "trash", unread_count: 0, system_role: "TRASH" }
        ] as any;
      case "get_emails":
        return Array.from({ length: 100 }, (_, i) => {
          const id = 100 - i;
          return { 
            uid: String(id), 
            subject: `Nexus Mail Sample #${id}`, 
            from: `sender-${id}@mock.com`, 
            date: "Wed, 25 Mar 2026 10:19:36 +0800", 
            snippet: `Mock content for message ${id}`,
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
      case "test_account_connection":
        await new Promise(r => setTimeout(r, 1500));
        if (args.password === "error") {
          throw "Mock Connection Failed: Invalid password";
        }
        return {} as any;
      default:
        return [] as any;
    }
  }
  
  return tauriInvoke(cmd, args);
}
