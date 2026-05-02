import React from "react";
import { X } from "lucide-react";
import { Button } from "../ui/Button";

type ShortcutItem = {
  keys: string;
  description: string;
};

export type ShortcutGroup = {
  title: string;
  items: ShortcutItem[];
};

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  groups: ShortcutGroup[];
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose, groups }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div
        className="bg-nexus-card w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200"
        data-testid="shortcut-map"
      >
        <div className="p-4 border-b flex items-center justify-between bg-nexus-sidebar/30">
          <div>
            <h2 className="font-semibold text-nexus-primary">Keyboard shortcuts</h2>
            <p className="text-[11px] text-nexus-muted">Press ? to toggle this panel</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} data-testid="shortcut-map-close">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          {groups.map((group) => (
            <div key={group.title} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-nexus-muted">{group.title}</h3>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <div key={item.description} className="flex items-center justify-between gap-4">
                    <span className="text-sm text-nexus-foreground">{item.description}</span>
                    <span className="rounded-full border border-nexus-border bg-nexus-sidebar/40 px-2.5 py-1 text-[11px] font-mono text-nexus-muted">
                      {item.keys}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 bg-nexus-sidebar/10 flex justify-end">
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
};
