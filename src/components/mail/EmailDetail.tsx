import React from "react";
import { Email } from "../../hooks/useMailbox";
import DOMPurify from "dompurify";
import { Trash2, MailOpen, Flag, Paperclip, Download, Eye, Reply, Forward, X as CloseIcon, Loader2, RotateCcw } from "lucide-react";
import { Button } from "../ui/Button";
import { invoke, isTauri } from "../../lib/tauri";
import { cn, formatDate } from "../../lib/utils";
import { useSettings } from "../../hooks/useSettings";

interface EmailDetailProps {
  email: Email | null;
  accountEmail: string | null;
  folderId: string | null;
  detailStatus?: { state: "idle" | "loading" | "error"; message?: string };
  onRetryLoad: () => void;
  onDelete: (uid: string) => Promise<boolean>;
  onToggleFlag: (uid: string, flags: string[]) => Promise<void>;
  onMarkAsRead: (uid: string, seen: boolean) => Promise<void>;
  onReply: (email: Email) => void;
  onForward: (email: Email) => void;
}

export const EmailDetail: React.FC<EmailDetailProps> = ({ 
  email, 
  accountEmail,
  folderId,
  detailStatus = { state: "idle" },
  onRetryLoad,
  onDelete, 
  onToggleFlag, 
  onMarkAsRead,
  onReply,
  onForward
}) => {
  const { settings, updateSetting } = useSettings();
  const [showHeaders, setShowHeaders] = React.useState(false);
  const [allowRemoteImages, setAllowRemoteImages] = React.useState(false);
  const [preview, setPreview] = React.useState<{
    id: string;
    url: string;
    mime: string;
    filename: string;
  } | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = React.useState<string | null>(null);
  const [attachmentError, setAttachmentError] = React.useState<{ id: string; message: string; type: "download" | "preview" } | null>(null);
  const [attachmentDownloads, setAttachmentDownloads] = React.useState<Record<string, "idle" | "downloading" | "error">>({});

  React.useEffect(() => {
    setShowHeaders(false);
    setAllowRemoteImages(false);
    setPreview(null);
    setPreviewLoadingId(null);
    setAttachmentError(null);
    setAttachmentDownloads({});
  }, [email?.uid]);

  React.useEffect(() => {
    return () => {
      if (preview?.url) {
        URL.revokeObjectURL(preview.url);
      }
    };
  }, [preview?.url]);

  const fetchAttachmentBytes = React.useCallback(async (attachmentId: string) => {
    if (!email || !accountEmail || !folderId) {
      throw new Error("Missing email context for attachment");
    }
    return invoke<number[]>("get_attachment", {
      accountEmail,
      folderId,
      uid: email.uid,
      attachmentId
    });
  }, [accountEmail, email, folderId]);

  // Auto-download attachments if setting is enabled
  React.useEffect(() => {
    if (settings.auto_download_attachments && email?.attachments && email.attachments.length > 0) {
      console.log(`[AutoDownload] Started for email ${email.uid}`);
      email.attachments.forEach(async (att) => {
        try {
          // In a real app, we might download to a local cache folder.
          // Here we just trigger the command to 'warm' the cache (or just for demo).
          await fetchAttachmentBytes(att.id);
          console.log(`[AutoDownload] Success: ${att.filename}`);
        } catch (e) {
          console.error(`[AutoDownload] Failed for ${att.filename}:`, e);
        }
      });
    }
  }, [email?.uid, fetchAttachmentBytes, settings.auto_download_attachments]);

  const hasHtml = Boolean(email?.body_html);
  const hasDetailError = detailStatus.state === "error";
  const displayContent = hasDetailError ? "" : (email?.body_html || email?.body_text || email?.snippet || "");
  const { sanitizedBody, blockedRemoteImageCount } = React.useMemo(() => {
    if (!displayContent) {
      return { sanitizedBody: "", blockedRemoteImageCount: 0 };
    }
    if (hasHtml) {
      const sanitized = DOMPurify.sanitize(displayContent, { USE_PROFILES: { html: true }, KEEP_CONTENT: true });
      const shouldBlockRemoteImages = settings.remote_image_policy !== "always" && !allowRemoteImages;
      let htmlWithPolicy = sanitized;
      let blockedCount = 0;
       if (shouldBlockRemoteImages && typeof DOMParser !== "undefined") {
         const doc = new DOMParser().parseFromString(sanitized, "text/html");
         doc.querySelectorAll("img").forEach((image) => {
           const src = image.getAttribute("src") || "";
           if (!src) return;
           const isInlineImage = /^(cid:|data:|blob:)/i.test(src);
           const isRemoteImage = !isInlineImage;
           if (isRemoteImage) {
             blockedCount += 1;
             image.removeAttribute("src");
             image.setAttribute("data-blocked-src", src);
            image.setAttribute("alt", image.getAttribute("alt") || "Remote image blocked");
            image.classList.add("opacity-60");
          }
        });
        htmlWithPolicy = doc.body.innerHTML;
      }

      const textContent = htmlWithPolicy.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      const fallbackText = email?.body_text?.trim();
      if (fallbackText && !textContent.includes(fallbackText)) {
        const safeFallback = DOMPurify.sanitize(fallbackText, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
        return { sanitizedBody: `<p>${safeFallback}</p>${htmlWithPolicy}`, blockedRemoteImageCount: blockedCount };
      }
      return { sanitizedBody: htmlWithPolicy, blockedRemoteImageCount: blockedCount };
    }
    return {
      sanitizedBody: DOMPurify.sanitize(displayContent, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }),
      blockedRemoteImageCount: 0,
    };
  }, [allowRemoteImages, displayContent, hasHtml, email?.body_text, settings.remote_image_policy]);

  if (!email) {
    return (
      <main className="h-full flex-1 flex items-center justify-center bg-nexus-background">
        <div className="text-nexus-muted text-sm">Select an email to read</div>
      </main>
    );
  }

  const isFlagged = email.flags?.includes("\\Flagged");
  const isSeen = email.flags?.includes("\\Seen");
  const toLabel = email.to?.length ? email.to.join(", ") : "me";
  const ccLabel = email.cc?.length ? email.cc.join(", ") : null;
  const headerEntries = email.headers ? Object.entries(email.headers) : [];
  const isPreviewable = (mime?: string) => !!mime && (mime.startsWith("image/") || mime === "application/pdf");
  const handleAttachmentDownload = async (att: any) => {
    const startedAt = Date.now();
    const ensureMinDuration = async () => {
      const elapsed = Date.now() - startedAt;
      if (elapsed < 200) {
        await new Promise((resolve) => setTimeout(resolve, 200 - elapsed));
      }
    };
    setAttachmentDownloads((prev) => ({ ...prev, [att.id]: "downloading" }));
    setAttachmentError(null);
    try {
      if (!isTauri) {
        await fetchAttachmentBytes(att.id);
        await ensureMinDuration();
        setAttachmentDownloads((prev) => ({ ...prev, [att.id]: "idle" }));
        setAttachmentError(null);
        return;
      }
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeFile } = await import("@tauri-apps/plugin-fs");
      const extension = att.filename.includes(".")
        ? att.filename.split(".").pop()
        : undefined;
      const defaultPath = settings.download_directory
        ? `${settings.download_directory.replace(/\/$/, "")}/${att.filename}`
        : att.filename;
      const filePath = await save({
        defaultPath,
        filters: extension
          ? [{
              name: "Files",
              extensions: [extension]
            }]
          : undefined
      });

      if (filePath) {
        const data = await fetchAttachmentBytes(att.id);
        await writeFile(filePath, new Uint8Array(data), { create: true });
      }
      await ensureMinDuration();
      setAttachmentDownloads((prev) => ({ ...prev, [att.id]: "idle" }));
      setAttachmentError(null);
      if (filePath) {
        alert("File saved successfully!");
      }
    } catch (e) {
      console.error("Failed to save attachment", e);
      const message = e instanceof Error ? e.message : String(e);
      setAttachmentError({ id: att.id, message: `Failed to save attachment: ${message}`, type: "download" });
      await ensureMinDuration();
      setAttachmentDownloads((prev) => ({ ...prev, [att.id]: "error" }));
      alert(`Failed to save attachment: ${message}`);
    }
  };

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
                    void onDelete(email.uid);
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
            <div
              data-testid="detail-headers-panel"
              className="mt-3 rounded-nexus border border-nexus-border bg-nexus-sidebar/30 p-3 text-xs text-nexus-muted"
            >
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

        {detailStatus.state === "loading" && (
          <div className="mt-4 flex items-center gap-2 text-xs text-nexus-muted" data-testid="detail-loading">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading email content...
          </div>
        )}
        {hasHtml && blockedRemoteImageCount > 0 && (
          <div
            className="mt-4 flex items-center justify-between gap-3 rounded-nexus border border-amber-400/40 bg-amber-50 px-3 py-2 text-xs text-amber-800"
            data-testid="remote-image-banner"
          >
            <span>
              Blocked {blockedRemoteImageCount} remote image{blockedRemoteImageCount === 1 ? "" : "s"} for privacy.
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                data-testid="remote-image-allow"
                onClick={() => setAllowRemoteImages(true)}
              >
                Load for this email
              </Button>
              <Button
                variant="secondary"
                size="sm"
                data-testid="remote-image-allow-always"
                onClick={() => {
                  setAllowRemoteImages(true);
                  void updateSetting("remote_image_policy", "always");
                }}
              >
                Always load
              </Button>
            </div>
          </div>
        )}
      </header>
      
      <div className="flex-1 overflow-y-auto p-8">
        {hasDetailError ? (
          <div
            className="rounded-nexus border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-600 space-y-3"
            data-testid="detail-error"
          >
            <div>Failed to load email content: {detailStatus.message || "Unknown error"}</div>
            <Button variant="secondary" size="sm" onClick={onRetryLoad} data-testid="detail-retry">
              Try loading again
            </Button>
          </div>
        ) : (
          <div 
            className={cn(
              "prose prose-sm max-w-none text-nexus-foreground",
              !hasHtml && "whitespace-pre-wrap font-sans"
            )}
            dangerouslySetInnerHTML={{ __html: sanitizedBody }} 
          />
        )}

        {email.attachments && email.attachments.length > 0 && (
          <div className="mt-12 pt-8 border-t">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
              <Paperclip className="w-4 h-4" />
              Attachments ({email.attachments.length})
            </h3>
            {attachmentError && (
              <div className="mb-3 flex items-center gap-3 text-xs text-red-500" data-testid="attachment-download-error">
                <span>{attachmentError.message}</span>
                {attachmentError.type === "download" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    data-testid="attachment-download-retry"
                    onClick={() => {
                      const target = email.attachments?.find((att) => att.id === attachmentError.id);
                      if (target) {
                        void handleAttachmentDownload(target);
                      }
                    }}
                  >
                    Retry download
                  </Button>
                )}
              </div>
            )}
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
                            const data = await fetchAttachmentBytes(att.id);
                            const blob = new Blob([new Uint8Array(data)], { type: att.mime_type });
                            const url = URL.createObjectURL(blob);
                            setPreview({ id: att.id, url, mime: att.mime_type, filename: att.filename });
                            setAttachmentError(null);
                          } catch (e) {
                            console.error("Failed to preview attachment", e);
                            setAttachmentError({
                              id: att.id,
                              message: e instanceof Error ? e.message : String(e),
                              type: "preview"
                            });
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
                      aria-busy={attachmentDownloads[att.id] === "downloading"}
                      disabled={attachmentDownloads[att.id] === "downloading"}
                      title={attachmentDownloads[att.id] === "error" ? "Retry download" : "Download attachment"}
                      onClick={() => {
                        void handleAttachmentDownload(att);
                      }}
                    >
                      {attachmentDownloads[att.id] === "downloading" ? (
                        <Loader2
                          className="w-4 h-4 animate-spin"
                          data-testid={`attachment-download-progress-${att.id}`}
                        />
                      ) : attachmentDownloads[att.id] === "error" ? (
                        <RotateCcw className="w-4 h-4 text-red-500" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {preview && (
              <div className="mt-6 rounded-nexus border border-nexus-border bg-nexus-sidebar/20 p-4" data-testid="attachment-preview">
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
