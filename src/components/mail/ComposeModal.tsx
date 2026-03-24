import React, { useState } from 'react';
import { X, Send, Paperclip } from 'lucide-react';
import { Button } from "../ui/Button";
import { invoke } from "../../lib/tauri";

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  fromAccount: string;
}

export const ComposeModal: React.FC<ComposeModalProps> = ({ isOpen, onClose, fromAccount }) => {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Array<{ name: string, path: string, size: number }>>([]);

  if (!isOpen) return null;

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
        setAttachments([...attachments, ...newAttachments]);
      } else if (selected) {
          const path = selected as string;
          const stats = await lstat(path);
          setAttachments([...attachments, {
              name: path.split('/').pop() || "unnamed",
              path,
              size: stats.size
          }]);
      }
    } catch (e) {
      console.error("Failed to add attachment", e);
    }
  };

  const handleSend = async () => {
    setError(null);
    if (!to || !subject) {
      setError("Please fill in recipient and subject");
      return;
    }

    setSending(true);
    try {
      await invoke("send_email", {
        from: fromAccount,
        to,
        subject,
        body,
        attachments: attachments.map(a => a.path)
      });
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
          
          <textarea 
            className="flex-1 min-h-[300px] bg-transparent border-none focus:outline-none text-nexus-primary resize-none p-2 leading-relaxed text-sm"
            placeholder="Write your message here..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />

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
