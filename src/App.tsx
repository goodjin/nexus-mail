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
    syncing,
    sync,
    fetchEmailDetails,
    deleteEmails,
    toggleFlag,
    markAsRead,
    loadMore,
    searchQuery,
    setSearchQuery
  } = useMailbox(selectedAccount);

  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  
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
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Auto-hide status messages
  useEffect(() => {
    if (statusMsg) {
      const timer = setTimeout(() => setStatusMsg(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [statusMsg]);

  const handleSync = async () => {
    try {
      setStatusMsg("Syncing account...");
      await sync();
      setStatusMsg("Sync completed!");
    } catch (e) {
      setStatusMsg("Sync failed: " + e);
    }
  };

  const currentFolder = folders.find(f => f.id === selectedFolderId);

  return (
    <div className="flex h-screen w-full bg-nexus-background overflow-hidden text-nexus-foreground">
      {/* Toast Notification */}
      {statusMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <Badge className="px-4 py-2 shadow-lg animate-in fade-in slide-in-from-bottom-4">
            {statusMsg}
          </Badge>
        </div>
      )}

      {/* Layers */}
      <Sidebar 
        accounts={accounts.map(a => a.email)}
        selectedAccount={selectedAccount}
        onAccountChange={setSelectedAccount}
        folders={folders}
        selectedFolderId={selectedFolderId}
        onFolderSelect={setSelectedFolderId}
        onSync={handleSync}
        isSyncing={syncing}
        onCompose={() => setIsComposeOpen(true)}
        onSettings={() => setSettingsState({ isOpen: true, initialTab: 'general' })}
        onAddAccount={() => setSettingsState({ isOpen: true, initialTab: 'accounts', initialAction: 'add_account' })}
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
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
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
      />

      {selectedAccount && (
        <ComposeModal 
          isOpen={isComposeOpen}
          onClose={() => setIsComposeOpen(false)}
          fromAccount={selectedAccount}
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
