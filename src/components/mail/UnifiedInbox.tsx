import React from "react";
import { UnifiedInboxItem, GlobalSearchFilters, GlobalSearchState } from "../../hooks/useUnifiedInbox";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Search, RefreshCw, X } from "lucide-react";
import { formatDate } from "../../lib/utils";

type FilterOption = {
  id: string;
  label: string;
};

interface UnifiedInboxProps {
  items: UnifiedInboxItem[];
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  searchResults: UnifiedInboxItem[];
  searchState: GlobalSearchState;
  searchError: string | null;
  searchFilters: GlobalSearchFilters;
  onSearchFiltersChange: (filters: GlobalSearchFilters) => void;
  accountOptions: FilterOption[];
  folderOptions: FilterOption[];
  selectedEmailKey: string | null;
  onSelectEmail: (email: UnifiedInboxItem) => void;
  onRefresh: () => void;
}

const normalizeFilterValue = (value?: string[]) =>
  value && value.length > 0 ? value[0] : "";

export const UnifiedInbox: React.FC<UnifiedInboxProps> = ({
  items,
  isLoading,
  error,
  searchQuery,
  onSearchQueryChange,
  searchResults,
  searchState,
  searchError,
  searchFilters,
  onSearchFiltersChange,
  accountOptions,
  folderOptions,
  selectedEmailKey,
  onSelectEmail,
  onRefresh,
}) => {
  const activeList = searchQuery.trim().length > 0 ? searchResults : items;
  const showSearch = searchQuery.trim().length > 0;
  const accountValue = normalizeFilterValue(searchFilters.account_ids);
  const folderValue = normalizeFilterValue(searchFilters.folder_ids);

  const handleAccountChange = (value: string) => {
    onSearchFiltersChange({
      ...searchFilters,
      account_ids: value ? [value] : undefined,
      folder_ids:
        folderValue && folderOptions.some((option) => option.id === folderValue)
          ? searchFilters.folder_ids
          : undefined,
    });
  };

  const handleFolderChange = (value: string) => {
    onSearchFiltersChange({
      ...searchFilters,
      folder_ids: value ? [value] : undefined,
    });
  };

  return (
    <section
      className="h-full w-80 flex-shrink-0 flex flex-col border-r bg-nexus-background"
      data-testid="unified-inbox-view"
    >
      <header className="px-6 py-4 border-b space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-nexus-foreground">Unified Inbox</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px]"
            onClick={onRefresh}
            data-testid="unified-inbox-refresh"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Refresh
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nexus-muted" />
          <input
            type="text"
            data-testid="global-search-input"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Search across accounts..."
            className="w-full bg-nexus-sidebar/50 border-none rounded-nexus pl-9 pr-9 py-2 text-sm focus:ring-1 focus:ring-nexus-primary outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchQueryChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-nexus-muted hover:text-nexus-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <select
            data-testid="global-search-account-filter"
            value={accountValue}
            onChange={(event) => handleAccountChange(event.target.value)}
            className="flex-1 rounded-nexus border border-nexus-border bg-nexus-background px-2 py-1 text-xs"
          >
            <option value="">All accounts</option>
            {accountOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            data-testid="global-search-folder-filter"
            value={folderValue}
            onChange={(event) => handleFolderChange(event.target.value)}
            className="flex-1 rounded-nexus border border-nexus-border bg-nexus-background px-2 py-1 text-xs"
          >
            <option value="">All folders</option>
            {folderOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4 space-y-3">
        {isLoading && !showSearch && (
          <div className="text-xs text-nexus-muted">Loading unified inbox...</div>
        )}
        {!showSearch && error && (
          <Card className="text-xs text-red-500" data-testid="unified-inbox-error">
            {error}
          </Card>
        )}
        {showSearch && searchState === "searching" && (
          <div className="text-xs text-nexus-muted">Searching across accounts...</div>
        )}
        {showSearch && searchState === "error" && (
          <Card className="text-xs text-red-500" data-testid="global-search-error">
            {searchError}
          </Card>
        )}

        {activeList.length === 0 && !(showSearch && searchState === "searching") ? (
          <div className="text-xs text-nexus-muted" data-testid="unified-inbox-empty">
            {showSearch ? "No results for this search." : "Unified inbox is empty."}
          </div>
        ) : (
          activeList.map((item) => (
            <Card
              key={item.id}
              data-testid={`${showSearch ? "global-search-item" : "unified-inbox-item"}-${item.id}`}
              selected={selectedEmailKey === item.id}
              onClick={() => onSelectEmail(item)}
              className="cursor-pointer space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-nexus-foreground truncate">
                    {item.subject || "(No Subject)"}
                  </div>
                  <div className="text-[11px] text-nexus-muted truncate">{item.from}</div>
                </div>
                <span className="text-[11px] text-nexus-muted whitespace-nowrap">
                  {formatDate(item.date)}
                </span>
              </div>
              <div className="text-xs text-nexus-muted line-clamp-2">{item.snippet}</div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  {item.account_email}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  {item.folder_name}
                </Badge>
                {!item.flags?.includes("\\Seen") && (
                  <Badge variant="primary" className="text-[10px]">
                    Unread
                  </Badge>
                )}
              </div>
            </Card>
          ))
        )}
      </div>
    </section>
  );
};
