import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "../lib/tauri";
import { Email } from "./useMailbox";

export type UnifiedInboxItem = Email & {
  id: string;
  account_id: string;
  account_email: string;
  folder_id: string;
  folder_name: string;
  flags: string[];
};

export type GlobalSearchFilters = {
  account_ids?: string[];
  folder_ids?: string[];
};

export type GlobalSearchState = "idle" | "searching" | "ready" | "error";

export function useUnifiedInbox() {
  const [items, setItems] = useState<UnifiedInboxItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UnifiedInboxItem[]>([]);
  const [searchState, setSearchState] = useState<GlobalSearchState>("idle");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchFilters, setSearchFilters] = useState<GlobalSearchFilters>({});
  const previousQuery = useRef<string>("");
  const previousFilters = useRef<GlobalSearchFilters>({});
  const searchRequestId = useRef(0);

  const refreshUnifiedInbox = useCallback(
    async (accountIds?: string[], folderIds?: string[]) => {
      setLoading(true);
      setError(null);
      try {
        const data = await invoke<UnifiedInboxItem[]>("get_unified_inbox", {
          account_ids: accountIds && accountIds.length > 0 ? accountIds : undefined,
          folder_ids: folderIds && folderIds.length > 0 ? folderIds : undefined,
        });
        setItems(data);
      } catch (e) {
        console.error("Failed to fetch unified inbox", e);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setDebouncedQuery("");
      return;
    }
    const timer = setTimeout(() => setDebouncedQuery(trimmed), 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const query = debouncedQuery.trim();
    if (!query) {
      setSearchState("idle");
      setSearchResults([]);
      setSearchError(null);
      previousQuery.current = "";
      previousFilters.current = {};
      return;
    }
    const currentFilters = searchFilters;
    const queryChanged = query !== previousQuery.current;
    const filtersChanged =
      JSON.stringify(currentFilters) !== JSON.stringify(previousFilters.current);
    if (!queryChanged && !filtersChanged) {
      return;
    }

    const requestId = ++searchRequestId.current;
    setSearchState("searching");
    setSearchError(null);
    const run = async () => {
      try {
        const cmd = queryChanged ? "search_emails_global" : "filter_search_results";
        const results = await invoke<UnifiedInboxItem[]>(cmd, {
          query,
          filters: {
            account_ids: currentFilters.account_ids,
            folder_ids: currentFilters.folder_ids,
          },
        });
        if (requestId !== searchRequestId.current) return;
        setSearchResults(results);
        setSearchState("ready");
        previousQuery.current = query;
        previousFilters.current = currentFilters;
      } catch (e) {
        if (requestId !== searchRequestId.current) return;
        console.error("Global search failed", e);
        setSearchState("error");
        setSearchError(e instanceof Error ? e.message : String(e));
      }
    };

    run();
  }, [debouncedQuery, searchFilters]);

  const updateItem = useCallback(
    (matcher: (item: UnifiedInboxItem) => boolean, updater: (item: UnifiedInboxItem) => UnifiedInboxItem) => {
      setItems((prev) => prev.map((item) => (matcher(item) ? updater(item) : item)));
      setSearchResults((prev) => prev.map((item) => (matcher(item) ? updater(item) : item)));
    },
    [],
  );

  const removeItem = useCallback((matcher: (item: UnifiedInboxItem) => boolean) => {
    setItems((prev) => prev.filter((item) => !matcher(item)));
    setSearchResults((prev) => prev.filter((item) => !matcher(item)));
  }, []);

  return {
    items,
    loading,
    error,
    refreshUnifiedInbox,
    searchQuery,
    setSearchQuery,
    searchResults,
    searchState,
    searchError,
    searchFilters,
    setSearchFilters,
    updateItem,
    removeItem,
  };
}
