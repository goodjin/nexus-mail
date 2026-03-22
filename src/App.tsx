import React, { useState, useEffect } from "react";
import { useAccounts } from "./hooks/useAccounts";
import { useMailbox, Email } from "./hooks/useMailbox";
import { Sidebar } from "./components/layout/Sidebar";
import { EmailList } from "./components/mail/EmailList";
import { EmailDetail } from "./components/mail/EmailDetail";
import { Badge } from "./components/ui/Badge";
import { ComposeModal } from "./components/mail/ComposeModal";
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
    sync
  } = useMailbox(selectedAccount);

  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
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
        accounts={accounts}
        selectedAccount={selectedAccount}
        onAccountChange={setSelectedAccount}
        folders={folders}
        selectedFolderId={selectedFolderId}
        onFolderSelect={setSelectedFolderId}
        onSync={handleSync}
        isSyncing={syncing}
        onCompose={() => setIsComposeOpen(true)}
      />

      <EmailList 
        emails={emails}
        selectedEmailId={selectedEmail?.uid || null}
        onEmailSelect={setSelectedEmail}
        folderName={currentFolder?.name || "Inbox"}
        isLoading={emailsLoading}
      />

      <EmailDetail 
        email={selectedEmail}
      />

      {selectedAccount && (
        <ComposeModal 
          isOpen={isComposeOpen}
          onClose={() => setIsComposeOpen(false)}
          fromAccount={selectedAccount}
        />
      )}
    </div>
  );
};

export default App;
