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
  attachments?: {
    id: string;
    filename: string;
    size: number;
    mime_type: string;
  }[];
  flags?: string[];
}

export function useMailbox(accountEmail: string | null) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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
        let msgs: Email[];
        if (searchQuery.trim()) {
           msgs = await invoke("search_emails", { 
            accountEmail: accountEmail,
            query: searchQuery 
          });
        } else {
           msgs = await invoke("get_emails", { 
            folderId: selectedFolderId, 
            limit: 50, 
            offset: 0 
          });
        }
        setEmails(msgs);
      } catch (e) {
        console.error("Failed to fetch emails", e);
      } finally {
        setLoading(false);
      }
    };
    fetchEmails();
  }, [selectedFolderId, accountEmail, searchQuery]);

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

  const fetchEmailDetails = async (emailUid: string): Promise<Email> => {
    if (!accountEmail || !selectedFolderId) throw new Error("Missing context");
    try {
      const details: any = await invoke("get_email_details", {
        accountEmail,
        folderId: selectedFolderId,
        uid: emailUid,
      });
      return {
        uid: emailUid,
        subject: "", // Original summary already has this
        from: "",
        date: "",
        snippet: "",
        body_html: details.body_html,
        body_text: details.body_text,
        attachments: details.attachments,
        flags: details.flags,
      };
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

  const toggleFlag = async (uid: string, currentFlags: string[]) => {
    const isFlagged = currentFlags.includes("\\Flagged");
    const newFlags = isFlagged 
      ? currentFlags.filter(f => f !== "\\Flagged")
      : [...currentFlags, "\\Flagged"];
      
    // Optimistic update
    setEmails(emails.map(e => e.uid === uid ? { ...e, flags: newFlags } : e));
    
    try {
      await invoke("set_flag", {
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
    // Optimistic update
    setEmails(emails.map(e => {
        if (e.uid === uid) {
            const currentFlags = e.flags || [];
            const newFlags = seen 
                ? (currentFlags.includes("\\Seen") ? currentFlags : [...currentFlags, "\\Seen"])
                : currentFlags.filter(f => f !== "\\Seen");
            return { ...e, flags: newFlags };
        }
        return e;
    }));

    try {
      await invoke("set_flag", {
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
    if (loading || !selectedFolderId || !accountEmail || searchQuery) return;
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
    fetchEmailDetails,
    deleteEmails,
    toggleFlag,
    markAsRead,
    loadMore,
    searchQuery,
    setSearchQuery,
  };
}
