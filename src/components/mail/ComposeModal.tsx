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

  if (!isOpen) return null;

  const handleSend = async () => {
    if (!to || !subject) {
      alert("Please fill in recipient and subject");
      return;
    }

    setSending(true);
    try {
      await invoke("send_email", {
        from: fromAccount,
        to,
        subject,
        body
      });
      alert("Email sent successfully!");
      onClose();
    } catch (e) {
      alert(`Failed to send email: ${e}`);
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
          <div className="flex items-center space-x-3 border-b pb-2">
            <span className="text-nexus-muted w-12">From:</span>
            <span className="font-medium text-nexus-primary">{fromAccount}</span>
          </div>
          
          <div className="flex items-center space-x-3 border-b pb-2">
            <label htmlFor="to" className="text-nexus-muted w-12">To:</label>
            <input 
              id="to"
              type="text" 
              className="flex-1 bg-transparent border-none focus:outline-none text-nexus-primary"
              placeholder="recipient@example.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          
          <div className="flex items-center space-x-3 border-b pb-2">
            <label htmlFor="subject" className="text-nexus-muted w-12">Subject:</label>
            <input 
              id="subject"
              type="text" 
              className="flex-1 bg-transparent border-none focus:outline-none text-nexus-primary font-medium"
              placeholder="Enter subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          
          <textarea 
            className="flex-1 min-h-[300px] bg-transparent border-none focus:outline-none text-nexus-primary resize-none p-2 leading-relaxed"
            placeholder="Write your message here..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
        
        <div className="p-4 border-t flex items-center justify-between bg-nexus-sidebar/10">
          <div className="flex space-x-2">
            <Button variant="ghost" size="icon">
              <Paperclip className="w-5 h-5 text-nexus-muted" />
            </Button>
          </div>
          <div className="flex space-x-3">
            <Button variant="ghost" onClick={onClose} disabled={sending}>Cancel</Button>
            <Button 
                className="bg-nexus-accent hover:bg-nexus-accent/90 text-white px-6 rounded-xl flex items-center space-x-2"
                onClick={handleSend}
                disabled={sending}
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
