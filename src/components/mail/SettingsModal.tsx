import { X, Shield, Trash2, Database } from 'lucide-react';
import { Button } from "../ui/Button";
import { invoke } from "../../lib/tauri";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-nexus-card w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
        <div className="p-4 border-b flex items-center justify-between bg-nexus-sidebar/30">
          <h2 className="font-semibold text-nexus-primary">Settings</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>
        
        <div className="p-6 space-y-6">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-nexus-muted mb-3 flex items-center gap-2">
              <Shield className="w-3 h-3" /> Security
            </h3>
            <div className="space-y-2">
              <p className="text-sm text-nexus-foreground">Encryption Mode</p>
              <p className="text-xs text-nexus-muted">AES-256-GCM (Hardware Accelerated)</p>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-nexus-muted mb-3 flex items-center gap-2">
              <Database className="w-3 h-3" /> Data Management
            </h3>
            <Button 
                variant="secondary" 
                className="w-full justify-start text-red-500 hover:text-red-600 hover:bg-red-500/10"
                onClick={() => {
                  if (confirm("Are you sure you want to clear all data? This will reset the app.")) {
                    invoke("reset_database").then(() => window.location.reload());
                  }
                }}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear Local Cache & Reset Data
            </Button>
          </section>

          <section>
            <p className="text-[10px] text-nexus-muted text-center pt-4 border-t">
              Nexus Mail v0.1.0-alpha • Modern Desktop Client
            </p>
          </section>
        </div>

        <div className="p-4 bg-nexus-sidebar/10 flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
};
