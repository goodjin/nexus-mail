import React, { useState, useEffect } from "react";
import { useAccountContext } from "./context/AccountContext";
import { useMailbox, Email } from "./hooks/useMailbox";
import { Sidebar } from "./components/layout/Sidebar";
import { ShortcutsModal } from "./components/layout/ShortcutsModal";
import { EmailList } from "./components/mail/EmailList";
import { EmailDetail } from "./components/mail/EmailDetail";
import { Badge } from "./components/ui/Badge";
import { Button } from "./components/ui/Button";
import { ComposeModal } from "./components/mail/ComposeModal";
import { SettingsModal } from "./components/settings/SettingsModal";
import { useSettings } from "./hooks/useSettings";
import { invoke } from "./lib/tauri";
import "./App.css";

type ComposePreset = {
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  body?: string;
};

const App: React.FC = () => {
  const { 
    accounts, 
    selectedAccount, 
    setSelectedAccount,
    refreshAccounts,
  } = useAccountContext();
  const selectedAccountInfo = React.useMemo(
    () => accounts.find((account) => account.id === selectedAccount) ?? null,
    [accounts, selectedAccount]
  );
  const selectedAccountEmail = selectedAccountInfo?.email ?? null;

  const {
    folders,
    emails,
    selectedFolderId,
    setSelectedFolderId,
    loading: emailsLoading,
    foldersLoading,
    loadError,
    syncing,
    sync,
    fetchEmailDetails,
    toggleFlag,
    markAsRead,
    loadMore,
    searchQuery,
    setSearchQuery,
    searchFilters,
    setSearchFilters,
    searchHistory,
    clearSearchHistory,
    searchMetrics,
    resetSearchMetrics,
    createFolder,
    renameFolder,
    deleteFolder,
    applyEmailAction,
    applyEmailActionWithUndo,
    moveEmailsWithUndo,
    deleteEmailsWithUndo,
    refreshEmails,
  } = useMailbox(selectedAccountEmail);
  const { settings } = useSettings();

  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [composePreset, setComposePreset] = useState<ComposePreset | undefined>(undefined);
  const [detailStatus, setDetailStatus] = useState<{ state: "idle" | "loading" | "error"; message?: string }>({ state: "idle" });
  const [sessionAccountIssues, setSessionAccountIssues] = useState<Record<string, { state: "error"; message?: string }>>({});
  const [sessionLastSyncByAccount, setSessionLastSyncByAccount] = useState<Record<string, number>>({});
  const accountIssues = React.useMemo(() => {
    const backendIssues = accounts.reduce<Record<string, { state: "error"; message?: string }>>((acc, account) => {
      if (account.status !== "normal") {
        acc[account.id] = { state: "error", message: account.last_error ?? `Account status: ${account.status}` };
      }
      return acc;
    }, {});
    return { ...backendIssues, ...sessionAccountIssues };
  }, [accounts, sessionAccountIssues]);

  const isAccountIssue = (message: string) => {
    const normalized = message.toLowerCase();
    return (
      normalized.includes("password") ||
      normalized.includes("auth") ||
      normalized.includes("login") ||
      normalized.includes("credential") ||
      normalized.includes("imap") ||
      normalized.includes("smtp")
    );
  };

  const recordAccountIssue = (message: string) => {
    if (!selectedAccount) return;
    if (!isAccountIssue(message)) return;
    setSessionAccountIssues((prev) => ({
      ...prev,
      [selectedAccount]: { state: "error", message },
    }));
  };

  const clearAccountIssue = () => {
    if (!selectedAccount) return;
    setSessionAccountIssues((prev) => {
      if (!prev[selectedAccount]) return prev;
      const next = { ...prev };
      delete next[selectedAccount];
      return next;
    });
  };

  useEffect(() => {
    setSelectedEmail(null);
    setDetailStatus({ state: "idle" });
  }, [selectedAccount]);

  useEffect(() => {
    setSelectedEmail(null);
    setDetailStatus({ state: "idle" });
  }, [selectedFolderId]);
  
  // Sync selectedEmail with the emails array if it was updated by pre-fetch
  const effectiveEmail = React.useMemo(() => {
    if (!selectedEmail) return null;
    const listEmail = emails.find(e => e.uid === selectedEmail.uid);
    if (!listEmail) return selectedEmail;
    const hasDetails = Boolean(
      selectedEmail.body_html ||
      selectedEmail.body_text ||
      (selectedEmail.attachments && selectedEmail.attachments.length > 0)
    );
    return hasDetails ? { ...listEmail, ...selectedEmail } : listEmail;
  }, [emails, selectedEmail]);

  const selectEmail = React.useCallback((email: Email) => {
    setSelectedEmail(email);
    const isUnread = !email.flags?.includes("\\Seen");
    if (isUnread) {
      markAsRead(email.uid, true);
    }
  }, [markAsRead]);

  const navigateEmail = React.useCallback((direction: "next" | "prev") => {
    if (emails.length === 0) return;
    const currentIndex = effectiveEmail
      ? emails.findIndex(item => item.uid === effectiveEmail.uid)
      : -1;
    const nextIndex = direction === "next"
      ? Math.min(emails.length - 1, currentIndex + 1)
      : Math.max(0, currentIndex - 1);
    const target = emails[nextIndex >= 0 ? nextIndex : 0];
    if (target) {
      selectEmail(target);
    }
  }, [emails, effectiveEmail, selectEmail]);

  useEffect(() => {
    if (!selectedEmail) return;
    const listEmail = emails.find(item => item.uid === selectedEmail.uid);
    if (listEmail) {
      setSelectedEmail((prev) => {
        if (!prev || prev.uid !== listEmail.uid) return prev;
        const prevFlags = prev.flags?.join(",") ?? "";
        const nextFlags = listEmail.flags?.join(",") ?? "";
        const shouldUpdate =
          prev.subject !== listEmail.subject ||
          prev.snippet !== listEmail.snippet ||
          prev.from !== listEmail.from ||
          prev.date !== listEmail.date ||
          prevFlags !== nextFlags;
        if (!shouldUpdate) return prev;
        return { ...listEmail, ...prev };
      });
      return;
    }
    if (!searchQuery.trim()) {
      setSelectedEmail(null);
    }
  }, [emails, searchQuery, selectedEmail]);
  
  // Fetch full details when email is selected
  useEffect(() => {
    const needsDetails = effectiveEmail && (
      (!effectiveEmail.body_html && !effectiveEmail.body_text) ||
      !effectiveEmail.attachments
    );
    if (needsDetails) {
      let isCancelled = false;
      const uid = effectiveEmail.uid;
      const getDetails = async () => {
        try {
          setDetailStatus({ state: "loading" });
          const fullEmail = await fetchEmailDetails(uid);
          if (!isCancelled) {
            setSelectedEmail((prev) => (prev?.uid === uid ? { ...prev, ...fullEmail } : prev));
            setDetailStatus({ state: "idle" });
            clearAccountIssue();
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          console.error("Fetch details failed", e);
          if (!isCancelled) {
            setDetailStatus({ state: "error", message });
            recordAccountIssue(message);
          }
        }
      };
      getDetails();
      return () => {
        isCancelled = true;
      };
    }
    setDetailStatus({ state: "idle" });
    return undefined;
  }, [effectiveEmail?.uid]);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [settingsState, setSettingsState] = useState<{ isOpen: boolean, initialTab?: 'general' | 'accounts', initialAction?: 'add_account' }>(() => {
    if (typeof window === "undefined") return { isOpen: false };
    const tab = window.localStorage.getItem("nexus-test-open-settings");
    if (tab === "accounts" || tab === "general") {
      return { isOpen: true, initialTab: tab };
    }
    return { isOpen: false };
  });
  const [syncStatus, setSyncStatus] = useState<{ type: "loading" | "success" | "error"; message: string } | null>(null);
  const [undoToast, setUndoToast] = useState<{ message: string; onUndo: () => void } | null>(null);
  const [isShortcutMapOpen, setIsShortcutMapOpen] = useState(false);
  const undoTimeoutRef = React.useRef<number | null>(null);

  const shortcutGroups = React.useMemo(() => ([
    {
      title: "General",
      items: [
        { description: "Compose new email", keys: "Ctrl/Cmd + N" },
        { description: "Search mail", keys: "Ctrl/Cmd + K" },
        { description: "Sync account", keys: "Ctrl/Cmd + Shift + S" },
        { description: "Open settings", keys: "Ctrl/Cmd + ," },
        { description: "Open shortcuts", keys: "?" },
      ],
    },
    {
      title: "Navigation",
      items: [
        { description: "Next email", keys: "J / ↓" },
        { description: "Previous email", keys: "K / ↑" },
      ],
    },
    {
      title: "Message actions",
      items: [
        { description: "Reply", keys: "R" },
        { description: "Delete", keys: "Delete / Backspace" },
        { description: "Archive", keys: "E" },
        { description: "Mark read/unread", keys: "M / U" },
      ],
    },
  ]), []);

  const resolveUndoTimeoutMs = () => {
    if (typeof window === "undefined") return 5000;
    const stored = window.localStorage.getItem("nexus-mail-undo-timeout-ms");
    const parsed = stored ? Number(stored) : Number.NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 5000;
  };

  const clearUndoToast = React.useCallback(() => {
    if (undoTimeoutRef.current !== null) {
      if (typeof window !== "undefined") {
        window.clearTimeout(undoTimeoutRef.current);
      }
      undoTimeoutRef.current = null;
    }
    setUndoToast(null);
  }, []);

  const showUndoToast = React.useCallback((message: string, onUndo: () => void) => {
    if (undoTimeoutRef.current !== null) {
      window.clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }
    setUndoToast({ message, onUndo });
    const timeoutMs = resolveUndoTimeoutMs();
    if (typeof window !== "undefined") {
      undoTimeoutRef.current = window.setTimeout(() => {
        setUndoToast(null);
        undoTimeoutRef.current = null;
      }, timeoutMs);
    }
  }, []);

  const escapeHtml = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const buildQuotedBody = (email: Email) => {
    const fallbackText = email.body_text || email.snippet || "";
    const rawBody = email.body_html
      ? email.body_html
      : `<p>${escapeHtml(fallbackText).replace(/\n/g, "<br />")}</p>`;
    const metaLines = [
      "<p>--- Original Message ---</p>",
      `<p>From: ${escapeHtml(email.from)}</p>`,
      email.to?.length ? `<p>To: ${escapeHtml(email.to.join(", "))}</p>` : "",
      `<p>Subject: ${escapeHtml(email.subject || "")}</p>`
    ].filter(Boolean).join("");
    return `<p></p>${metaLines}<blockquote>${rawBody}</blockquote>`;
  };

  const withSubjectPrefix = (prefix: string, subject?: string) => {
    const trimmed = subject?.trim() ?? "";
    if (!trimmed) return prefix.trim();
    return trimmed.toLowerCase().startsWith(prefix.toLowerCase()) ? trimmed : `${prefix}${trimmed}`;
  };

  const openReply = React.useCallback((email: Email) => {
    setComposePreset({
      to: email.from,
      subject: withSubjectPrefix("Re: ", email.subject),
      body: buildQuotedBody(email),
    });
    setIsComposeOpen(true);
  }, [buildQuotedBody, withSubjectPrefix]);

  const openForward = React.useCallback((email: Email) => {
    setComposePreset({
      subject: withSubjectPrefix("Fwd: ", email.subject),
      body: buildQuotedBody(email),
    });
    setIsComposeOpen(true);
  }, [buildQuotedBody, withSubjectPrefix]);

  const handleCloseCompose = () => {
    setIsComposeOpen(false);
    setComposePreset(undefined);
  };

  // Auto-hide status messages
  useEffect(() => {
    if (!syncStatus || syncStatus.type === "loading") return;
    const timer = setTimeout(() => setSyncStatus(null), 3000);
    return () => clearTimeout(timer);
  }, [syncStatus]);

  useEffect(() => {
    if (!settingsState.isOpen || typeof window === "undefined") return;
    window.localStorage.removeItem("nexus-test-open-settings");
  }, [settingsState.isOpen]);

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current !== null) {
        if (typeof window !== "undefined") {
          window.clearTimeout(undoTimeoutRef.current);
        }
      }
    };
  }, []);

  const handleSync = async () => {
    if (syncing) return;
    try {
      setSyncStatus({ type: "loading", message: "Syncing account..." });
      await sync();
      await refreshAccounts();
      if (selectedAccount) {
        setSessionLastSyncByAccount((prev) => ({
          ...prev,
          [selectedAccount]: Date.now(),
        }));
      }
      setSyncStatus({ type: "success", message: "Sync completed!" });
      clearAccountIssue();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setSyncStatus({ type: "error", message: `Sync failed: ${message}` });
      recordAccountIssue(message);
    }
  };

  const confirmDelete = React.useCallback((count: number) => {
    if (!settings.confirm_before_delete || typeof window === "undefined") {
      return true;
    }
    const message = count === 1
      ? "Move this email to trash?"
      : `Delete ${count} emails?`;
    return window.confirm(message);
  }, [settings.confirm_before_delete]);

  const deleteWithConfirmation = React.useCallback(async (
    uids: string[],
    options: { reportDetailError?: boolean } = {}
  ) => {
    if (uids.length === 0) return false;
    if (!confirmDelete(uids.length)) return false;
    const previousSelected = selectedEmail;
    try {
      const rollback = await deleteEmailsWithUndo(uids);
      if (!rollback) return false;
      if (effectiveEmail && uids.includes(effectiveEmail.uid)) {
        setSelectedEmail(null);
      }
      clearAccountIssue();
      showUndoToast(`${uids.length} deleted`, () => {
        rollback();
        if (previousSelected && uids.includes(previousSelected.uid)) {
          setSelectedEmail(previousSelected);
        }
      });
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (options.reportDetailError) {
        setDetailStatus({ state: "error", message });
      }
      recordAccountIssue(message);
      return false;
    }
  }, [clearAccountIssue, confirmDelete, deleteEmailsWithUndo, effectiveEmail, recordAccountIssue, selectedEmail, showUndoToast]);

  const handleDeleteSelected = React.useCallback(async () => {
    if (!effectiveEmail) return false;
    return deleteWithConfirmation([effectiveEmail.uid], { reportDetailError: true });
  }, [deleteWithConfirmation, effectiveEmail]);

  const handleArchiveSelected = React.useCallback(async () => {
    if (!effectiveEmail) return;
    try {
      await applyEmailAction([effectiveEmail.uid], "archive");
      clearAccountIssue();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      recordAccountIssue(message);
    }
  }, [applyEmailAction, clearAccountIssue, effectiveEmail, recordAccountIssue]);

  const handleToggleReadSelected = React.useCallback(async () => {
    if (!effectiveEmail) return;
    const isSeen = effectiveEmail.flags?.includes("\\Seen") ?? false;
    await markAsRead(effectiveEmail.uid, !isSeen);
  }, [effectiveEmail, markAsRead]);

  const focusSearchInput = React.useCallback(() => {
    if (typeof document === "undefined") return;
    const input = document.querySelector<HTMLInputElement>('[data-testid="search-input"]');
    if (input) {
      input.focus();
      input.select();
    }
  }, []);

  const isEditableTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || target.isContentEditable;
  };

  useEffect(() => {
      const handleKeydown = (event: KeyboardEvent) => {
        const modKey = event.metaKey || event.ctrlKey;
        const key = event.key.toLowerCase();
        const isEditable = isEditableTarget(event.target);
        const isShortcutToggle = key === "?" || (key === "/" && event.shiftKey);
        const allowWhileEditing =
          (!modKey && isShortcutToggle) ||
          (modKey && (key === "n" || key === "k" || key === "," || (key === "s" && event.shiftKey)));
        if (isShortcutMapOpen) {
          if (key === "escape" || isShortcutToggle) {
            event.preventDefault();
            setIsShortcutMapOpen(false);
          }
          return;
        }
        if (isComposeOpen || settingsState.isOpen) return;
        if (isEditable && !allowWhileEditing) return;
      if (modKey && key === "n") {
        event.preventDefault();
        setComposePreset(undefined);
        setIsComposeOpen(true);
      }
      if (modKey && key === "k") {
        event.preventDefault();
        focusSearchInput();
      }
      if (modKey && key === ",") {
        event.preventDefault();
        setSettingsState({ isOpen: true, initialTab: 'general' });
      }
      if (modKey && key === "s" && event.shiftKey) {
        event.preventDefault();
        handleSync();
      }
        if (!modKey && isShortcutToggle) {
          event.preventDefault();
          setIsShortcutMapOpen(true);
        }
      if (!modKey && key === "r" && effectiveEmail) {
        event.preventDefault();
        openReply(effectiveEmail);
      }
      if (!modKey && (key === "delete" || key === "backspace") && effectiveEmail) {
        event.preventDefault();
        handleDeleteSelected();
      }
      if (!modKey && key === "e" && effectiveEmail) {
        event.preventDefault();
        handleArchiveSelected();
      }
      if (!modKey && (key === "u" || key === "m") && effectiveEmail) {
        event.preventDefault();
        handleToggleReadSelected();
      }
      if (!modKey && (key === "arrowdown" || key === "j")) {
        event.preventDefault();
        event.stopPropagation();
        navigateEmail("next");
      }
      if (!modKey && (key === "arrowup" || key === "k")) {
        event.preventDefault();
        event.stopPropagation();
        navigateEmail("prev");
      }
    };
    window.addEventListener("keydown", handleKeydown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeydown, { capture: true });
  }, [effectiveEmail, focusSearchInput, handleArchiveSelected, handleDeleteSelected, handleSync, handleToggleReadSelected, isComposeOpen, isShortcutMapOpen, navigateEmail, openReply, settingsState.isOpen]);

  const currentFolder = folders.find(f => f.id === selectedFolderId);
  const lastSyncAt =
    (selectedAccount ? sessionLastSyncByAccount[selectedAccount] : undefined) ??
    selectedAccountInfo?.last_sync ??
    null;
  const mailboxStatus = React.useMemo(() => {
    if (syncing || syncStatus?.type === "loading") {
      return { type: "loading" as const, message: "Syncing this account..." };
    }
    if (syncStatus?.type === "error") {
      return { type: "error" as const, message: syncStatus.message };
    }
    if (selectedAccountInfo && selectedAccountInfo.status !== "normal") {
      return {
        type: "error" as const,
        message: selectedAccountInfo.last_error ?? `Account needs attention (${selectedAccountInfo.status})`,
      };
    }
    if (syncStatus?.type === "success") {
      return { type: "success" as const, message: syncStatus.message };
    }
    return null;
  }, [selectedAccountInfo, syncStatus, syncing]);

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === "undefined") return;
      const global = window as typeof window & {
        __nexusTest?: {
          getFirstEmail: () => Email | null;
          selectEmailByUid: (uid: string) => void;
          openReplyForFirstEmail: () => void;
          openForwardForFirstEmail: () => void;
          getSearchHistory: (email?: string) => Promise<any>;
          getSearchMetrics: () => { lastDurationMs: number | null; samples: number[] };
          resetSearchMetrics: () => void;
          setAccountSignature: (email: string, signature: string) => void;
          openSettings: (tab?: 'general' | 'accounts', action?: 'add_account') => void;
        };
      };
      global.__nexusTest = {
        getFirstEmail: () => emails[0] ?? null,
        selectEmailByUid: (uid: string) => {
          const email = emails.find(item => item.uid === uid);
          if (!email) return;
          selectEmail(email);
        },
        openReplyForFirstEmail: () => {
          const email = emails[0];
          if (!email) return;
          openReply(email);
      },
        openForwardForFirstEmail: () => {
          const email = emails[0];
          if (!email) return;
          openForward(email);
        },
        getSearchHistory: async (email?: string) => {
          return invoke("get_search_history", {
            accountEmail: email ?? selectedAccountEmail ?? undefined,
          });
        },
        getSearchMetrics: () => searchMetrics,
        resetSearchMetrics: () => resetSearchMetrics(),
        setAccountSignature: (email: string, signature: string) => {
          if (typeof window === "undefined") return;
          try {
            const stored = window.localStorage.getItem("nexus-mail-signatures");
            const parsed = stored ? JSON.parse(stored) : {};
            const next = { ...(parsed && typeof parsed === "object" ? parsed : {}), [email]: signature };
            window.localStorage.setItem("nexus-mail-signatures", JSON.stringify(next));
          } catch (error) {
            console.warn("Failed to persist signature", error);
          }
        },
        openSettings: (tab = 'general', action) => {
          setSettingsState({ isOpen: true, initialTab: tab, initialAction: action });
        },
      };
    return () => {
      delete global.__nexusTest;
    };
  }, [emails, openForward, openReply, resetSearchMetrics, searchMetrics, selectEmail, selectedAccountEmail]);
  const handleFolderDrop = async (folderId: string, uids: string[]) => {
    if (!selectedFolderId || folderId === selectedFolderId) return;
    const previousSelected = selectedEmail;
    try {
      const rollback = await moveEmailsWithUndo(uids, folderId);
      if (rollback) {
        showUndoToast(`${uids.length} moved`, () => {
          rollback();
          if (previousSelected) {
            setSelectedEmail(previousSelected);
          }
        });
      }
      clearAccountIssue();
      if (effectiveEmail && uids.includes(effectiveEmail.uid)) {
        setSelectedEmail(null);
      }
    } catch (e) {
      console.error("Folder drop move failed", e);
    }
  };

  return (
    <div className="flex h-screen w-full bg-nexus-background overflow-hidden text-nexus-foreground">
      {/* Toast Notification */}
      {syncStatus && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <Badge
            data-testid="sync-toast"
            className={`px-4 py-2 shadow-lg animate-in fade-in slide-in-from-bottom-4 ${
              syncStatus.type === "error"
                ? "bg-red-500 text-white"
                : syncStatus.type === "success"
                ? "bg-emerald-500 text-white"
                : "bg-nexus-accent text-white"
            }`}
          >
            {syncStatus.message}
          </Badge>
        </div>
      )}

      {undoToast && (
        <div className="fixed bottom-6 right-6 z-50" data-testid="bulk-undo-toast">
          <div className="flex items-center gap-3 rounded-full border border-nexus-border bg-nexus-card px-4 py-2 shadow-lg animate-in fade-in slide-in-from-bottom-4">
            <span className="text-xs text-nexus-foreground">{undoToast.message}</span>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 px-3 text-[11px]"
              onClick={() => {
                undoToast.onUndo();
                clearUndoToast();
              }}
              data-testid="bulk-undo-button"
            >
              Undo
            </Button>
          </div>
        </div>
      )}

      {/* Layers */}
      <Sidebar 
        accounts={accounts}
        accountIssues={accountIssues}
        selectedAccount={selectedAccount}
        onAccountChange={setSelectedAccount}
        folders={folders}
        isFolderLoading={foldersLoading}
        selectedFolderId={selectedFolderId}
        onFolderSelect={setSelectedFolderId}
        onSync={handleSync}
        isSyncing={syncing}
        mailboxStatus={mailboxStatus}
        lastSyncAt={lastSyncAt}
        onCompose={() => {
          setComposePreset(undefined);
          setIsComposeOpen(true);
        }}
        onSettings={() => setSettingsState({ isOpen: true, initialTab: 'general' })}
        onShortcuts={() => setIsShortcutMapOpen(true)}
        onAddAccount={() => setSettingsState({ isOpen: true, initialTab: 'accounts', initialAction: 'add_account' })}
        onCreateFolder={async (name) => {
          try {
            await createFolder(name);
            clearAccountIssue();
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            recordAccountIssue(message);
            throw e;
          }
        }}
        onRenameFolder={async (folderId, newName) => {
          try {
            await renameFolder(folderId, newName);
            clearAccountIssue();
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            recordAccountIssue(message);
            throw e;
          }
        }}
        onDeleteFolder={async (folderId) => {
          try {
            await deleteFolder(folderId);
            clearAccountIssue();
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            recordAccountIssue(message);
            throw e;
          }
        }}
        onFolderDrop={handleFolderDrop}
      />

      <EmailList 
        emails={emails}
        selectedEmailId={effectiveEmail?.uid || null}
        onEmailSelect={selectEmail}
        folderName={currentFolder?.name || "Inbox"}
        hasAccounts={accounts.length > 0}
        mailboxStatus={mailboxStatus}
        lastSyncAt={lastSyncAt}
        isLoading={emailsLoading}
        isFolderLoading={foldersLoading}
        loadError={loadError}
        hasFolder={Boolean(selectedFolderId)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchFilters={searchFilters}
        onSearchFiltersChange={setSearchFilters}
        searchHistory={searchHistory}
        onClearSearchHistory={clearSearchHistory}
        folders={folders}
        currentFolderId={selectedFolderId}
        onApplyEmailAction={async (uids, action) => {
          try {
            const previousSelected = selectedEmail;
            if (action === "mark_read" || action === "mark_unread") {
              const rollback = await applyEmailActionWithUndo(uids, action);
              if (rollback) {
                showUndoToast(`${uids.length} marked ${action === "mark_read" ? "read" : "unread"}`, () => {
                  rollback();
                  if (previousSelected) {
                    setSelectedEmail(previousSelected);
                  }
                });
              }
            } else {
              await applyEmailAction(uids, action);
            }
            if (effectiveEmail && uids.includes(effectiveEmail.uid)) {
              if (action === "mark_read") {
                const flags = effectiveEmail.flags ?? [];
                if (!flags.includes("\\Seen")) {
                  setSelectedEmail({ ...effectiveEmail, flags: [...flags, "\\Seen"] });
                }
              }
              if (action === "mark_unread") {
                const flags = effectiveEmail.flags ?? [];
                if (flags.includes("\\Seen")) {
                  setSelectedEmail({ ...effectiveEmail, flags: flags.filter(flag => flag !== "\\Seen") });
                }
              }
            }
            clearAccountIssue();
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            recordAccountIssue(message);
            throw e;
          }
        }}
        onMoveEmails={async (uids, targetFolderId) => {
          try {
            const previousSelected = selectedEmail;
            const rollback = await moveEmailsWithUndo(uids, targetFolderId);
            if (rollback) {
              showUndoToast(`${uids.length} moved`, () => {
                rollback();
                if (previousSelected) {
                  setSelectedEmail(previousSelected);
                }
              });
            }
            clearAccountIssue();
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            recordAccountIssue(message);
            throw e;
          }
        }}
        onDeleteEmails={(uids) => deleteWithConfirmation(uids)}
        onLoadMore={loadMore}
        onAddAccount={() => setSettingsState({ isOpen: true, initialTab: 'accounts', initialAction: 'add_account' })}
        onRetry={() => refreshEmails()}
      />

      <EmailDetail 
        email={effectiveEmail}
        accountEmail={selectedAccountEmail}
        folderId={selectedFolderId}
        detailStatus={detailStatus}
        onRetryLoad={async () => {
          if (!effectiveEmail) return;
          try {
            setDetailStatus({ state: "loading" });
            const fullEmail = await fetchEmailDetails(effectiveEmail.uid);
            setSelectedEmail((prev) => (prev?.uid === effectiveEmail.uid ? { ...prev, ...fullEmail } : prev));
            setDetailStatus({ state: "idle" });
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            setDetailStatus({ state: "error", message });
            recordAccountIssue(message);
          }
        }}
        onDelete={(uid: string) => deleteWithConfirmation([uid], { reportDetailError: true })}
        onToggleFlag={async (uid: string, flags: string[]) => {
            await toggleFlag(uid, flags);
            if (selectedEmail?.uid === uid) {
                const isFlagged = flags.includes("\\Flagged");
                const newFlags = isFlagged 
                    ? flags.filter(f => f !== "\\Flagged")
                    : [...flags, "\\Flagged"];
                setSelectedEmail({ ...selectedEmail, flags: newFlags });
            }
        }}
        onMarkAsRead={async (uid: string, seen: boolean) => {
            await markAsRead(uid, seen);
            if (selectedEmail?.uid === uid) {
                const currentFlags = selectedEmail.flags || [];
                const newFlags = seen 
                    ? (currentFlags.includes("\\Seen") ? (currentFlags as string[]) : [...(currentFlags as string[]), "\\Seen"])
                    : (currentFlags as string[]).filter(f => f !== "\\Seen");
                setSelectedEmail({ ...selectedEmail, flags: newFlags });
            }
        }}
        onReply={openReply}
        onForward={openForward}
      />

      {selectedAccountInfo && (
        <ComposeModal 
          isOpen={isComposeOpen}
          onClose={handleCloseCompose}
          fromAccount={selectedAccountInfo.email}
          availableAccounts={accounts.map((account) => account.email)}
          initialValues={composePreset}
        />
      )}

      <ShortcutsModal
        isOpen={isShortcutMapOpen}
        onClose={() => setIsShortcutMapOpen(false)}
        groups={shortcutGroups}
      />

      <SettingsModal 
        isOpen={settingsState.isOpen}
        initialTab={settingsState.initialTab}
        initialAction={settingsState.initialAction}
        onClose={() => setSettingsState({ isOpen: false })}
      />
    </div>
  );
};

export default App;
