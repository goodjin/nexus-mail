import React from "react";
import { Email } from "../../hooks/useMailbox";
import DOMPurify from "dompurify";
import { Trash2, Archive, MailOpen, Flag, Paperclip, Download } from "lucide-react";
import { Button } from "../ui/Button";
import { invoke } from "../../lib/tauri";

interface EmailDetailProps {
  email: Email | null;
}

export const EmailDetail: React.FC<EmailDetailProps> = ({ email }) => {
  if (!email) {
    return (
      <main className="h-full flex-1 flex items-center justify-center bg-nexus-background">
        <div className="text-nexus-muted text-sm">Select an email to read</div>
      </main>
    );
  }

  const sanitizedBody = DOMPurify.sanitize(email.body_html || email.snippet);

  return (
    <main className="h-full flex-1 flex flex-col bg-nexus-background overflow-hidden">
      <header className="p-8 border-b">
        <div className="flex justify-between items-start mb-6">
          <h1 className="text-2xl font-bold flex-1 mr-4">{email.subject}</h1>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" title="Mark Unread" data-testid="action-unread">
              <MailOpen className="w-4 h-4 text-nexus-muted" />
            </Button>
            <Button variant="ghost" size="icon" title="Flag" data-testid="action-flag">
              <Flag className="w-4 h-4 text-nexus-muted" />
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
                onClick={async () => {
                    if (confirm("Move this email to trash?")) {
                        await invoke("delete_email", { accountEmail: email.from, folderId: "INBOX", uid: email.uid });
                        window.location.reload(); // Simple refresh for now
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
