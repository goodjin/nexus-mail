import React from "react";
import { Email } from "../../hooks/useMailbox";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { cn } from "../../lib/utils";
import { Search, X, Trash2, RefreshCw } from "lucide-react";
import { Virtuoso } from "react-virtuoso";

interface EmailListProps {
  emails: Email[];
  selectedEmailId: string | null;
  onEmailSelect: (email: Email) => void;
  folderName: string;
  isLoading: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onDeleteEmails: (uids: string[]) => Promise<void>;
  onLoadMore: () => void;
}

export const EmailList: React.FC<EmailListProps> = ({
  emails,
  selectedEmailId,
  onEmailSelect,
  folderName,
  isLoading,
  searchQuery,
  onSearchChange,
  onDeleteEmails,
  onLoadMore,
}) => {
  const [selectedUids, setSelectedUids] = React.useState<Set<string>>(new Set());

  const toggleSelect = (uid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSelected = new Set(selectedUids);
    if (newSelected.has(uid)) {
      newSelected.delete(uid);
    } else {
      newSelected.add(uid);
    }
    setSelectedUids(newSelected);
  };

  const handleBulkDelete = async () => {
    if (confirm(`Delete ${selectedUids.size} emails?`)) {
      await onDeleteEmails(Array.from(selectedUids));
      setSelectedUids(new Set());
    }
  };

  const selectAll = () => {
    setSelectedUids(new Set(emails.map(e => e.uid)));
  };

  const invertSelection = () => {
    const newSelected = new Set<string>();
    emails.forEach(e => {
      if (!selectedUids.has(e.uid)) {
        newSelected.add(e.uid);
      }
    });
    setSelectedUids(newSelected);
  };

  return (
    <section className="h-full w-80 flex-shrink-0 flex flex-col border-r bg-nexus-background">
      <header className="flex flex-col px-6 py-4 border-b gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{folderName}</h2>
          {selectedUids.size > 0 && (
            <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-2">
               <span data-testid="selected-count" className="text-[10px] font-bold bg-nexus-accent text-white w-5 h-5 flex items-center justify-center rounded-full mr-1">
                {selectedUids.size}
              </span>
              <Button variant="ghost" size="icon" onClick={selectAll} title="Select All" className="w-8 h-8">
                <div className="w-4 h-4 border-2 border-nexus-muted rounded-sm flex items-center justify-center">
                  <div className="w-2 h-2 bg-nexus-muted rounded-sm" />
                </div>
              </Button>
              <Button variant="ghost" size="icon" onClick={invertSelection} title="Invert Selection" className="w-8 h-8">
                 <RefreshCw className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleBulkDelete} title="Delete" className="w-8 h-8 text-red-500">
                <Trash2 className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setSelectedUids(new Set())} title="Cancel" className="w-8 h-8">
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nexus-muted" />
          <input
            type="text"
            data-testid="search-input"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search messages..."
            className="w-full bg-nexus-sidebar/50 border-none rounded-nexus pl-9 pr-9 py-2 text-sm focus:ring-1 focus:ring-nexus-primary outline-none"
          />
          {searchQuery && (
            <button 
              onClick={() => onSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-nexus-muted hover:text-nexus-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </header>
      
      <div className="flex-1 overflow-hidden relative">
        {isLoading && emails.length === 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-nexus-background/50">
            <div className="text-nexus-muted text-sm">Loading emails...</div>
          </div>
        )}
        {!isLoading && emails.length === 0 && (
          <div className="text-center py-10 text-nexus-muted text-sm">No emails found</div>
        )}
        
        <Virtuoso
          style={{ height: '100%' }}
          data={emails}
          endReached={onLoadMore}
          increaseViewportBy={200}
          itemContent={(_index, email) => (
            <div className="p-2 pt-1 pb-1 flex items-center gap-2 group">
              <div className={cn(
                "flex-shrink-0 transition-all duration-200",
                selectedUids.size > 0 ? "w-6 opacity-100" : "w-0 opacity-0 group-hover:w-6 group-hover:opacity-100"
              )}>
                <div 
                  onClick={(e) => toggleSelect(email.uid, e)}
                  className={cn(
                    "w-5 h-5 rounded-full border-2 cursor-pointer flex items-center justify-center transition-all",
                    selectedUids.has(email.uid) 
                      ? "bg-nexus-accent border-nexus-accent text-white" 
                      : "bg-transparent border-nexus-border hover:border-nexus-accent"
                  )}
                >
                  {selectedUids.has(email.uid) && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
              </div>
              
              <Card 
                key={email.uid}
                data-testid={`email-card-${email.uid}`}
                selected={selectedEmailId === email.uid}
                onClick={() => onEmailSelect(email)}
                className="cursor-pointer p-4 flex-1 relative overflow-hidden"
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
                
                {email.flags?.includes("\\Flagged") && (
                   <div className="absolute top-0 right-0 w-2 h-2 bg-nexus-accent rounded-bl-full" />
                )}
                {!email.flags?.includes("\\Seen") && (
                    <div className={cn(
                        "absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-nexus-accent rounded-r-full",
                        selectedEmailId === email.uid && "bg-white"
                    )} />
                )}
              </Card>
            </div>
          )}
        />
      </div>
    </section>
  );
};
