import React from "react";
import { Folder } from "../../hooks/useMailbox";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { RefreshCw, Mail, Inbox, Archive, Trash2, Settings } from "lucide-react";
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
}) => {
  return (
    <aside className="h-full w-64 flex-shrink-0 flex flex-col border-r bg-nexus-sidebar/80 backdrop-blur-md">
      <div className="p-6 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Nexus</h1>
        <Button variant="ghost" size="icon" onClick={() => alert("Settings modal is coming soon!")}>
          <Settings className="w-5 h-5 text-nexus-muted" />
        </Button>
      </div>

      <div className="px-4 mb-6">
        <div className="relative">
          <select 
            value={selectedAccount || ""} 
            onChange={(e) => onAccountChange(e.target.value)}
            className="w-full bg-nexus-background border-none rounded-nexus px-3 py-2 text-sm shadow-sm ring-1 ring-nexus-border focus:ring-nexus-primary outline-none appearance-none"
          >
            {accounts.map((acc) => (
              <option key={acc} value={acc}>{acc}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="px-4 mb-4">
        <Button 
          className="w-full justify-center gap-2 bg-nexus-accent hover:bg-nexus-accent/90 text-white shadow-lg shadow-nexus-accent/20" 
          onClick={onCompose}
          variant="primary"
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
        {folders.map((folder) => {
          const Icon = getFolderIcon(folder.name);
          return (
            <button
              key={folder.id}
              onClick={() => onFolderSelect(folder.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-nexus transition-colors",
                selectedFolderId === folder.id 
                  ? "bg-nexus-primary text-nexus-primary-foreground" 
                  : "text-nexus-sidebar-foreground hover:bg-nexus-border/50"
              )}
            >
              <Icon className="w-4 h-4" />
              <span className="flex-1 text-left truncate">{folder.name}</span>
              {folder.unread_count > 0 && (
                <Badge 
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
    </aside>
  );
};

function getFolderIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes("inbox")) return Inbox;
  if (n.includes("sent")) return Mail;
  if (n.includes("archive")) return Archive;
  if (n.includes("trash")) return Trash2;
  return Mail;
}
