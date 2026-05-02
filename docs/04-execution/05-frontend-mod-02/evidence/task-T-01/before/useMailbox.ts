import { useState, useEffect } from "react";
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
