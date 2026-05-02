import React from "react";
import { Email, SearchFilters, SearchHistoryEntry, Folder, EmailBulkAction } from "../../hooks/useMailbox";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { cn, formatDate } from "../../lib/utils";
import { Search, X, Trash2, Flag, Paperclip } from "lucide-react";

interface EmailListProps {
  emails: Email[];
  selectedEmailId: string | null;
  onEmailSelect: (email: Email) => void;
  folderName: string;
  hasAccounts: boolean;
  mailboxStatus: { type: "loading" | "success" | "error"; message: string } | null;
  lastSyncAt: number | null;
  isLoading: boolean;
  isFolderLoading: boolean;
  loadError: string | null;
  hasFolder: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchFilters: SearchFilters;
  onSearchFiltersChange: (filters: SearchFilters) => void;
  searchHistory: SearchHistoryEntry[];
  onClearSearchHistory: () => void;
  folders: Folder[];
  currentFolderId: string | null;
  onApplyEmailAction: (uids: string[], action: EmailBulkAction) => Promise<void>;
  onMoveEmails: (uids: string[], targetFolderId: string) => Promise<void>;
  onDeleteEmails: (uids: string[]) => Promise<boolean>;
  onLoadMore: () => void;
  onAddAccount: () => void;
  onRetry: () => void;
}

const EmailItem = React.memo(({ 
  email, 
  itemSelected, 
  onEmailSelect, 
  isMultiSelected, 
  toggleSelect,
  isSelectionMode,
  onDragStart
}: {
  email: Email;
  itemSelected: boolean;
  onEmailSelect: (email: Email) => void;
  isMultiSelected: boolean;
  toggleSelect: (email: Email, e: React.MouseEvent) => void;
  isSelectionMode: boolean;
  onDragStart: (event: React.DragEvent, uid: string) => void;
}) => {
  const isUnread = !email.flags?.includes("\\Seen");

  return (
    <div className="p-2 pt-1 pb-1 flex items-center gap-2 group">
      <div className={cn(
        "flex-shrink-0 transition-all duration-200",
        isSelectionMode ? "w-6 opacity-100" : "w-0 opacity-0 group-hover:w-6 group-hover:opacity-100"
      )}>
        <div 
          onClick={(e) => toggleSelect(email, e)}
          onMouseDown={(e) => e.stopPropagation()}
          data-testid={`email-select-${email.uid}`}
          className={cn(
            "w-5 h-5 rounded-full border-2 cursor-pointer flex items-center justify-center transition-all",
            isMultiSelected 
              ? "bg-nexus-accent border-nexus-accent text-white" 
              : "bg-transparent border-nexus-border hover:border-nexus-accent"
          )}
        >
          {isMultiSelected && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
      </div>
      
      <Card 
        data-testid={`email-card-${email.uid}`}
        selected={itemSelected}
        onClick={() => onEmailSelect(email)}
        onMouseDown={(event) => {
          if (event.button !== 0) return;
          onEmailSelect(email);
        }}
        draggable
        onDragStart={(event) => onDragStart(event, email.uid)}
        className="cursor-pointer p-4 flex-1 relative overflow-hidden group/card"
      >
        {/* Red Flag Indicator (Top-Left) */}
         {email.flags?.includes("\\Flagged") && (
            <div className="absolute top-0 left-0" data-testid={`flag-indicator-${email.uid}`}>
             <div className="w-0 h-0 border-t-[16px] border-t-red-500 border-r-[16px] border-r-transparent" />
             <Flag className="absolute top-0.5 left-0.5 w-2 h-2 text-white fill-white" />
           </div>
        )}

        <div className="flex flex-col gap-1">
          {/* Row 1: Subject (Title) */}
          <div className="flex justify-between items-start gap-2">
            <h3 className={cn(
              "text-sm truncate flex-1",
              itemSelected
                ? "text-nexus-primary-foreground font-semibold"
                : isUnread
                  ? "text-nexus-foreground font-semibold"
                  : "text-nexus-foreground/70 font-medium"
            )}>
              {email.subject || "(No Subject)"}
            </h3>
          </div>

          {/* Row 2: Sender & Time */}
          <div className="flex justify-between items-center text-[11px]">
            <span className={cn(
              "truncate max-w-[160px]",
              itemSelected
                ? "text-nexus-primary-foreground/90 font-medium"
                : isUnread
                  ? "text-nexus-foreground/80 font-semibold"
                  : "text-nexus-muted font-medium"
            )}>
              {email.from}
            </span>
            <span className={cn(
              "whitespace-nowrap flex-shrink-0 ml-2",
              itemSelected ? "text-nexus-primary-foreground/70" : "text-nexus-muted"
            )}>
              {formatDate(email.date)}
            </span>
          </div>

          {/* Row 3: Snippet & Icons */}
          <div className="flex items-end gap-2 mt-0.5">
            <div className={cn(
              "text-xs line-clamp-1 flex-1",
              itemSelected
                ? "text-nexus-primary-foreground/80"
                : isUnread
                  ? "text-nexus-foreground/70"
                  : "text-nexus-muted"
            )}>
              {email.snippet}
            </div>
            {email.attachments && email.attachments.length > 0 && (
              <Paperclip
                data-testid={`email-attachment-icon-${email.uid}`}
                className={cn(
                  "w-3 h-3 flex-shrink-0",
                  itemSelected ? "text-nexus-primary-foreground/60" : "text-nexus-muted"
                )}
              />
            )}
          </div>
        </div>
        
        {/* Unread Indicator */}
         {!email.flags?.includes("\\Seen") && (
            <div
              data-testid={`unread-indicator-${email.uid}`}
              className={cn(
                "absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-nexus-accent mr-2",
                itemSelected && "bg-white"
              )}
            />
        )}

        <div className="pointer-events-none absolute left-full top-3 z-20 ml-3 hidden w-64 rounded-lg border border-nexus-border bg-nexus-card/95 p-3 text-left shadow-xl opacity-0 transition-opacity group-hover/card:opacity-100 lg:block">
          <div className="text-xs font-semibold text-nexus-foreground truncate">{email.subject || "(No Subject)"}</div>
          <div className="mt-1 text-[11px] text-nexus-muted truncate">{email.from}</div>
          <div className="mt-2 text-xs text-nexus-foreground/80 line-clamp-4">{email.snippet || "No preview available."}</div>
        </div>
      </Card>
    </div>
  );
});

export const EmailList: React.FC<EmailListProps> = ({
  emails,
  selectedEmailId,
  onEmailSelect,
  hasAccounts,
  isLoading,
  isFolderLoading,
  loadError,
  hasFolder,
  currentFolderId,
  searchQuery,
  onSearchChange,
  onApplyEmailAction,
  onDeleteEmails,
  onLoadMore,
  onAddAccount,
  onRetry,
}) => {
  const [selectedUids, setSelectedUids] = React.useState<Set<string>>(new Set());
  const showFolderPrompt = !hasFolder && !isFolderLoading;
  const showLoading = isLoading || isFolderLoading;
  const showNoAccounts = !hasAccounts;
  const showSearchEmpty = !showLoading && !loadError && hasFolder && emails.length === 0 && searchQuery.trim().length > 0;
  const showFolderEmpty = !showLoading && !loadError && hasFolder && emails.length === 0 && !showSearchEmpty;
  const loadingLabel = isFolderLoading && !hasFolder ? "Loading folders..." : "Loading emails...";
  const dragMimeType = "application/x-nexus-mail-uids";
  const handleEndReached = React.useCallback(() => {
    if (isLoading) return;
    onLoadMore();
  }, [isLoading, onLoadMore]);

  React.useEffect(() => {
    setSelectedUids(new Set());
  }, [currentFolderId]);

  const toggleSelect = React.useCallback((email: Email, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedUids(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(email.uid)) {
        newSelected.delete(email.uid);
      } else {
        newSelected.add(email.uid);
      }
      return newSelected;
    });
  }, []);

  const handleBulkDelete = async () => {
    const deleted = await onDeleteEmails(Array.from(selectedUids));
    if (deleted) {
      setSelectedUids(new Set());
    }
  };

  const handleBulkAction = async (action: EmailBulkAction) => {
    await onApplyEmailAction(Array.from(selectedUids), action);
    setSelectedUids(new Set());
  };

  const handleDragStart = (event: React.DragEvent, uid: string) => {
    const dragUids = selectedUids.has(uid) ? Array.from(selectedUids) : [uid];
    if (!selectedUids.has(uid)) {
      setSelectedUids(new Set([uid]));
    }
    event.dataTransfer.setData(dragMimeType, JSON.stringify(dragUids));
    event.dataTransfer.effectAllowed = "move";
  };
  const renderEmailItem = React.useCallback(
    (_index: number, email: Email) => (
      <EmailItem
        email={email}
        itemSelected={selectedEmailId === email.uid}
        onEmailSelect={onEmailSelect}
        isMultiSelected={selectedUids.has(email.uid)}
        toggleSelect={toggleSelect}
        isSelectionMode={selectedUids.size > 0}
        onDragStart={handleDragStart}
      />
    ),
    [handleDragStart, onEmailSelect, selectedEmailId, selectedUids, toggleSelect],
  );

  return (
    <section className="h-full w-80 flex-shrink-0 flex flex-col border-r bg-nexus-background">
      <header className="px-6 py-4 border-b">
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
      {selectedUids.size > 0 && (
        <div className="px-6 py-3 border-b bg-nexus-sidebar/40 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span data-testid="selected-count" className="text-xs font-semibold text-nexus-muted">
              {selectedUids.size} selected
            </span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => handleBulkAction("mark_read")} data-testid="bulk-mark-read" className="h-8 px-2.5 text-[12px]">
              Mark read
              </Button>
              <Button variant="ghost" size="icon" onClick={handleBulkDelete} title="Delete" data-testid="bulk-delete" className="h-8 w-8 text-red-500">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
      
      <div className="flex-1 overflow-hidden relative">
        {showNoAccounts && (
          <div className="h-full flex items-center justify-center px-6" data-testid="empty-state-no-accounts">
            <div className="max-w-xs text-center space-y-3">
              <h3 className="text-base font-semibold text-nexus-foreground">No account connected</h3>
              <p className="text-sm text-nexus-muted">Add your first mailbox to start syncing and browsing messages.</p>
              <Button variant="primary" size="sm" onClick={onAddAccount} data-testid="empty-state-no-accounts-cta">
                Add account
              </Button>
            </div>
          </div>
        )}
        {!showNoAccounts && showFolderPrompt && (
          <div className="text-center py-10 text-nexus-muted text-sm">Select a folder to get started</div>
        )}
        {!showNoAccounts && showLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-nexus-background/50">
            <div className="text-nexus-muted text-sm">{loadingLabel}</div>
          </div>
        )}
        {!showNoAccounts && !showLoading && loadError && (
          <div className="h-full flex items-center justify-center px-6" data-testid="empty-state-load-error">
            <div className="max-w-xs text-center space-y-3">
              <h3 className="text-base font-semibold text-nexus-foreground">Mailbox unavailable</h3>
              <p className="text-sm text-nexus-muted">{loadError}</p>
              <Button variant="secondary" size="sm" onClick={onRetry} data-testid="empty-state-retry">
                Try again
              </Button>
            </div>
          </div>
        )}
        {!showNoAccounts && showSearchEmpty && (
          <div className="h-full flex items-center justify-center px-6" data-testid="empty-state-search-empty">
            <div className="max-w-xs text-center space-y-3">
              <h3 className="text-base font-semibold text-nexus-foreground">No matching messages</h3>
              <p className="text-sm text-nexus-muted">Try another keyword or clear the current search to return to this folder.</p>
              <Button variant="secondary" size="sm" onClick={() => onSearchChange("")} data-testid="empty-state-search-clear">
                Clear search
              </Button>
            </div>
          </div>
        )}
        {!showNoAccounts && showFolderEmpty && (
          <div className="h-full flex items-center justify-center px-6" data-testid="empty-state-folder-empty">
            <div className="max-w-xs text-center space-y-2">
              <h3 className="text-base font-semibold text-nexus-foreground">This folder is empty</h3>
              <p className="text-sm text-nexus-muted">Refresh the account or switch folders to check for new mail.</p>
              <Button variant="secondary" size="sm" onClick={onRetry} data-testid="empty-state-folder-refresh">
                Refresh
              </Button>
            </div>
          </div>
        )}
        
        <div
          className="h-full overflow-auto"
          onScroll={(event) => {
            const target = event.currentTarget;
            if (isLoading) return;
            if (target.scrollTop + target.clientHeight >= target.scrollHeight - 200) {
              handleEndReached();
            }
          }}
        >
          {emails.map((email, index) => (
            <React.Fragment key={email.uid}>
              {renderEmailItem(index, email)}
            </React.Fragment>
          ))}
        </div>
      </div>
    </section>
  );
};
