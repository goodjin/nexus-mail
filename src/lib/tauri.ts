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
      case "get_folders":
        return [
          { id: "mock-inbox", name: "Inbox", remote_id: "inbox", unread_count: 100 },
          { id: "mock-sent", name: "Sent", remote_id: "sent", unread_count: 0 }
        ] as any;
      case "get_emails":
        return Array.from({ length: 100 }, (_, i) => {
          const id = 100 - i;
          if (id === 99) {
            return {
              uid: String(id),
              subject: "⚠️ SECURITY TEST: Malicious Email",
              from: "attacker@evil.com",
              date: "Now",
              snippet: "This email contains an XSS payload.",
              body_html: "<div><h1>Safe Title</h1><script>window.XSS_EXECUTED = true;</script><img src='x' onerror='window.XSS_EXECUTED = true;'></div>"
            };
          }
          return { 
            uid: String(id), 
            subject: `Nexus Mail Sample #${id}`, 
            from: `sender-${id}@mock.com`, 
            date: "10:00 AM", 
            snippet: `Mock content for message ${id}` 
          };
        }) as any;
      default:
        return {} as any;
    }
  }
  
  return tauriInvoke(cmd, args);
}
