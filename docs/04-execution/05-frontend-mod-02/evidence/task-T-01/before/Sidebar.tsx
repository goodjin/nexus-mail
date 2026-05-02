import React, { useEffect, useState } from "react";
import { Folder } from "../../hooks/useMailbox";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { RefreshCw, Mail, Inbox, Archive, Trash2, Settings, FileText, AlertOctagon, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";

interface SidebarProps {
  accounts: string[];
  selectedAccount: string | null;
  onAccountChange: (account: string) => void;
  folders: Folder[];
  selectedFolderId: string | null;
  onFolderSelect: (id: string) => void;
  onSync: () => void;
  isSyncing: boolean;
  onCompose: () => void;
  onSettings: () => void;
  onAddAccount: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  accounts,
  selectedAccount,
  onAccountChange,
  folders,
  selectedFolderId,
  onFolderSelect,
  onSync,
  isSyncing,
  onCompose,
  onSettings,
  onAddAccount,
}) => {
  const [switchingAccount, setSwitchingAccount] = useState<string | null>(null);

  useEffect(() => {
    if (switchingAccount && selectedAccount === switchingAccount) {
      const timer = setTimeout(() => setSwitchingAccount(null), 500);
      return () => clearTimeout(timer);
    }
  }, [selectedAccount, switchingAccount]);

  return (
    <aside className="h-full flex flex-shrink-0 bg-nexus-sidebar/90 backdrop-blur-md border-r">
      {/* Account Bar (Spark-style) */}
      <div className="w-16 flex flex-col items-center py-6 gap-4 bg-black/5 border-r border-nexus-border/50 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] shrink-0">
        {accounts.map((acc) => {
          const initials = acc.substring(0, 2).toUpperCase();
          const isActive = selectedAccount === acc;
          const isSwitching = switchingAccount === acc;
          return (
            <button
              key={acc}
              onClick={() => {
                if (acc === selectedAccount) return;
                setSwitchingAccount(acc);
                onAccountChange(acc);
              }}
              title={acc}
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
              {/* Tooltip */}
              <div className="absolute left-14 px-2 py-1 bg-gray-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-xl">
                {acc}
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
          onClick={onSettings}
          className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 text-nexus-muted hover:bg-white/10 hover:text-nexus-foreground transition-all"
          title="Settings"
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
          >
            <RefreshCw className={cn("w-4 h-4", isSyncing && "animate-spin")} />
            {isSyncing ? "Syncing..." : "Refresh"}
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 space-y-1">
          {[...folders].sort((a, b) => {
            const getWeight = (f: Folder) => {
              const role = f.system_role?.toUpperCase();
              if (role === "INBOX") return 1;
              if (role === "DRAFTS") return 2;
              if (role === "SENT") return 3;
              if (role === "ARCHIVE") return 4;
              if (role === "SPAM") return 5;
              if (role === "TRASH") return 6;
              return 10;
            };
            const wA = getWeight(a);
            const wB = getWeight(b);
            if (wA !== wB) return wA - wB;
            return a.name.localeCompare(b.name);
          }).map((folder) => {
            const Icon = getFolderIcon(folder);
            const displayName = getLocalizedName(folder);
            return (
              <button
                key={folder.id}
                data-testid={`folder-${folder.name.toLowerCase()}`}
                onClick={() => onFolderSelect(folder.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-nexus transition-colors",
                  selectedFolderId === folder.id 
                    ? "bg-nexus-primary text-nexus-primary-foreground" 
                    : "text-nexus-sidebar-foreground hover:bg-nexus-border/50"
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="flex-1 text-left truncate">{displayName}</span>
                {folder.unread_count > 0 && (
                  <Badge 
                    data-testid={`badge-${folder.name.toLowerCase()}`}
                    variant={selectedFolderId === folder.id ? "secondary" : "primary"}
                    className="px-1.5 min-w-[1.25rem] justify-center"
                  >
                    {folder.unread_count}
                  </Badge>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
};

function getLocalizedName(folder: Folder) {
  const role = folder.system_role?.toUpperCase();
  if (role === "INBOX") return "收件箱";
  if (role === "SENT") return "已发送";
  if (role === "DRAFTS") return "草稿箱";
  if (role === "TRASH") return "已删除";
  if (role === "SPAM") return "垃圾邮件";
  if (role === "ARCHIVE") return "归档";
  return folder.name; // Fallback to server name
}

function getFolderIcon(folder: Folder) {
  const role = folder.system_role?.toUpperCase();
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
