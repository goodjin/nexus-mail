import { useState, useEffect } from "react";
import { invoke } from "../lib/tauri";

export interface Folder {
  id: string;
  name: string;
  remote_id: string;
  unread_count: number;
}

export interface Email {
  uid: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  body_html?: string;
  body_text?: string;
}

export function useMailbox(accountEmail: string | null) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Fetch folders when account changes
  useEffect(() => {
    if (!accountEmail) {
      setFolders([]);
      setSelectedFolderId(null);
      return;
    }

    const fetchFolders = async () => {
      try {
        const flds: Folder[] = await invoke("get_folders", { accountEmail });
        setFolders(flds);
        if (flds.length > 0 && !selectedFolderId) {
          setSelectedFolderId(flds[0].id);
        }
      } catch (e) {
        console.error("Failed to fetch folders", e);
      }
    };
    fetchFolders();
  }, [accountEmail]);

  // Fetch emails when folder changes
  useEffect(() => {
    if (!selectedFolderId || !accountEmail) {
      setEmails([]);
      return;
    }

    const fetchEmails = async () => {
      setLoading(true);
      try {
        const msgs: Email[] = await invoke("get_emails", { 
          folderId: selectedFolderId, 
          limit: 50, 
          offset: 0 
        });
        setEmails(msgs);
      } catch (e) {
        console.error("Failed to fetch emails", e);
      } finally {
        setLoading(false);
      }
    };
    fetchEmails();
  }, [selectedFolderId, accountEmail]);

  const sync = async () => {
    if (!accountEmail) return;
    setSyncing(true);
    try {
      await invoke("sync_account", { email: accountEmail });
      // Refresh folders and current email list
      const flds: Folder[] = await invoke("get_folders", { accountEmail });
      setFolders(flds);
      
      if (selectedFolderId) {
        const msgs: Email[] = await invoke("get_emails", { 
          folderId: selectedFolderId, 
          limit: 50, 
          offset: 0 
        });
        setEmails(msgs);
      }
    } catch (e) {
      console.error("Sync failed", e);
      throw e;
    } finally {
      setSyncing(false);
    }
  };

  return {
    folders,
    emails,
    selectedFolderId,
    setSelectedFolderId,
    loading,
    syncing,
    sync,
  };
}
