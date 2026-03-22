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
      case "list_accounts":
        return ["demo@nexus-mail.com"] as any;
      case "get_folders":
        return [
          { id: "mock-inbox", name: "Inbox", remote_id: "inbox", unread_count: 5 },
          { id: "mock-sent", name: "Sent", remote_id: "sent", unread_count: 0 }
        ] as any;
      case "get_emails":
        return [
          { uid: "1", subject: "Welcome to Nexus", from: "admin@nexus.local", date: "2026-03-20", snippet: "Enjoy your new modular email client!" }
        ] as any;
      default:
        return {} as any;
    }
  }
  
  return tauriInvoke(cmd, args);
}
