import { invoke as tauriInvoke } from "@tauri-apps/api/core";

export const isTauri = !!(window as any).__TAURI_INTERNALS__;

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
        return ["demo@nexus-mail.com"] as any;
      case "get_accounts_detailed":
        return [{
          id: "demo-id",
          email: "demo@nexus-mail.com",
          display_name: "Demo User",
          imap_host: "localhost",
          imap_port: 993,
          imap_use_tls: true,
          smtp_host: "localhost",
          smtp_port: 465,
          smtp_use_tls: true
        }] as any;
      case "get_folders":
        return [
          { id: "mock-inbox", name: "Inbox", remote_id: "inbox", unread_count: 95 },
          { id: "mock-sent", name: "Sent", remote_id: "sent", unread_count: 0 },
          { id: "mock-drafts", name: "Drafts", remote_id: "drafts", unread_count: 2 },
          { id: "mock-spam", name: "Spam", remote_id: "spam", unread_count: 5 },
          { id: "mock-trash", name: "Trash", remote_id: "trash", unread_count: 0 },
          { id: "mock-archive", name: "Archive", remote_id: "archive", unread_count: 0 }
        ] as any;
      case "get_emails":
        return Array.from({ length: 100 }, (_, i) => {
          const id = 100 - i;
          return { 
            uid: String(id), 
            subject: `Nexus Mail Sample #${id}`, 
            from: `sender-${id}@mock.com`, 
            date: "10:00 AM", 
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
      default:
        return [] as any;
    }
  }
  
  return tauriInvoke(cmd, args);
}
