import React, { useEffect, useState } from "react";
import { Folder } from "../../hooks/useMailbox";
import { AccountInfo } from "../../context/AccountContext";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { RefreshCw, Mail, Inbox, Archive, Trash2, Settings, FileText, AlertOctagon, Loader2, FolderPlus, Pencil, X, Keyboard, Sparkles } from "lucide-react";
import { cn } from "../../lib/utils";

interface SidebarProps {
  accounts: AccountInfo[];
  accountIssues?: Record<string, { state: "error"; message?: string }>;
  selectedAccount: string | null;
  onAccountChange: (accountId: string) => void;
  folders: Folder[];
  isFolderLoading: boolean;
  selectedFolderId: string | null;
  onFolderSelect: (id: string) => void;
  onUnifiedInboxSelect: () => void;
  unifiedInboxActive: boolean;
  onSmartInboxSelect: () => void;
  smartInboxActive: boolean;
  smartInboxUnread?: number;
  onSync: () => void;
  isSyncing: boolean;
  mailboxStatus?: { type: "loading" | "success" | "error"; message: string } | null;
  lastSyncAt?: number | null;
  onCompose: () => void;
  onSettings: () => void;
  onShortcuts: () => void;
  onAddAccount: () => void;
  onCreateFolder: (name: string) => Promise<void>;
  onRenameFolder: (folderId: string, newName: string) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  onFolderDrop?: (folderId: string, uids: string[]) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  accounts,
  accountIssues,
  selectedAccount,
  onAccountChange,
  folders,
  isFolderLoading,
  selectedFolderId,
  onFolderSelect,
  onUnifiedInboxSelect,
  unifiedInboxActive,
  onSmartInboxSelect,
  smartInboxActive,
  smartInboxUnread,
  onSync,
  isSyncing,
  mailboxStatus,
  lastSyncAt,
  onCompose,
  onSettings,
  onShortcuts,
  onAddAccount,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onFolderDrop,
}) => {
  const [switchingAccount, setSwitchingAccount] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<"create" | "rename" | null>(null);
  const [dialogValue, setDialogValue] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [dialogFolder, setDialogFolder] = useState<Folder | null>(null);
  const [dialogSaving, setDialogSaving] = useState(false);
  const dragMimeType = "application/x-nexus-mail-uids";

  useEffect(() => {
    if (switchingAccount && selectedAccount === switchingAccount) {
      const timer = setTimeout(() => setSwitchingAccount(null), 500);
      return () => clearTimeout(timer);
    }
  }, [selectedAccount, switchingAccount]);

  const formatLastSync = (timestamp: number) => {
    if (!timestamp) return "";
    const diff = Date.now() - timestamp;
    if (diff < 60 * 1000) return "Just now";
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}m ago`;
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}h ago`;
    return new Date(timestamp).toLocaleString();
  };

  const handleDrop = (event: React.DragEvent, folderId: string) => {
    event.preventDefault();
    setDragOverFolderId(null);
    if (!onFolderDrop) return;
    const payload = event.dataTransfer.getData(dragMimeType);
    if (!payload) return;
    try {
      const uids = JSON.parse(payload);
      if (Array.isArray(uids) && uids.length > 0) {
        onFolderDrop(folderId, uids);
      }
    } catch (e) {
      console.warn("Invalid drag payload", e);
    }
  };

  const openCreateDialog = () => {
    setDialogMode("create");
    setDialogValue("");
    setDialogFolder(null);
    setDialogError(null);
  };

  const openRenameDialog = (folder: Folder) => {
    setDialogMode("rename");
    setDialogValue(folder.name);
    setDialogFolder(folder);
    setDialogError(null);
  };

  const closeDialog = () => {
    if (dialogSaving) return;
    setDialogMode(null);
    setDialogValue("");
    setDialogFolder(null);
    setDialogError(null);
  };

  const handleDialogSubmit = async () => {
    const trimmed = dialogValue.trim();
    if (!trimmed) {
      setDialogError("Folder name cannot be empty");
      return;
    }
    if (dialogMode === "rename" && dialogFolder && trimmed === dialogFolder.name) {
      closeDialog();
      return;
    }
    setDialogSaving(true);
    try {
      if (dialogMode === "create") {
        await onCreateFolder(trimmed);
      } else if (dialogMode === "rename" && dialogFolder) {
        await onRenameFolder(dialogFolder.id, trimmed);
      }
      closeDialog();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setDialogError(message);
    } finally {
      setDialogSaving(false);
    }
  };

  return (
    <aside className="h-full flex flex-shrink-0 bg-nexus-sidebar/90 backdrop-blur-md border-r">
      {/* Account Bar (Spark-style) */}
      <div className="w-16 flex flex-col items-center py-6 gap-4 bg-black/5 border-r border-nexus-border/50 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] shrink-0">
        {accounts.map((acc) => {
          const initials = (acc.display_name ?? acc.email).substring(0, 2).toUpperCase();
          const isActive = selectedAccount === acc.id;
          const isSwitching = switchingAccount === acc.id;
          const issue = accountIssues?.[acc.id];
          const hasIssue = issue?.state === "error";
          return (
            <button
              key={acc.id}
              onClick={() => {
                if (acc.id === selectedAccount) return;
                setSwitchingAccount(acc.id);
                onAccountChange(acc.id);
              }}
              title={acc.email}
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold transition-all duration-200 relative group shadow-sm",
                isActive 
                  ? "bg-nexus-accent text-white scale-110 shadow-nexus-accent/20 ring-2 ring-nexus-accent ring-offset-2 ring-offset-nexus-sidebar" 
                  : "bg-white/10 text-nexus-muted hover:bg-white/20 hover:text-nexus-foreground"
              )}
            >
              {isSwitching ? <Loader2 className="w-4 h-4 animate-spin" /> : initials}
              {/* Active Indicator Dot */}
              {isActive && (
                <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-1 h-4 bg-nexus-accent rounded-r-full" />
              )}
              {hasIssue && (
                <div
                  className="absolute -right-1 -top-1 w-2 h-2 rounded-full bg-red-500"
                  title={issue?.message ?? "Account error"}
                  data-testid={`account-issue-${acc.id}`}
                />
              )}
              {/* Tooltip */}
              <div className="absolute left-14 px-2 py-1 bg-gray-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-xl">
                {acc.email}
              </div>
            </button>
          );
        })}
        
        <button
          onClick={onAddAccount}
          className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 text-nexus-muted hover:bg-white/10 hover:text-nexus-foreground transition-all mt-auto mb-2"
          title="Add Account"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>

        <button
          onClick={onShortcuts}
          className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 text-nexus-muted hover:bg-white/10 hover:text-nexus-foreground transition-all mb-2"
          title="Keyboard shortcuts"
          data-testid="open-shortcuts"
        >
          <Keyboard className="w-5 h-5" />
        </button>

        <button
          onClick={onSettings}
          className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 text-nexus-muted hover:bg-white/10 hover:text-nexus-foreground transition-all"
          title="Settings"
          data-testid="open-settings"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* Main Sidebar Content */}
      <div className="w-64 flex flex-col">
        <div className="p-6 flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">Nexus</h1>
        </div>

        <div className="px-4 mb-4">
          <Button 
            className="w-full justify-center gap-2 bg-nexus-accent hover:bg-nexus-accent/90 text-white shadow-lg shadow-nexus-accent/20" 
            onClick={onCompose}
            variant="primary"
            data-testid="compose-button"
          >
            <Mail className="w-4 h-4" />
            Compose
          </Button>
        </div>

        <div className="px-4 mb-6">
          <Button 
            className="w-full justify-start gap-2" 
            onClick={onSync} 
            disabled={isSyncing}
            variant="secondary"
            data-testid="sync-refresh"
          >
            <RefreshCw className={cn("w-4 h-4", isSyncing && "animate-spin")} />
            {isSyncing ? "Syncing..." : "Refresh"}
          </Button>
        </div>

        {(mailboxStatus || lastSyncAt) && (
          <div className="px-4 mb-4 space-y-1">
            {mailboxStatus && (
              <div
                data-testid="sync-status"
                className={cn(
                  "text-[11px] font-medium",
                  mailboxStatus.type === "error"
                    ? "text-red-500"
                    : mailboxStatus.type === "success"
                      ? "text-emerald-500"
                      : "text-nexus-muted"
                )}
              >
                {mailboxStatus.message}
              </div>
            )}
            {lastSyncAt ? (
              <div data-testid="sync-last-sync" className="text-[10px] text-nexus-muted">
                Last synced {formatLastSync(lastSyncAt)}
              </div>
            ) : null}
          </div>
        )}

        <div className="px-4 mb-4">
          <Button
            className="w-full justify-start gap-2"
            onClick={openCreateDialog}
            variant="secondary"
            data-testid="create-folder"
          >
            <FolderPlus className="w-4 h-4" />
            New folder
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 space-y-1">
          {isFolderLoading && folders.length > 0 && (
            <div className="px-3 py-2 text-[11px] text-nexus-muted">Refreshing folders...</div>
          )}
          {isFolderLoading && folders.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-nexus-muted">Loading folders...</div>
          ) : (
            <>
              <button
                data-testid="unified-inbox-nav"
                onClick={onUnifiedInboxSelect}
                className={cn(
                  "group w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-nexus transition-colors",
                  unifiedInboxActive
                    ? "bg-nexus-primary text-nexus-primary-foreground"
                    : "text-nexus-sidebar-foreground hover:bg-nexus-border/50",
                )}
              >
                <Inbox className="w-4 h-4" />
                <span className="flex-1 text-left truncate">Unified Inbox</span>
              </button>
              <button
                data-testid="smart-inbox-nav"
                onClick={onSmartInboxSelect}
                className={cn(
                  "group w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-nexus transition-colors",
                  smartInboxActive
                    ? "bg-nexus-primary text-nexus-primary-foreground"
                    : "text-nexus-sidebar-foreground hover:bg-nexus-border/50",
                )}
              >
                <Sparkles className="w-4 h-4" />
                <span className="flex-1 text-left truncate">Smart Inbox</span>
                {smartInboxUnread ? (
                  <Badge
                    data-testid="smart-inbox-unread"
                    variant={smartInboxActive ? "secondary" : "primary"}
                    className="px-1.5 min-w-[1.25rem] justify-center"
                  >
                    {smartInboxUnread}
                  </Badge>
                ) : null}
              </button>
              {folders.map((folder) => {
                const Icon = getFolderIcon(folder);
                const displayName = getLocalizedName(folder);
                const folderKey = getFolderKey(folder);
                const isCustomFolder = !folder.system_role;
                return (
                  <button
                    key={folder.id}
                    data-testid={`folder-${folderKey}`}
                    onClick={() => onFolderSelect(folder.id)}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragOverFolderId(folder.id);
                    }}
                    onDragLeave={() => setDragOverFolderId(prev => (prev === folder.id ? null : prev))}
                    onDrop={(event) => handleDrop(event, folder.id)}
                    className={cn(
                      "group w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-nexus transition-colors",
                      selectedFolderId === folder.id && !smartInboxActive && !unifiedInboxActive
                        ? "bg-nexus-primary text-nexus-primary-foreground"
                        : "text-nexus-sidebar-foreground hover:bg-nexus-border/50",
                      dragOverFolderId === folder.id && "bg-nexus-border/70 ring-1 ring-nexus-accent/40"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="flex-1 text-left truncate">{displayName}</span>
                    {isCustomFolder && (
                      <span className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          title="Rename folder"
                          data-testid={`folder-rename-${folder.id}`}
                          className="p-1 rounded hover:bg-nexus-border/60"
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            openRenameDialog(folder);
                          }}
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          title="Delete folder"
                          data-testid={`folder-delete-${folder.id}`}
                          className="p-1 rounded hover:bg-nexus-border/60 text-red-500"
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={async (event) => {
                            event.stopPropagation();
                            if (!confirm(`Delete "${displayName}"?`)) return;
                            try {
                              await onDeleteFolder(folder.id);
                            } catch (e) {
                              const message = e instanceof Error ? e.message : String(e);
                              alert(message);
                            }
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </span>
                    )}
                    {folder.unread_count > 0 && (
                      <Badge 
                        data-testid={`badge-${folderKey}`}
                        variant={selectedFolderId === folder.id ? "secondary" : "primary"}
                        className="px-1.5 min-w-[1.25rem] justify-center"
                      >
                        {folder.unread_count}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </>
          )}
        </nav>
      </div>

      {dialogMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[360px] rounded-nexus bg-nexus-card p-5 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-nexus-foreground">
                {dialogMode === "create" ? "New folder" : "Rename folder"}
              </h3>
              <button
                type="button"
                className="text-nexus-muted hover:text-nexus-foreground"
                onClick={closeDialog}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              data-testid="folder-name-input"
              value={dialogValue}
              onChange={(event) => setDialogValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleDialogSubmit();
                }
              }}
              className="w-full rounded-nexus border border-nexus-border bg-nexus-background px-3 py-2 text-sm focus:border-nexus-primary/50 focus:outline-none"
              placeholder="Folder name"
            />
            {dialogError && (
              <div className="mt-2 text-xs text-red-500">{dialogError}</div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={closeDialog} disabled={dialogSaving}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                data-testid="folder-dialog-confirm"
                onClick={handleDialogSubmit}
                disabled={dialogSaving}
              >
                {dialogMode === "create" ? "Create" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

function getFolderRole(folder: Folder) {
  if (folder.system_role) return folder.system_role.toUpperCase();
  const name = folder.name.toLowerCase();
  if (name.includes("inbox") || name.includes("收件箱")) return "INBOX";
  if (name.includes("sent") || name.includes("已发送")) return "SENT";
  if (name.includes("draft") || name.includes("草稿")) return "DRAFTS";
  if (name.includes("archive") || name.includes("归档")) return "ARCHIVE";
  if (name.includes("spam") || name.includes("junk") || name.includes("垃圾邮件")) return "SPAM";
  if (name.includes("trash") || name.includes("deleted") || name.includes("垃圾箱") || name.includes("已删除")) return "TRASH";
  return null;
}

function getFolderKey(folder: Folder) {
  const role = getFolderRole(folder);
  return (role ?? folder.name).toLowerCase();
}

function getLocalizedName(folder: Folder) {
  const role = getFolderRole(folder);
  if (role === "INBOX") return "收件箱";
  if (role === "SENT") return "已发送";
  if (role === "DRAFTS") return "草稿箱";
  if (role === "TRASH") return "垃圾箱";
  if (role === "SPAM") return "垃圾邮件";
  if (role === "ARCHIVE") return "归档";
  return folder.name;
}

function getFolderIcon(folder: Folder) {
  const role = getFolderRole(folder);
  if (role === "INBOX") return Inbox;
  if (role === "SENT") return Mail;
  if (role === "DRAFTS") return FileText;
  if (role === "TRASH") return Trash2;
  if (role === "SPAM") return AlertOctagon;
  if (role === "ARCHIVE") return Archive;

  const n = folder.name.toLowerCase();
  if (n.includes("inbox")) return Inbox;
  if (n.includes("sent")) return Mail;
  if (n.includes("draft")) return FileText;
  if (n.includes("trash") || n.includes("deleted")) return Trash2;
  if (n.includes("spam") || n.includes("junk")) return AlertOctagon;
  if (n.includes("archive")) return Archive;
  return Mail;
}
