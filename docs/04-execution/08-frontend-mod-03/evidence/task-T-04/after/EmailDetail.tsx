import React from "react";
import { Email } from "../../hooks/useMailbox";
import DOMPurify from "dompurify";
import { Trash2, MailOpen, Flag, Paperclip, Download, Eye, Reply, Forward, X as CloseIcon } from "lucide-react";
import { Button } from "../ui/Button";
import { invoke } from "../../lib/tauri";
import { cn, formatDate } from "../../lib/utils";
import { useSettings } from "../../hooks/useSettings";

interface EmailDetailProps {
  email: Email | null;
  onDelete: (uid: string) => Promise<void>;
  onToggleFlag: (uid: string, flags: string[]) => Promise<void>;
  onMarkAsRead: (uid: string, seen: boolean) => Promise<void>;
  onReply: (email: Email) => void;
  onForward: (email: Email) => void;
}

export const EmailDetail: React.FC<EmailDetailProps> = ({ 
  email, 
  onDelete, 
  onToggleFlag, 
  onMarkAsRead,
  onReply,
  onForward
}) => {
  const { settings } = useSettings();
  const [showHeaders, setShowHeaders] = React.useState(false);
  const [preview, setPreview] = React.useState<{
    id: string;
    url: string;
    mime: string;
    filename: string;
  } | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setShowHeaders(false);
    setPreview(null);
    setPreviewLoadingId(null);
  }, [email?.uid]);

  React.useEffect(() => {
    return () => {
      if (preview?.url) {
        URL.revokeObjectURL(preview.url);
      }
    };
  }, [preview?.url]);

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

  const hasHtml = !!email.body_html;
  const displayContent = email.body_html || email.body_text || email.snippet;
  const sanitizedBody = React.useMemo(() => {
    if (hasHtml) {
      const sanitized = DOMPurify.sanitize(displayContent, { USE_PROFILES: { html: true }, KEEP_CONTENT: true });
      const textContent = sanitized.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      const fallbackText = email.body_text?.trim();
      if (fallbackText && !textContent.includes(fallbackText)) {
        const safeFallback = DOMPurify.sanitize(fallbackText, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
        return `<p>${safeFallback}</p>${sanitized}`;
      }
      return sanitized;
    }
    return DOMPurify.sanitize(displayContent, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  }, [displayContent, hasHtml, email.body_text]);
  const isFlagged = email.flags?.includes("\\Flagged");
  const isSeen = email.flags?.includes("\\Seen");
  const toLabel = email.to?.length ? email.to.join(", ") : "me";
  const ccLabel = email.cc?.length ? email.cc.join(", ") : null;
  const headerEntries = email.headers ? Object.entries(email.headers) : [];
  const isPreviewable = (mime?: string) => !!mime && (mime.startsWith("image/") || mime === "application/pdf");

  return (
    <main className="h-full flex-1 flex flex-col bg-nexus-background overflow-hidden text-nexus-foreground">
      <header className="px-8 py-6 border-b">
        <div className="flex justify-between items-start mb-6">
          <h1 className="text-2xl font-bold flex-1 mr-4 leading-tight">{email.subject}</h1>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              title="Reply"
              data-testid="action-reply"
              onClick={() => onReply(email)}
            >
              <Reply className="w-4 h-4 text-nexus-muted" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Forward"
              data-testid="action-forward"
              onClick={() => onForward(email)}
            >
              <Forward className="w-4 h-4 text-nexus-muted" />
            </Button>
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
        
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-nexus-primary/10 flex items-center justify-center text-nexus-primary font-bold text-sm mt-1">
            {email.from.charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-nexus-foreground">{email.from}</span>
            </div>
            <div className="text-[11px] text-nexus-muted flex flex-col gap-0.5">
              <p>收件人: <span className="text-nexus-foreground/80">{toLabel}</span></p>
              {ccLabel && (
                <p>抄送: <span className="text-nexus-foreground/80">{ccLabel}</span></p>
              )}
              <p>日期: <span className="text-nexus-foreground/80">{formatDate(email.date)}</span></p>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <button
            type="button"
            data-testid="toggle-headers"
            className="text-xs text-nexus-muted hover:text-nexus-foreground transition-colors"
            onClick={() => setShowHeaders((prev) => !prev)}
          >
            {showHeaders ? "隐藏头信息" : "展开头信息"}
          </button>
          {showHeaders && (
            <div className="mt-3 rounded-nexus border border-nexus-border bg-nexus-sidebar/30 p-3 text-xs text-nexus-muted">
              {headerEntries.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {headerEntries.map(([key, value]) => (
                    <div key={key} className="flex gap-2">
                      <span className="min-w-[90px] font-semibold text-nexus-foreground/80">{key}</span>
                      <span className="break-all">{value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div>暂无头信息</div>
              )}
            </div>
          )}
        </div>
      </header>
      
      <div className="flex-1 overflow-y-auto p-8">
        <div 
          className={cn(
            "prose prose-sm max-w-none text-nexus-foreground",
            !hasHtml && "whitespace-pre-wrap font-sans"
          )}
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
                  <div className="flex items-center gap-1">
                    {isPreviewable(att.mime_type) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100"
                        data-testid={`attachment-preview-${att.id}`}
                        onClick={async () => {
                          setPreviewLoadingId(att.id);
                          try {
                            const data = await invoke<number[]>("get_attachment", {
                              accountEmail: email.from,
                              folderId: "INBOX",
                              uid: email.uid,
                              attachmentId: att.id
                            });
                            const blob = new Blob([new Uint8Array(data)], { type: att.mime_type });
                            const url = URL.createObjectURL(blob);
                            setPreview({ id: att.id, url, mime: att.mime_type, filename: att.filename });
                          } catch (e) {
                            console.error("Failed to preview attachment", e);
                          } finally {
                            setPreviewLoadingId(null);
                          }
                        }}
                      >
                        {previewLoadingId === att.id ? (
                          <span className="text-[10px] text-nexus-muted">...</span>
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </Button>
                    )}
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
                </div>
              ))}
            </div>
            {preview && (
              <div className="mt-6 rounded-nexus border border-nexus-border bg-nexus-sidebar/20 p-4">
                <div className="flex items-center justify-between text-xs text-nexus-muted mb-3">
                  <span>预览: {preview.filename}</span>
                  <button
                    type="button"
                    data-testid="attachment-preview-close"
                    className="text-nexus-muted hover:text-nexus-foreground"
                    onClick={() => setPreview(null)}
                  >
                    <CloseIcon className="w-4 h-4" />
                  </button>
                </div>
                {preview.mime.startsWith("image/") ? (
                  <img src={preview.url} alt={preview.filename} className="max-h-64 rounded-nexus border" />
                ) : (
                  <iframe title={preview.filename} src={preview.url} className="w-full h-64 rounded-nexus border" />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
};
