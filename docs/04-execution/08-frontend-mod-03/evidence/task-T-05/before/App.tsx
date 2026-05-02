import React, { useState, useEffect } from "react";
import { useAccountContext } from "./context/AccountContext";
import { useMailbox, Email } from "./hooks/useMailbox";
import { Sidebar } from "./components/layout/Sidebar";
import { EmailList } from "./components/mail/EmailList";
import { EmailDetail } from "./components/mail/EmailDetail";
import { Badge } from "./components/ui/Badge";
import { ComposeModal } from "./components/mail/ComposeModal";
import { SettingsModal } from "./components/settings/SettingsModal";
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
    setSelectedAccount
  } = useAccountContext();

  const {
    folders,
    emails,
    selectedFolderId,
    setSelectedFolderId,
    loading: emailsLoading,
    foldersLoading,
    syncing,
    sync,
    fetchEmailDetails,
    deleteEmails,
    toggleFlag,
    markAsRead,
    loadMore,
    searchQuery,
    setSearchQuery,
    searchFilters,
    setSearchFilters,
    searchHistory,
    clearSearchHistory,
    applyEmailAction,
    moveEmails
  } = useMailbox(selectedAccount);

  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [composePreset, setComposePreset] = useState<ComposePreset | undefined>(undefined);

  useEffect(() => {
    setSelectedEmail(null);
  }, [selectedAccount]);
  
  // Sync selectedEmail with the emails array if it was updated by pre-fetch
  const effectiveEmail = React.useMemo(() => {
    if (!selectedEmail) return null;
    return emails.find(e => e.uid === selectedEmail.uid) || selectedEmail;
  }, [emails, selectedEmail]);
  
  // Fetch full details when email is selected
  useEffect(() => {
    if (effectiveEmail && !effectiveEmail.body_html && !effectiveEmail.body_text) {
      const getDetails = async () => {
        try {
          const fullEmail = await fetchEmailDetails(effectiveEmail.uid);
          setSelectedEmail({ ...effectiveEmail, ...fullEmail });
        } catch (e) {
          console.error("Fetch details failed", e);
        }
      };
      getDetails();
    }
  }, [effectiveEmail?.uid]);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [settingsState, setSettingsState] = useState<{ isOpen: boolean, initialTab?: 'general' | 'accounts', initialAction?: 'add_account' }>({ isOpen: false });
  const [syncStatus, setSyncStatus] = useState<{ type: "loading" | "success" | "error"; message: string } | null>(null);

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

  const handleSync = async () => {
    if (syncing) return;
    try {
      setSyncStatus({ type: "loading", message: "Syncing account..." });
      await sync();
      setSyncStatus({ type: "success", message: "Sync completed!" });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setSyncStatus({ type: "error", message: `Sync failed: ${message}` });
    }
  };

  const currentFolder = folders.find(f => f.id === selectedFolderId);
  const handleFolderDrop = async (folderId: string, uids: string[]) => {
    if (!selectedFolderId || folderId === selectedFolderId) return;
    try {
      await moveEmails(uids, folderId);
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

      {/* Layers */}
        <Sidebar 
        accounts={accounts.map(a => a.email)}
        selectedAccount={selectedAccount}
        onAccountChange={setSelectedAccount}
        folders={folders}
        isFolderLoading={foldersLoading}
        selectedFolderId={selectedFolderId}
        onFolderSelect={setSelectedFolderId}
        onSync={handleSync}
        isSyncing={syncing}
        onCompose={() => {
          setComposePreset(undefined);
          setIsComposeOpen(true);
        }}
        onSettings={() => setSettingsState({ isOpen: true, initialTab: 'general' })}
        onAddAccount={() => setSettingsState({ isOpen: true, initialTab: 'accounts', initialAction: 'add_account' })}
        onFolderDrop={handleFolderDrop}
      />

      <EmailList 
        emails={emails}
        selectedEmailId={effectiveEmail?.uid || null}
        onEmailSelect={(email) => {
          setSelectedEmail(email);
          const isUnread = !email.flags?.includes("\\Seen");
          if (isUnread) {
            markAsRead(email.uid, true);
          }
        }}
        folderName={currentFolder?.name || "Inbox"}
        isLoading={emailsLoading}
        isFolderLoading={foldersLoading}
        hasFolder={Boolean(selectedFolderId)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchFilters={searchFilters}
        onSearchFiltersChange={setSearchFilters}
        searchHistory={searchHistory}
        onClearSearchHistory={clearSearchHistory}
        folders={folders}
        currentFolderId={selectedFolderId}
        onApplyEmailAction={applyEmailAction}
        onMoveEmails={moveEmails}
        onDeleteEmails={async (uids) => {
            await deleteEmails(uids);
            if (effectiveEmail && uids.includes(effectiveEmail.uid)) {
                setSelectedEmail(null);
            }
        }}
        onLoadMore={loadMore}
      />

      <EmailDetail 
        email={effectiveEmail}
        onDelete={async (uid: string) => {
            await deleteEmails([uid]);
            setSelectedEmail(null);
        }}
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
        onReply={(email) => {
          setComposePreset({
            to: email.from,
            subject: withSubjectPrefix("Re: ", email.subject),
            body: buildQuotedBody(email)
          });
          setIsComposeOpen(true);
        }}
        onForward={(email) => {
          setComposePreset({
            subject: withSubjectPrefix("Fwd: ", email.subject),
            body: buildQuotedBody(email)
          });
          setIsComposeOpen(true);
        }}
      />

      {selectedAccount && (
        <ComposeModal 
          isOpen={isComposeOpen}
          onClose={handleCloseCompose}
          fromAccount={selectedAccount}
          initialValues={composePreset}
        />
      )}

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
