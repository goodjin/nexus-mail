import React, { useState } from 'react';
import { X, Send, Paperclip } from 'lucide-react';
import { Button } from "../ui/Button";
import { invoke } from "../../lib/tauri";
import { RichTextEditor } from "./RichTextEditor";

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  fromAccount: string;
  initialValues?: {
    to?: string;
    cc?: string;
    bcc?: string;
    subject?: string;
    body?: string;
  };
}

export const ComposeModal: React.FC<ComposeModalProps> = ({ isOpen, onClose, fromAccount, initialValues }) => {
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Array<{ name: string, path: string, size: number }>>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [draftStatus, setDraftStatus] = useState<string | null>(null);
  const maxAttachmentBytes = 25 * 1024 * 1024;
  const draftKey = `nexus-compose-draft:${fromAccount}`;

  const loadDraft = () => {
    try {
      const stored = localStorage.getItem(draftKey);
      if (!stored) return null;
      return JSON.parse(stored) as {
        to?: string;
        cc?: string;
        bcc?: string;
        subject?: string;
        body?: string;
      };
    } catch {
      return null;
    }
  };

  React.useEffect(() => {
    if (!isOpen) return;
    const draft = initialValues ? null : loadDraft();
    setTo(initialValues?.to ?? draft?.to ?? '');
    setCc(initialValues?.cc ?? draft?.cc ?? '');
    setBcc(initialValues?.bcc ?? draft?.bcc ?? '');
    setSubject(initialValues?.subject ?? draft?.subject ?? '');
    setBody(initialValues?.body ?? draft?.body ?? '');
    setAttachments([]);
    setError(null);
    setSending(false);
    setDraftStatus(draft ? "Draft loaded" : null);
  }, [
    isOpen,
    initialValues?.to,
    initialValues?.cc,
    initialValues?.bcc,
    initialValues?.subject,
    initialValues?.body
  ]);

  React.useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      const payload = { to, cc, bcc, subject, body };
      try {
        localStorage.setItem(draftKey, JSON.stringify(payload));
        setDraftStatus("Draft saved");
      } catch {
        setDraftStatus("Draft save failed");
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [isOpen, to, cc, bcc, subject, body, draftKey]);

  if (!isOpen) return null;

  const applyAttachmentLimits = (newAttachments: Array<{ name: string; path: string; size: number }>) => {
    if (newAttachments.length === 0) return;
    const oversized = newAttachments.filter(att => att.size > maxAttachmentBytes);
    if (oversized.length > 0) {
      setError(`Attachment too large (max 25 MB): ${oversized.map(att => att.name).join(", ")}`);
    }
    const valid = newAttachments.filter(att => att.size <= maxAttachmentBytes);
    if (valid.length > 0) {
      setAttachments((prev) => [...prev, ...valid]);
    }
  };

  const handleAddAttachment = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const { lstat } = await import("@tauri-apps/plugin-fs");
      
      const selected = await open({
        multiple: true,
        title: "Select Attachments"
      });

      if (selected && Array.isArray(selected)) {
        const newAttachments = await Promise.all(selected.map(async (path) => {
          const stats = await lstat(path);
          return {
            name: path.split('/').pop() || "unnamed",
              path,
              size: stats.size
          };
        }));
        applyAttachmentLimits(newAttachments);
      } else if (selected) {
          const path = selected as string;
          const stats = await lstat(path);
          applyAttachmentLimits([{
            name: path.split('/').pop() || "unnamed",
            path,
            size: stats.size
          }]);
      }
    } catch (e) {
      console.error("Failed to add attachment", e);
    }
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    const files = Array.from(event.dataTransfer.files);
    const paths = files.map((file) => (file as File & { path?: string }).path).filter(Boolean) as string[];
    if (paths.length === 0) {
      setError("Drag-and-drop attachments require file system access.");
      return;
    }
    try {
      const { lstat } = await import("@tauri-apps/plugin-fs");
      const newAttachments = await Promise.all(paths.map(async (path) => {
        const stats = await lstat(path);
        return {
          name: path.split('/').pop() || "unnamed",
          path,
          size: stats.size
        };
      }));
      applyAttachmentLimits(newAttachments);
    } catch (e) {
      console.error("Failed to handle dropped attachments", e);
    }
  };

  const handleSend = async () => {
    setError(null);
    const strippedBody = body.replace(/<[^>]*>/g, '').trim();
    if (!to.trim() || !subject.trim() || !strippedBody) {
      setError("Please fill in recipient, subject, and body");
      return;
    }

    setSending(true);
    try {
      await invoke("send_email", {
        from: fromAccount,
        to,
        cc,
        bcc,
        subject,
        body,
        attachments: attachments.map(a => a.path)
      });
      try {
        localStorage.removeItem(draftKey);
      } catch {
        // ignore storage failures
      }
      alert("Email sent successfully");
      onClose();
    } catch (e) {
      setError(`Failed to send email: ${e}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-nexus-card w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
        <div className="p-4 border-b flex items-center justify-between bg-nexus-sidebar/30">
          <h2 className="font-semibold text-nexus-primary">New Message</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>
        
        <div className="flex flex-col p-6 space-y-4">
          {error && (
            <div 
              data-testid="compose-error"
              className="bg-red-500/10 border border-red-500/20 text-red-500 text-xs p-2 rounded-lg animate-in fade-in slide-in-from-top-2"
            >
              {error}
            </div>
          )}
          {draftStatus && (
            <div
              data-testid="compose-draft-status"
              className="text-[10px] text-nexus-muted"
            >
              {draftStatus}
            </div>
          )}
          
          <div className="flex items-center space-x-3 border-b pb-2">
            <span className="text-nexus-muted w-12 text-sm">From:</span>
            <span className="font-medium text-nexus-primary text-sm">{fromAccount}</span>
          </div>
          
          <div className="flex items-center space-x-3 border-b pb-2">
            <label htmlFor="to" className="text-nexus-muted w-12 text-sm">To:</label>
            <input 
              id="to"
              type="text" 
              className="flex-1 bg-transparent border-none focus:outline-none text-nexus-primary text-sm"
              placeholder="recipient@example.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>

          <div className="flex items-center space-x-3 border-b pb-2">
            <label htmlFor="cc" className="text-nexus-muted w-12 text-sm">Cc:</label>
            <input
              id="cc"
              type="text"
              className="flex-1 bg-transparent border-none focus:outline-none text-nexus-primary text-sm"
              placeholder="cc@example.com"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
            />
          </div>

          <div className="flex items-center space-x-3 border-b pb-2">
            <label htmlFor="bcc" className="text-nexus-muted w-12 text-sm">Bcc:</label>
            <input
              id="bcc"
              type="text"
              className="flex-1 bg-transparent border-none focus:outline-none text-nexus-primary text-sm"
              placeholder="bcc@example.com"
              value={bcc}
              onChange={(e) => setBcc(e.target.value)}
            />
          </div>
          
          <div className="flex items-center space-x-3 border-b pb-2">
            <label htmlFor="subject" className="text-nexus-muted w-12 text-sm">Subject:</label>
            <input 
              id="subject"
              type="text" 
              className="flex-1 bg-transparent border-none focus:outline-none text-nexus-primary font-medium text-sm"
              placeholder="Enter subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          
          <div
            className={`relative rounded-lg border border-dashed px-3 py-2 transition-colors ${
              isDragActive ? "border-nexus-accent bg-nexus-sidebar/40" : "border-nexus-border/40"
            }`}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragActive(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setIsDragActive(false)}
            onDrop={handleDrop}
          >
            <textarea
              className="absolute top-0 left-0 w-1 h-1 opacity-0"
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
            <RichTextEditor 
              content={body} 
              onChange={setBody} 
              className="flex-1 min-h-[300px]"
            />
            <p className="text-[10px] text-nexus-muted mt-2">
              Drag files here to attach (max 25 MB each).
            </p>
          </div>

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              {attachments.map((file, i) => (
                <div key={i} className="flex items-center gap-2 bg-nexus-sidebar/50 px-2 py-1 rounded text-[10px] text-nexus-muted">
                  <Paperclip className="w-3 h-3" />
                  <span>{file.name}</span>
                  <button 
                    onClick={() => setAttachments(attachments.filter((_, idx) => idx !== i))}
                    className="hover:text-red-500"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="p-4 border-t flex items-center justify-between bg-nexus-sidebar/10">
          <div className="flex space-x-2">
            <Button 
                variant="ghost" 
                size="icon"
                onClick={handleAddAttachment}
            >
              <Paperclip className="w-5 h-5 text-nexus-muted" />
            </Button>
          </div>
          <div className="flex space-x-3">
            <Button variant="ghost" onClick={onClose} disabled={sending}>Cancel</Button>
            <Button 
                className="bg-nexus-accent hover:bg-nexus-accent/90 text-white px-6 rounded-xl flex items-center space-x-2"
                onClick={handleSend}
                disabled={sending}
                data-testid="compose-send-button"
            >
              <Send className="w-4 h-4" />
              <span>{sending ? 'Sending...' : 'Send'}</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
