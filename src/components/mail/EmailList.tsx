import React from "react";
import { Email } from "../../hooks/useMailbox";
import { Card } from "../ui/Card";
import { cn } from "../../lib/utils";

interface EmailListProps {
  emails: Email[];
  selectedEmailId: string | null;
  onEmailSelect: (email: Email) => void;
  folderName: string;
  isLoading: boolean;
}

export const EmailList: React.FC<EmailListProps> = ({
  emails,
  selectedEmailId,
  onEmailSelect,
  folderName,
  isLoading,
}) => {
  return (
    <section className="h-full w-80 flex-shrink-0 flex flex-col border-r bg-nexus-background">
      <header className="h-16 flex items-center px-6 border-b">
        <h2 className="text-lg font-semibold">{folderName}</h2>
      </header>
      
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading && <div className="text-center py-10 text-nexus-muted text-sm">Loading emails...</div>}
        {!isLoading && emails.length === 0 && (
          <div className="text-center py-10 text-nexus-muted text-sm">No emails found</div>
        )}
        {emails.map((email) => (
          <Card 
            key={email.uid}
            data-testid={`email-card-${email.uid}`}
            selected={selectedEmailId === email.uid}
            onClick={() => onEmailSelect(email)}
            className="cursor-pointer p-4 group"
          >
            <div className="flex justify-between items-start mb-1">
              <span className={cn(
                "text-sm font-semibold truncate max-w-[140px]",
                selectedEmailId === email.uid ? "text-nexus-primary-foreground" : "text-nexus-foreground"
              )}>
                {email.from}
              </span>
              <span className={cn(
                "text-[10px] uppercase tracking-wider",
                selectedEmailId === email.uid ? "text-nexus-primary-foreground/70" : "text-nexus-muted"
              )}>
                {email.date}
              </span>
            </div>
            <div className={cn(
              "text-sm font-medium mb-1 truncate",
              selectedEmailId === email.uid ? "text-nexus-primary-foreground" : "text-nexus-foreground"
            )}>
              {email.subject}
            </div>
            <div className={cn(
              "text-xs line-clamp-2",
              selectedEmailId === email.uid ? "text-nexus-primary-foreground/80" : "text-nexus-muted"
            )}>
              {email.snippet}
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
};
