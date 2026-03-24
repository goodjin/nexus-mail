import React, { useState, useEffect } from "react";
import { useAccounts } from "./hooks/useAccounts";
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
  } = useAccounts();

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
  
  // Fetch full details when email is selected
  useEffect(() => {
    if (selectedEmail && !selectedEmail.body_html && !selectedEmail.body_text) {
      const getDetails = async () => {
        try {
          const fullEmail = await fetchEmailDetails(selectedEmail.uid);
          setSelectedEmail({ ...selectedEmail, ...fullEmail });
        } catch (e) {
          console.error("Fetch details failed", e);
        }
      };
      getDetails();
    }
  }, [selectedEmail?.uid]);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
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
        onSettings={() => setIsSettingsOpen(true)}
      />

      <EmailList 
        emails={emails}
        selectedEmailId={selectedEmail?.uid || null}
        onEmailSelect={setSelectedEmail}
        folderName={currentFolder?.name || "Inbox"}
        isLoading={emailsLoading}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onDeleteEmails={async (uids) => {
            await deleteEmails(uids);
            if (selectedEmail && uids.includes(selectedEmail.uid)) {
                setSelectedEmail(null);
            }
        }}
        onLoadMore={loadMore}
      />

      <EmailDetail 
        email={selectedEmail}
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
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
};

export default App;
