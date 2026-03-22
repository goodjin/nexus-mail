import React from "react";
import { Email } from "../../hooks/useMailbox";
import DOMPurify from "dompurify";

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
        <h1 className="text-2xl font-bold mb-4">{email.subject}</h1>
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
      </div>
    </main>
  );
};
