import React from "react";
import { Email } from "../../hooks/useMailbox";
import DOMPurify from "dompurify";
import { Trash2, Archive, MailOpen, Flag, Paperclip, Download } from "lucide-react";
import { Button } from "../ui/Button";
import { invoke } from "../../lib/tauri";
import { cn } from "../../lib/utils";
import { useSettings } from "../../hooks/useSettings";

interface EmailDetailProps {
  email: Email | null;
  onDelete: (uid: string) => Promise<void>;
  onToggleFlag: (uid: string, flags: string[]) => Promise<void>;
  onMarkAsRead: (uid: string, seen: boolean) => Promise<void>;
}

export const EmailDetail: React.FC<EmailDetailProps> = ({ 
  email, 
  onDelete, 
  onToggleFlag, 
  onMarkAsRead 
}) => {
  const { settings } = useSettings();

  // Auto-download attachments if setting is enabled
  React.useEffect(() => {
    if (settings.auto_download_attachments && email?.attachments && email.attachments.length > 0) {
      console.log(`[AutoDownload] Started for email ${email.uid}`);
      email.attachments.forEach(async (att) => {
        try {
          // In a real app, we might download to a local cache folder.
          // Here we just trigger the command to 'warm' the cache (or just for demo).
          await invoke("get_attachment", {
            accountEmail: email.from,
            folderId: "INBOX", // Placeholder, should ideally be dynamic
            uid: email.uid,
            attachmentId: att.id
          });
          console.log(`[AutoDownload] Success: ${att.filename}`);
        } catch (e) {
          console.error(`[AutoDownload] Failed for ${att.filename}:`, e);
        }
      });
    }
  }, [email?.uid, settings.auto_download_attachments]);

  if (!email) {
    return (
      <main className="h-full flex-1 flex items-center justify-center bg-nexus-background">
        <div className="text-nexus-muted text-sm">Select an email to read</div>
      </main>
    );
  }

  const sanitizedBody = DOMPurify.sanitize(email.body_html || email.snippet);
  const isFlagged = email.flags?.includes("\\Flagged");
  const isSeen = email.flags?.includes("\\Seen");

  return (
    <main className="h-full flex-1 flex flex-col bg-nexus-background overflow-hidden text-nexus-foreground">
      <header className="p-8 border-b">
        <div className="flex justify-between items-start mb-6">
          <h1 className="text-2xl font-bold flex-1 mr-4">{email.subject}</h1>
          <div className="flex items-center gap-1">
            <Button 
                variant="ghost" 
                size="icon" 
                title={isSeen ? "Mark Unread" : "Mark Read"} 
                data-testid="action-unread"
                onClick={() => onMarkAsRead(email.uid, !isSeen)}
            >
              {isSeen ? (
                <MailOpen className="w-4 h-4 text-nexus-muted" />
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-nexus-accent" />
              )}
            </Button>
            <Button 
                variant="ghost" 
                size="icon" 
                title="Flag" 
                data-testid="action-flag"
                onClick={() => onToggleFlag(email.uid, email.flags || [])}
            >
              <Flag className={cn("w-4 h-4", isFlagged ? "fill-nexus-accent text-nexus-accent" : "text-nexus-muted")} />
            </Button>
            <Button variant="ghost" size="icon" title="Archive" data-testid="action-archive">
              <Archive className="w-4 h-4 text-nexus-muted" />
            </Button>
            <Button 
                variant="ghost" 
                size="icon" 
                title="Delete"
                data-testid="action-delete"
                className="hover:text-red-500 hover:bg-red-500/10"
                onClick={() => {
                    if (confirm("Move this email to trash?")) {
                        onDelete(email.uid);
                    }
                }}
            >
              <Trash2 className="w-4 h-4 text-nexus-muted" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-nexus-primary/10 flex items-center justify-center text-nexus-primary font-bold text-xs">
            {email.from.charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold">{email.from}</span>
            <span className="text-xs text-nexus-muted">To: me • {email.date}</span>
          </div>
        </div>
      </header>
      
      <div className="flex-1 overflow-y-auto p-8">
        <div 
          className="prose prose-sm max-w-none text-nexus-foreground"
          dangerouslySetInnerHTML={{ __html: sanitizedBody }} 
        />

        {email.attachments && email.attachments.length > 0 && (
          <div className="mt-12 pt-8 border-t">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
              <Paperclip className="w-4 h-4" />
              Attachments ({email.attachments.length})
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {email.attachments.map((att: any) => (
                <div 
                  key={att.id}
                  data-testid={`attachment-item-${att.id}`}
                  className="flex items-center justify-between p-3 rounded-nexus bg-nexus-sidebar/30 border border-nexus-border group"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium truncate">{att.filename}</span>
                    <span className="text-xs text-nexus-muted">{(att.size / 1024).toFixed(1)} KB</span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="opacity-0 group-hover:opacity-100"
                    data-testid={`attachment-download-${att.id}`}
                    onClick={async () => {
                        try {
                            const { save } = await import("@tauri-apps/plugin-dialog");
                            const { writeFile } = await import("@tauri-apps/plugin-fs");
                            
                            const filePath = await save({
                                defaultPath: att.filename,
                                filters: [{ 
                                    name: "Files", 
                                    extensions: [att.filename.split('.').pop() || '*'] 
                                }]
                            });

                            if (filePath) {
                                const data = await invoke<number[]>("get_attachment", {
                                    accountEmail: email.from,
                                    folderId: "INBOX", 
                                    uid: email.uid,
                                    attachmentId: att.id
                                });
                                await writeFile(filePath, new Uint8Array(data));
                                alert("File saved successfully!");
                            }
                        } catch (e) {
                            console.error("Failed to save attachment", e);
                            alert("Failed to save attachment");
                        }
                    }}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
};
