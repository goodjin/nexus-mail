import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "../lib/tauri";

export interface Folder {
  id: string;
  name: string;
  remote_id: string;
  unread_count: number;
  system_role?: string;
}

export interface Email {
  uid: string;
  subject: string;
  from: string;
  to?: string[];
  cc?: string[];
  headers?: Record<string, string>;
  date: string;
  snippet: string;
  body_html?: string;
  body_text?: string;
  attachments?: {
    id: string;
    filename: string;
    size: number;
    mime_type: string;
  }[];
  flags?: string[];
}

export type SearchFilters = {
  sender: string;
  startDate: string;
  endDate: string;
  hasAttachments: boolean;
  searchScope: "current_folder" | "current_account" | "all_accounts";
};

export type SearchHistoryEntry = {
  query: string;
  last_used_at: number;
};

export type EmailBulkAction = "mark_read" | "mark_unread" | "flag" | "unflag" | "delete" | "archive";

const DEFAULT_SEARCH_FILTERS: SearchFilters = {
  sender: "",
  startDate: "",
  endDate: "",
  hasAttachments: false,
  searchScope: "current_folder",
};

const SYSTEM_ROLE_ORDER = ["INBOX", "SENT", "DRAFTS", "ARCHIVE", "SPAM", "TRASH"];

const resolveFolderRole = (folder: Folder) => {
  if (folder.system_role) return folder.system_role.toUpperCase();
  const name = folder.name.toLowerCase();
  if (name.includes("inbox") || name.includes("收件箱")) return "INBOX";
  if (name.includes("sent") || name.includes("已发送")) return "SENT";
  if (name.includes("draft") || name.includes("草稿")) return "DRAFTS";
  if (name.includes("archive") || name.includes("归档")) return "ARCHIVE";
  if (name.includes("spam") || name.includes("junk") || name.includes("垃圾邮件")) return "SPAM";
  if (name.includes("trash") || name.includes("deleted") || name.includes("垃圾箱") || name.includes("已删除")) return "TRASH";
  return null;
};

const sortFolders = (items: Folder[]) => {
  return [...items].sort((a, b) => {
    const roleA = resolveFolderRole(a);
    const roleB = resolveFolderRole(b);
    const idxA = roleA ? SYSTEM_ROLE_ORDER.indexOf(roleA) : -1;
    const idxB = roleB ? SYSTEM_ROLE_ORDER.indexOf(roleB) : -1;
    const weightA = idxA === -1 ? SYSTEM_ROLE_ORDER.length : idxA;
    const weightB = idxB === -1 ? SYSTEM_ROLE_ORDER.length : idxB;
    if (weightA !== weightB) return weightA - weightB;
    return a.name.localeCompare(b.name);
  });
};

export function useMailbox(accountEmail: string | null) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const selectedFolderRef = useRef<string | null>(null);
  const previousFolderRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  const loadingMoreRef = useRef(false);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchFilters, setSearchFilters] = useState<SearchFilters>(DEFAULT_SEARCH_FILTERS);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>([]);
  const [searchMetrics, setSearchMetrics] = useState<{ lastDurationMs: number | null; samples: number[] }>({
    lastDurationMs: null,
    samples: [],
  });
  const searchMetricsRef = useRef<number[]>([]);
  const searchRequestId = useRef(0);
  const [searchDebounceMs] = useState(() => {
    if (typeof window === "undefined") return 250;
    const stored = window.localStorage.getItem("nexus-search-debounce-ms");
    const parsed = stored ? Number(stored) : Number.NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 250;
  });

  const refreshFolders = useCallback(
    async (options?: { selectFolderId?: string; fallbackToInbox?: boolean }) => {
      if (!accountEmail) {
        setFolders([]);
        setFoldersLoading(false);
        setLoadError(null);
        return null;
      }
      setFoldersLoading(true);
      setLoadError(null);
      try {
        const flds: Folder[] = await invoke("get_folders", { accountEmail });
        const ordered = sortFolders(flds);
        setFolders(ordered);

        const preferredId = options?.selectFolderId;
        const hasPreferred = preferredId && ordered.some((folder) => folder.id === preferredId);
        let nextSelected: string | null = null;
        if (hasPreferred) {
          nextSelected = preferredId ?? null;
        } else if (options?.fallbackToInbox) {
          const inbox = ordered.find(
            (folder) =>
              folder.system_role?.toUpperCase() === "INBOX" ||
              folder.remote_id.toUpperCase() === "INBOX",
          );
          nextSelected = inbox?.id ?? (ordered[0]?.id ?? null);
        } else if (
          selectedFolderRef.current &&
          ordered.some((folder) => folder.id === selectedFolderRef.current)
        ) {
          nextSelected = selectedFolderRef.current;
        } else {
          nextSelected = ordered[0]?.id ?? null;
        }
        setSelectedFolderId(nextSelected);
        selectedFolderRef.current = nextSelected;
        return nextSelected;
      } catch (e) {
        console.error("Failed to fetch folders", e);
        setLoadError(e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        setFoldersLoading(false);
      }
    },
    [accountEmail],
  );

  const recordSearchMetric = useCallback((durationMs: number) => {
    const next = [...searchMetricsRef.current, durationMs].slice(-20);
    searchMetricsRef.current = next;
    setSearchMetrics({ lastDurationMs: durationMs, samples: next });
  }, []);

  const resetSearchMetrics = useCallback(() => {
    searchMetricsRef.current = [];
    setSearchMetrics({ lastDurationMs: null, samples: [] });
  }, []);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setDebouncedQuery("");
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, searchDebounceMs);
    return () => clearTimeout(timer);
  }, [searchQuery, searchDebounceMs]);

  // Fetch folders when account changes
  useEffect(() => {
    selectedFolderRef.current = selectedFolderId;
  }, [selectedFolderId]);

  useEffect(() => {
    setSelectedFolderId(null);
    setEmails([]);
    setSearchQuery("");
    setDebouncedQuery("");
    setSearchFilters(DEFAULT_SEARCH_FILTERS);
    setSearchHistory([]);
    resetSearchMetrics();
    setFolders([]);
    if (!accountEmail) {
      setFoldersLoading(false);
      setLoadError(null);
      return;
    }
    refreshFolders();
  }, [accountEmail, refreshFolders, resetSearchMetrics]);

  const refreshEmails = useCallback(
    async (options?: { folderId?: string | null }) => {
      const activeFolderId = options?.folderId ?? selectedFolderId;
      if (!activeFolderId || !accountEmail) {
        setEmails([]);
        return;
      }

      const requestId = ++searchRequestId.current;
      const query = debouncedQuery.trim();
      const isSearch = query.length > 0;
      const startedAt = isSearch && typeof performance !== "undefined" ? performance.now() : 0;
      setLoading(true);
      setLoadError(null);
      try {
        let msgs: Email[];
        if (isSearch) {
          const trimmedSender = searchFilters.sender.trim();
          const filterPayload = {
            account_scope: searchFilters.searchScope,
            sender: trimmedSender ? trimmedSender : undefined,
            start_date: searchFilters.startDate || undefined,
            end_date: searchFilters.endDate || undefined,
            has_attachments: searchFilters.hasAttachments ? true : undefined,
            folder_ids:
              searchFilters.searchScope === "current_folder" && activeFolderId
                ? [activeFolderId]
                : undefined,
          };
          msgs = await invoke("search_emails_with_filters", {
            accountEmail,
            query,
            filters: filterPayload,
          });
          const history: SearchHistoryEntry[] = await invoke("get_search_history", { accountEmail });
          if (requestId === searchRequestId.current) {
            setSearchHistory(history.slice(0, 10));
          }
        } else {
          msgs = await invoke("get_emails", {
            folderId: activeFolderId,
            limit: 50,
            offset: 0,
          });
        }
        if (requestId !== searchRequestId.current) return;
        setEmails(msgs);
        if (isSearch && startedAt) {
          recordSearchMetric(performance.now() - startedAt);
        }
      } catch (e) {
        if (requestId !== searchRequestId.current) return;
        console.error("Failed to fetch emails", e);
        setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        if (requestId === searchRequestId.current) {
          setLoading(false);
        }
      }
    },
    [accountEmail, debouncedQuery, recordSearchMetric, searchFilters, selectedFolderId],
  );

  // Fetch emails when folder changes
  useEffect(() => {
    refreshEmails();
  }, [refreshEmails]);

  useEffect(() => {
    if (!accountEmail) {
      setSearchHistory([]);
      return;
    }
    const loadHistory = async () => {
      try {
        const history: SearchHistoryEntry[] = await invoke("get_search_history", { accountEmail });
        setSearchHistory(history.slice(0, 10));
      } catch (e) {
        console.error("Failed to fetch search history", e);
      }
    };
    loadHistory();
  }, [accountEmail]);

  useEffect(() => {
    const previousFolder = previousFolderRef.current;
    previousFolderRef.current = selectedFolderId;
    if (!previousFolder || previousFolder === selectedFolderId) return;
    if (searchQuery.trim() && searchFilters.searchScope === "current_folder") {
      setSearchQuery("");
      setDebouncedQuery("");
    }
  }, [searchFilters.searchScope, searchQuery, selectedFolderId]);
  
  // Background pre-fetching (Continuous)
  useEffect(() => {
    if (!emails.length || !accountEmail || !selectedFolderId) return;
    
    // Find all emails that don't have bodies yet
    const toPreFetch = emails.filter(e => !e.body_html && !e.body_text);
      
    if (toPreFetch.length === 0) return;

    console.log(`[PreFetch] Starting for ${toPreFetch.length} remaining emails`);
    
    let isCancelled = false;
    
    const runPreFetch = async () => {
      for (const email of toPreFetch) {
        if (isCancelled) break;
        
        try {
          // Check if it already has body (might have been updated by another fetch)
          const current = emails.find(e => e.uid === email.uid);
          if (current?.body_html || current?.body_text) continue;

          const details: any = await invoke("get_email_details", {
            accountEmail,
            folderId: selectedFolderId,
            uid: email.uid,
          });
          
          if (isCancelled) break;

          setEmails(prev => prev.map(e => e.uid === email.uid ? { 
            ...e, 
            body_html: details.body_html, 
            body_text: details.body_text,
            attachments: details.attachments,
            flags: details.flags 
          } : e));
          
          // Small delay to be polite to the server and local CPU
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (e) {
          console.warn(`[PreFetch] Failed for ${email.uid}`, e);
          // Wait a bit longer on error
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      if (!isCancelled) console.log(`[PreFetch] Completed all available emails in ${selectedFolderId}`);
    };
    
    const timer = setTimeout(runPreFetch, 1000); 
    return () => {
        isCancelled = true;
        clearTimeout(timer);
    };
  }, [emails.length, selectedFolderId, accountEmail]);

  const sync = async () => {
    if (!accountEmail) return;
    setSyncing(true);
    try {
      await invoke("sync_account", { email: accountEmail });
      const nextFolderId = await refreshFolders({ selectFolderId: selectedFolderId ?? undefined, fallbackToInbox: true });
      await refreshEmails({ folderId: nextFolderId ?? selectedFolderId });
    } catch (e) {
      console.error("Sync failed", e);
      throw e;
    } finally {
      setSyncing(false);
    }
  };

  const fetchEmailDetails = async (emailUid: string): Promise<Email> => {
    if (!accountEmail || !selectedFolderId) throw new Error("Missing context");
    try {
      const details: any = await invoke("get_email_details", {
        accountEmail,
        folderId: selectedFolderId,
        uid: emailUid,
      });
      const { body_html, body_text, attachments, flags } = details;
      return {
        uid: emailUid,
        body_html,
        body_text,
        attachments,
        flags,
      } as Email;
    } catch (e) {
      console.error("Failed to fetch email details", e);
      throw e;
    }
  };

  const deleteEmails = async (uids: string[]) => {
    // Optimistic update
    const previousEmails = [...emails];
    setEmails(emails.filter(e => !uids.includes(e.uid)));
    
    try {
      await Promise.all(uids.map(uid => invoke("delete_email", { 
        accountEmail, 
        folderId: selectedFolderId, 
        uid 
      })));
    } catch (e) {
      console.error("Bulk delete failed", e);
      setEmails(previousEmails); // Rollback
      throw e;
    }
  };

  const createFolder = async (name: string) => {
    if (!accountEmail) throw new Error("Missing account context");
    const created = await invoke<Folder>("create_folder", { accountEmail, name });
    await refreshFolders({ selectFolderId: created.id });
    return created;
  };

  const renameFolder = async (folderId: string, newName: string) => {
    if (!accountEmail) throw new Error("Missing account context");
    const updated = await invoke<Folder>("rename_folder", {
      accountEmail,
      folderId,
      newName,
    });
    await refreshFolders({ selectFolderId: updated.id });
    return updated;
  };

  const deleteFolder = async (folderId: string) => {
    if (!accountEmail) throw new Error("Missing account context");
    await invoke("delete_folder", { accountEmail, folderId });
    await refreshFolders({ fallbackToInbox: selectedFolderId === folderId });
  };

  const toggleFlag = async (uid: string, currentFlags: string[]) => {
    const isFlagged = currentFlags.includes("\\Flagged");
    const newFlags = isFlagged 
      ? currentFlags.filter(f => f !== "\\Flagged")
      : [...currentFlags, "\\Flagged"];
      
    // Optimistic update
    setEmails(emails.map(e => e.uid === uid ? { ...e, flags: newFlags } : e));
    
    try {
      await invoke("update_email_flag", {
        accountEmail,
        folderId: selectedFolderId,
        uid,
        flag: "\\Flagged",
        value: !isFlagged
      });
    } catch (e) {
      console.error("Toggle flag failed", e);
      setEmails(emails); // Revert to current state (or keep previous)
    }
  };

  const markAsRead = async (uid: string, seen: boolean) => {
    let wasChanged = false;

    // Optimistic update of email list
    setEmails(emails.map(e => {
        if (e.uid === uid) {
            const currentFlags = e.flags || [];
            const hasSeen = currentFlags.includes("\\Seen");
            if (seen && !hasSeen) {
                wasChanged = true;
                return { ...e, flags: [...currentFlags, "\\Seen"] };
            } else if (!seen && hasSeen) {
                wasChanged = true;
                return { ...e, flags: currentFlags.filter(f => f !== "\\Seen") };
            }
        }
        return e;
    }));

    if (!wasChanged) return;

    // Optimistic update of folder unread badge
    setFolders(folders.map(f => {
        if (f.id === selectedFolderId) {
            return {
                ...f,
                unread_count: seen ? Math.max(0, f.unread_count - 1) : f.unread_count + 1
            };
        }
        return f;
    }));

    try {
      await invoke("update_email_flag", {
        accountEmail,
        folderId: selectedFolderId,
        uid,
        flag: "\\Seen",
        value: seen
      });
    } catch (e) {
      console.error("Mark as read failed", e);
    }
  };

  const loadMore = async () => {
    if (loading || loadingMoreRef.current || !selectedFolderId || !accountEmail || searchQuery.trim() || debouncedQuery.trim()) return;
    loadingMoreRef.current = true;
    setLoading(true);
    try {
      const moreMsgs: Email[] = await invoke("get_emails", { 
        folderId: selectedFolderId, 
        limit: 50, 
        offset: emails.length 
      });
      setEmails([...emails, ...moreMsgs]);
    } catch (e) {
      console.error("Load more failed", e);
    } finally {
      setLoading(false);
      loadingMoreRef.current = false;
    }
  };

  const clearSearchHistory = async () => {
    if (!accountEmail) return;
    try {
      await invoke("clear_search_history", { accountEmail });
      setSearchHistory([]);
    } catch (e) {
      console.error("Failed to clear search history", e);
    }
  };

  const applyEmailAction = async (uids: string[], action: EmailBulkAction) => {
    if (!accountEmail || !selectedFolderId || uids.length === 0) return;
    const previousEmails = [...emails];
    const previousFolders = [...folders];
    let unreadDelta = 0;

    if (action === "delete") {
      setEmails(emails.filter(e => !uids.includes(e.uid)));
    } else {
      setEmails(emails.map(e => {
        if (!uids.includes(e.uid)) return e;
        const flags = e.flags ?? [];
        if (action === "mark_read" && !flags.includes("\\Seen")) {
          unreadDelta -= 1;
          return { ...e, flags: [...flags, "\\Seen"] };
        }
        if (action === "mark_unread" && flags.includes("\\Seen")) {
          unreadDelta += 1;
          return { ...e, flags: flags.filter(f => f !== "\\Seen") };
        }
        if (action === "flag" && !flags.includes("\\Flagged")) {
          return { ...e, flags: [...flags, "\\Flagged"] };
        }
        if (action === "unflag" && flags.includes("\\Flagged")) {
          return { ...e, flags: flags.filter(f => f !== "\\Flagged") };
        }
        return e;
      }));
    }

    if (unreadDelta !== 0) {
      setFolders(folders.map(folder => {
        if (folder.id !== selectedFolderId) return folder;
        return { ...folder, unread_count: Math.max(0, folder.unread_count + unreadDelta) };
      }));
    }

    try {
      await invoke("apply_email_action", {
        accountEmail,
        folderId: selectedFolderId,
        uids,
        action,
      });
    } catch (e) {
      console.error("Bulk action failed", e);
      setEmails(previousEmails);
      setFolders(previousFolders);
      throw e;
    }
  };

  const moveEmails = async (uids: string[], targetFolderId: string) => {
    if (!accountEmail || !selectedFolderId || uids.length === 0) return;
    const previousEmails = [...emails];
    setEmails(emails.filter(e => !uids.includes(e.uid)));
    try {
      await invoke("move_emails", {
        accountEmail,
        sourceFolderId: selectedFolderId,
        targetFolderId: targetFolderId,
        uids,
      });
    } catch (e) {
      console.error("Move emails failed", e);
      setEmails(previousEmails);
      throw e;
    }
  };

  const deleteEmailsWithUndo = async (uids: string[]) => {
    if (!accountEmail || !selectedFolderId || uids.length === 0) return null;
    const previousEmails = [...emails];
    const previousFolders = [...folders];
    setEmails(emails.filter(e => !uids.includes(e.uid)));
    try {
      await Promise.all(uids.map(uid => invoke("delete_email", {
        accountEmail,
        folderId: selectedFolderId,
        uid
      })));
      return () => {
        setEmails(previousEmails);
        setFolders(previousFolders);
      };
    } catch (e) {
      console.error("Bulk delete failed", e);
      setEmails(previousEmails);
      setFolders(previousFolders);
      throw e;
    }
  };

  const applyEmailActionWithUndo = async (uids: string[], action: EmailBulkAction) => {
    if (!accountEmail || !selectedFolderId || uids.length === 0) return null;
    const previousEmails = [...emails];
    const previousFolders = [...folders];
    let unreadDelta = 0;

    if (action === "delete") {
      setEmails(emails.filter(e => !uids.includes(e.uid)));
    } else {
      setEmails(emails.map(e => {
        if (!uids.includes(e.uid)) return e;
        const flags = e.flags ?? [];
        if (action === "mark_read" && !flags.includes("\\Seen")) {
          unreadDelta -= 1;
          return { ...e, flags: [...flags, "\\Seen"] };
        }
        if (action === "mark_unread" && flags.includes("\\Seen")) {
          unreadDelta += 1;
          return { ...e, flags: flags.filter(f => f !== "\\Seen") };
        }
        if (action === "flag" && !flags.includes("\\Flagged")) {
          return { ...e, flags: [...flags, "\\Flagged"] };
        }
        if (action === "unflag" && flags.includes("\\Flagged")) {
          return { ...e, flags: flags.filter(f => f !== "\\Flagged") };
        }
        return e;
      }));
    }

    if (unreadDelta !== 0) {
      setFolders(folders.map(folder => {
        if (folder.id !== selectedFolderId) return folder;
        return { ...folder, unread_count: Math.max(0, folder.unread_count + unreadDelta) };
      }));
    }

    try {
      await invoke("apply_email_action", {
        accountEmail,
        folderId: selectedFolderId,
        uids,
        action,
      });
      return () => {
        setEmails(previousEmails);
        setFolders(previousFolders);
      };
    } catch (e) {
      console.error("Bulk action failed", e);
      setEmails(previousEmails);
      setFolders(previousFolders);
      throw e;
    }
  };

  const moveEmailsWithUndo = async (uids: string[], targetFolderId: string) => {
    if (!accountEmail || !selectedFolderId || uids.length === 0) return null;
    const previousEmails = [...emails];
    const previousFolders = [...folders];
    setEmails(emails.filter(e => !uids.includes(e.uid)));
    try {
      await invoke("move_emails", {
        accountEmail,
        sourceFolderId: selectedFolderId,
        targetFolderId: targetFolderId,
        uids,
      });
      return () => {
        setEmails(previousEmails);
        setFolders(previousFolders);
      };
    } catch (e) {
      console.error("Move emails failed", e);
      setEmails(previousEmails);
      setFolders(previousFolders);
      throw e;
    }
  };

  return {
    folders,
    emails,
    selectedFolderId,
    setSelectedFolderId,
    loading,
    foldersLoading,
    loadError,
    syncing,
    sync,
    fetchEmailDetails,
    deleteEmails,
    toggleFlag,
    markAsRead,
    loadMore,
    searchQuery,
    setSearchQuery,
    debouncedQuery,
    searchFilters,
    setSearchFilters,
    searchHistory,
    searchMetrics,
    resetSearchMetrics,
    clearSearchHistory,
    refreshFolders,
    refreshEmails,
    createFolder,
    renameFolder,
    deleteFolder,
    applyEmailAction,
    applyEmailActionWithUndo,
    moveEmails,
    moveEmailsWithUndo,
    deleteEmailsWithUndo,
  };
}
