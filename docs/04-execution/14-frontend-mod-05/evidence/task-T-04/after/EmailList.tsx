import React from "react";
import { Email, SearchFilters, SearchHistoryEntry, Folder, EmailBulkAction } from "../../hooks/useMailbox";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { cn, formatDate } from "../../lib/utils";
import { Search, X, Trash2, RefreshCw, Flag, Paperclip } from "lucide-react";
import { Virtuoso } from "react-virtuoso";

interface EmailListProps {
  emails: Email[];
  selectedEmailId: string | null;
  onEmailSelect: (email: Email) => void;
  folderName: string;
  isLoading: boolean;
  isFolderLoading: boolean;
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
  onDeleteEmails: (uids: string[]) => Promise<void>;
  onLoadMore: () => void;
}

const EmailItem = React.memo(({ 
  email, 
  itemSelected, 
  onEmailSelect, 
  isMultiSelected, 
  toggleSelect,
  isSelectionMode
}: {
  email: Email;
  itemSelected: boolean;
  onEmailSelect: (email: Email) => void;
  isMultiSelected: boolean;
  toggleSelect: (uid: string, e: React.MouseEvent) => void;
  isSelectionMode: boolean;
}) => {
  const isUnread = !email.flags?.includes("\\Seen");

  return (
    <div className="p-2 pt-1 pb-1 flex items-center gap-2 group">
      <div className={cn(
        "flex-shrink-0 transition-all duration-200",
        isSelectionMode ? "w-6 opacity-100" : "w-0 opacity-0 group-hover:w-6 group-hover:opacity-100"
      )}>
        <div 
          onClick={(e) => toggleSelect(email.uid, e)}
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
        draggable
        onDragStart={(event) => handleDragStart(event, email.uid)}
        className="cursor-pointer p-4 flex-1 relative overflow-hidden group/card"
      >
        {/* Red Flag Indicator (Top-Left) */}
        {email.flags?.includes("\\Flagged") && (
           <div className="absolute top-0 left-0">
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
              <Paperclip className={cn(
                "w-3 h-3 flex-shrink-0",
                itemSelected ? "text-nexus-primary-foreground/60" : "text-nexus-muted"
              )} />
            )}
          </div>
        </div>
        
        {/* Unread Indicator */}
        {!email.flags?.includes("\\Seen") && (
            <div className={cn(
                "absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-nexus-accent mr-2",
                itemSelected && "bg-white"
            )} />
        )}
      </Card>
    </div>
  );
});

export const EmailList: React.FC<EmailListProps> = ({
  emails,
  selectedEmailId,
  onEmailSelect,
  folderName,
  isLoading,
  isFolderLoading,
  hasFolder,
  searchQuery,
  onSearchChange,
  searchFilters,
  onSearchFiltersChange,
  searchHistory,
  onClearSearchHistory,
  folders,
  currentFolderId,
  onApplyEmailAction,
  onMoveEmails,
  onDeleteEmails,
  onLoadMore,
}) => {
  const [selectedUids, setSelectedUids] = React.useState<Set<string>>(new Set());
  const [moveTargetId, setMoveTargetId] = React.useState<string>("");
  const showFolderPrompt = !hasFolder && !isFolderLoading;
  const showLoading = isLoading || isFolderLoading;
  const showEmpty = !showLoading && hasFolder && emails.length === 0;
  const loadingLabel = isFolderLoading && !hasFolder ? "Loading folders..." : "Loading emails...";
  const dragMimeType = "application/x-nexus-mail-uids";

  const toggleSelect = React.useCallback((uid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedUids(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(uid)) {
        newSelected.delete(uid);
      } else {
        newSelected.add(uid);
      }
      return newSelected;
    });
  }, []);

  const handleBulkDelete = async () => {
    if (confirm(`Delete ${selectedUids.size} emails?`)) {
      await onDeleteEmails(Array.from(selectedUids));
      setSelectedUids(new Set());
    }
  };

  const handleBulkAction = async (action: EmailBulkAction) => {
    await onApplyEmailAction(Array.from(selectedUids), action);
    setSelectedUids(new Set());
  };

  const handleMove = async () => {
    if (!moveTargetId) return;
    await onMoveEmails(Array.from(selectedUids), moveTargetId);
    setSelectedUids(new Set());
    setMoveTargetId("");
  };

  const handleDragStart = (event: React.DragEvent, uid: string) => {
    const dragUids = selectedUids.has(uid) ? Array.from(selectedUids) : [uid];
    if (!selectedUids.has(uid)) {
      setSelectedUids(new Set([uid]));
    }
    event.dataTransfer.setData(dragMimeType, JSON.stringify(dragUids));
    event.dataTransfer.effectAllowed = "move";
  };

  const isAllSelected = emails.length > 0 && selectedUids.size === emails.length;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedUids(new Set());
    } else {
      setSelectedUids(new Set(emails.map(e => e.uid)));
    }
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

  const updateFilters = (patch: Partial<SearchFilters>) => {
    onSearchFiltersChange({ ...searchFilters, ...patch });
  };

  return (
    <section className="h-full w-80 flex-shrink-0 flex flex-col border-r bg-nexus-background">
      <header className="flex flex-col px-6 py-4 border-b gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{folderName}</h2>
          {selectedUids.size > 0 && (
            <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-2">
              <span data-testid="selected-count" className="text-[11px] font-semibold text-nexus-foreground">
                {selectedUids.size} selected
              </span>
              <Button variant="ghost" size="icon" onClick={toggleSelectAll} title={isAllSelected ? "Deselect All" : "Select All"} className="w-8 h-8">
                <div className={cn(
                  "w-4 h-4 rounded-sm flex items-center justify-center transition-colors",
                  isAllSelected ? "bg-nexus-accent border border-nexus-accent " : "border-2 border-nexus-muted"
                )}>
                  {isAllSelected ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <div className="w-2 h-2 bg-nexus-muted rounded-sm" />
                  )}
                </div>
              </Button>
              <Button variant="ghost" size="icon" onClick={invertSelection} title="Invert Selection" className="w-8 h-8">
                 <RefreshCw className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleBulkAction("mark_read")} className="px-2 text-[11px]">
                Mark read
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleBulkAction("mark_unread")} className="px-2 text-[11px]">
                Mark unread
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleBulkAction("flag")} className="px-2 text-[11px]">
                Flag
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleBulkAction("unflag")} className="px-2 text-[11px]">
                Unflag
              </Button>
              <select
                value={moveTargetId}
                onChange={(e) => setMoveTargetId(e.target.value)}
                className="bg-nexus-sidebar/40 rounded-nexus px-2 py-1 text-[11px] border border-transparent focus:border-nexus-primary/40 outline-none"
              >
                <option value="">Move to...</option>
                {folders
                  .filter(folder => folder.id !== currentFolderId)
                  .map(folder => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
              </select>
              <Button variant="ghost" size="sm" onClick={handleMove} className="px-2 text-[11px]" disabled={!moveTargetId}>
                Move
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
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-nexus-muted">
          <input
            type="text"
            data-testid="filter-sender"
            value={searchFilters.sender}
            onChange={(e) => updateFilters({ sender: e.target.value })}
            placeholder="From"
            className="bg-nexus-sidebar/40 rounded-nexus px-2 py-1 border border-transparent focus:border-nexus-primary/40 outline-none w-24"
          />
          <div className="flex items-center gap-1">
            <input
              type="date"
              data-testid="filter-start-date"
              value={searchFilters.startDate}
              onChange={(e) => updateFilters({ startDate: e.target.value })}
              className="bg-nexus-sidebar/40 rounded-nexus px-2 py-1 border border-transparent focus:border-nexus-primary/40 outline-none"
            />
            <span className="text-[10px]">to</span>
            <input
              type="date"
              data-testid="filter-end-date"
              value={searchFilters.endDate}
              onChange={(e) => updateFilters({ endDate: e.target.value })}
              className="bg-nexus-sidebar/40 rounded-nexus px-2 py-1 border border-transparent focus:border-nexus-primary/40 outline-none"
            />
          </div>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              data-testid="filter-attachments"
              checked={searchFilters.hasAttachments}
              onChange={(e) => updateFilters({ hasAttachments: e.target.checked })}
              className="accent-nexus-accent"
            />
            <span>Attachments</span>
          </label>
          <select
            data-testid="filter-folder-scope"
            value={searchFilters.folderScope}
            onChange={(e) => updateFilters({ folderScope: e.target.value as SearchFilters["folderScope"] })}
            className="bg-nexus-sidebar/40 rounded-nexus px-2 py-1 border border-transparent focus:border-nexus-primary/40 outline-none"
          >
            <option value="current">This folder</option>
            <option value="all">All folders</option>
          </select>
        </div>
        {searchHistory.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-nexus-muted">
            <span className="text-nexus-muted/80">Recent:</span>
            {searchHistory.slice(0, 10).map((entry) => (
              <button
                key={`${entry.query}-${entry.last_used_at}`}
                data-testid="search-history-item"
                onClick={() => onSearchChange(entry.query)}
                className="px-2 py-0.5 rounded-full bg-nexus-sidebar/40 text-nexus-foreground/80 hover:text-nexus-foreground hover:bg-nexus-sidebar/70 transition"
                title={`Search: ${entry.query}`}
              >
                {entry.query}
              </button>
            ))}
            <button
              data-testid="search-history-clear"
              onClick={onClearSearchHistory}
              className="text-nexus-muted hover:text-nexus-foreground underline"
            >
              Clear
            </button>
          </div>
        )}
      </header>
      
      <div className="flex-1 overflow-hidden relative">
        {showFolderPrompt && (
          <div className="text-center py-10 text-nexus-muted text-sm">Select a folder to get started</div>
        )}
        {showLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-nexus-background/50">
            <div className="text-nexus-muted text-sm">{loadingLabel}</div>
          </div>
        )}
        {showEmpty && (
          <div className="text-center py-10 text-nexus-muted text-sm">No emails in this folder</div>
        )}
        
        <Virtuoso
          style={{ height: '100%' }}
          data={emails}
          computeItemKey={(_index, email) => email.uid}
          endReached={onLoadMore}
          increaseViewportBy={200}
          itemContent={(_index, email) => (
            <EmailItem
              email={email}
              itemSelected={selectedEmailId === email.uid}
              onEmailSelect={onEmailSelect}
              isMultiSelected={selectedUids.has(email.uid)}
              toggleSelect={toggleSelect}
              isSelectionMode={selectedUids.size > 0}
            />
          )}
        />
      </div>
    </section>
  );
};
