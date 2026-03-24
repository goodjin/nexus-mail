import React, { useState } from 'react';
import { X, Shield, Download, History, Users, Server, Lock, Globe } from 'lucide-react';
import { Button } from '../ui/Button';
import { useSettings } from '../../hooks/useSettings';
import { useAccounts, AccountInfo } from '../../hooks/useAccounts';
import { cn } from '../../lib/utils';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'general' | 'accounts';

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { settings, updateSetting } = useSettings();
  const { accounts, updateAccount, updatePassword } = useAccounts();
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  
  // Account Form State
  const [editForm, setEditForm] = useState<AccountInfo | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);

  React.useEffect(() => {
    if (selectedAccount) {
      setEditForm({ ...selectedAccount });
      setNewPassword('');
    }
  }, [selectedAccountId, selectedAccount]);

  if (!isOpen) return null;

  const handleSaveAccount = async () => {
    if (!editForm) return;
    try {
      setSaveStatus('saving');
      await updateAccount(editForm);
      if (newPassword) {
        await updatePassword(editForm.email, newPassword);
      }
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (e) {
      setSaveStatus('error');
    }
  };

  const SettingItem = ({ 
    icon: Icon, 
    title, 
    description, 
    value, 
    onToggle 
  }: { 
    icon: any, 
    title: string, 
    description: string, 
    value: boolean, 
    onToggle: (v: boolean) => void 
  }) => (
    <div className="flex items-center justify-between p-4 hover:bg-nexus-muted/10 rounded-lg transition-colors">
      <div className="flex items-start gap-4">
        <div className="mt-1 p-2 bg-nexus-accent/10 rounded-lg">
          <Icon className="w-5 h-5 text-nexus-accent" />
        </div>
        <div>
          <div className="font-medium text-nexus-foreground">{title}</div>
          <div className="text-sm text-nexus-muted max-w-sm">{description}</div>
        </div>
      </div>
      <button 
        onClick={() => onToggle(!value)}
        className={cn(
          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
          value ? "bg-nexus-accent" : "bg-nexus-muted/30"
        )}
      >
        <span className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
          value ? "translate-x-6" : "translate-x-1"
        )} />
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-nexus-background w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[80vh]">
        <header className="p-6 border-b flex justify-between items-center bg-nexus-muted/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-nexus-accent rounded-xl">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-nexus-foreground">Settings</h2>
              <div className="flex gap-4 mt-2">
                <button 
                  onClick={() => setActiveTab('general')}
                  className={cn(
                    "text-sm font-medium transition-colors pb-1 border-b-2",
                    activeTab === 'general' ? "border-nexus-accent text-nexus-accent" : "border-transparent text-nexus-muted hover:text-nexus-foreground"
                  )}
                >
                  General
                </button>
                <button 
                  onClick={() => setActiveTab('accounts')}
                  className={cn(
                    "text-sm font-medium transition-colors pb-1 border-b-2",
                    activeTab === 'accounts' ? "border-nexus-accent text-nexus-accent" : "border-transparent text-nexus-muted hover:text-nexus-foreground"
                  )}
                >
                  Accounts
                </button>
              </div>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="w-5 h-5" />
          </Button>
        </header>

        <div className="flex-1 overflow-hidden flex">
          {activeTab === 'general' && (
            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              <section>
                <h3 className="text-sm font-semibold text-nexus-muted uppercase tracking-wider mb-4 px-1">Performance & Sync</h3>
                <div className="space-y-2">
                  <SettingItem 
                    icon={History}
                    title="Background History Sync"
                    description="Automatically download older emails in the background for offline access."
                    value={settings.background_sync_history}
                    onToggle={(v) => updateSetting('background_sync_history', v)}
                  />
                  <SettingItem 
                    icon={Download}
                    title="Auto-download Attachments"
                    description="Automatically fetch attachments when viewing an email."
                    value={settings.auto_download_attachments}
                    onToggle={(v) => updateSetting('auto_download_attachments', v)}
                  />
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-nexus-muted uppercase tracking-wider mb-4 px-1">Privacy & Security</h3>
                <div className="p-6 bg-nexus-muted/10 rounded-xl border border-nexus-muted/20">
                  <div className="flex items-center gap-3 mb-2">
                    <Shield className="w-5 h-5 text-green-500" />
                    <span className="font-medium">Data Protection</span>
                  </div>
                  <p className="text-sm text-nexus-muted">
                    Your credentials and local database are encrypted using AES-256-GCM. We never store plain passwords.
                  </p>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'accounts' && (
            <div className="flex-1 flex overflow-hidden">
              {/* Account List Sidebar */}
              <div className="w-64 border-r bg-nexus-muted/5 overflow-y-auto shrink-0">
                <div className="p-4 space-y-1">
                  {accounts.map(acc => (
                    <button
                      key={acc.id}
                      onClick={() => setSelectedAccountId(acc.id)}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-lg text-sm transition-all",
                        selectedAccountId === acc.id ? "bg-nexus-accent text-white shadow-md" : "text-nexus-muted hover:bg-nexus-muted/10"
                      )}
                    >
                      <div className="font-medium truncate">{acc.display_name || acc.email}</div>
                      <div className={cn("text-xs truncate", selectedAccountId === acc.id ? "text-white/80" : "text-nexus-muted/60")}>
                        {acc.email}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Account Detail Form */}
              <div className="flex-1 overflow-y-auto p-8">
                {editForm ? (
                  <div className="max-w-xl space-y-8">
                    <div>
                      <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                        <Users className="w-5 h-5 text-nexus-accent" />
                        Account Details
                      </h3>
                      
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-nexus-muted uppercase tracking-wider">Email (Readonly)</label>
                            <input disabled value={editForm.email} className="w-full bg-nexus-muted/10 border p-2 rounded-lg text-nexus-muted text-sm opacity-60 cursor-not-allowed" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-nexus-muted uppercase tracking-wider">Display Name</label>
                            <input 
                              value={editForm.display_name || ''} 
                              onChange={e => setEditForm({...editForm, display_name: e.target.value})}
                              className="w-full bg-transparent border p-2 rounded-lg text-sm focus:ring-2 ring-nexus-accent outline-none" 
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-nexus-muted uppercase tracking-wider">Password</label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-2.5 w-4 h-4 text-nexus-muted" />
                            <input 
                              type="password" 
                              placeholder="Leave blank to keep current"
                              value={newPassword}
                              onChange={e => setNewPassword(e.target.value)}
                              className="w-full bg-transparent border p-2 pl-10 rounded-lg text-sm focus:ring-2 ring-nexus-accent outline-none" 
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-sm font-bold flex items-center gap-2">
                        <Server className="w-4 h-4 text-nexus-accent" />
                        Server Configuration
                      </h4>
                      
                      <div className="grid grid-cols-3 gap-4 p-4 bg-nexus-muted/10 rounded-xl border">
                        <div className="col-span-2 space-y-1">
                          <label className="text-[10px] font-bold text-nexus-muted uppercase">IMAP Host</label>
                          <input 
                            value={editForm.imap_host}
                            onChange={e => setEditForm({...editForm, imap_host: e.target.value})}
                            className="w-full bg-transparent border p-1 rounded text-sm outline-none" 
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-nexus-muted uppercase">Port</label>
                          <input 
                            type="number"
                            value={editForm.imap_port}
                            onChange={e => setEditForm({...editForm, imap_port: parseInt(e.target.value)})}
                            className="w-full bg-transparent border p-1 rounded text-sm outline-none" 
                          />
                        </div>
                        <label className="col-span-3 flex items-center gap-2 cursor-pointer mt-1">
                          <input 
                            type="checkbox" 
                            checked={editForm.imap_use_tls}
                            onChange={e => setEditForm({...editForm, imap_use_tls: e.target.checked})}
                            className="rounded border-nexus-muted text-nexus-accent focus:ring-0" 
                          />
                          <span className="text-xs font-medium text-nexus-muted">Use SSL/TLS for IMAP</span>
                        </label>
                      </div>

                      <div className="grid grid-cols-3 gap-4 p-4 bg-nexus-muted/10 rounded-xl border">
                        <div className="col-span-2 space-y-1">
                          <label className="text-[10px] font-bold text-nexus-muted uppercase">SMTP Host</label>
                          <input 
                            value={editForm.smtp_host}
                            onChange={e => setEditForm({...editForm, smtp_host: e.target.value})}
                            className="w-full bg-transparent border p-1 rounded text-sm outline-none" 
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-nexus-muted uppercase">Port</label>
                          <input 
                             type="number"
                             value={editForm.smtp_port}
                             onChange={e => setEditForm({...editForm, smtp_port: parseInt(e.target.value)})}
                             className="w-full bg-transparent border p-1 rounded text-sm outline-none"
                          />
                        </div>
                        <label className="col-span-3 flex items-center gap-2 cursor-pointer mt-1">
                          <input 
                            type="checkbox" 
                            checked={editForm.smtp_use_tls}
                            onChange={e => setEditForm({...editForm, smtp_use_tls: e.target.checked})}
                            className="rounded border-nexus-muted text-nexus-accent focus:ring-0" 
                          />
                          <span className="text-xs font-medium text-nexus-muted">Use SSL/TLS for SMTP</span>
                        </label>
                      </div>
                    </div>

                    <div className="pt-4 flex items-center gap-4">
                      <Button 
                        variant="primary" 
                        onClick={handleSaveAccount}
                        disabled={saveStatus === 'saving'}
                        className={cn("px-8", saveStatus === 'success' && "bg-green-600 hover:bg-green-700")}
                      >
                        {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'success' ? 'Saved!' : 'Save Changes'}
                      </Button>
                      {saveStatus === 'error' && <span className="text-xs text-red-500 font-medium">Failed to save. Check your input.</span>}
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-nexus-muted space-y-4">
                    <div className="p-6 bg-nexus-muted/10 rounded-full">
                      <Globe className="w-12 h-12" />
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-nexus-foreground text-lg">Manage Accounts</p>
                      <p className="text-sm">Select an account from the sidebar locally to check and edit settings.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <footer className="p-6 border-t bg-nexus-muted/5 flex justify-end shrink-0">
          <Button onClick={onClose} variant="ghost" className="px-8 hover:bg-nexus-muted/10">
            Cancel
          </Button>
          <Button onClick={onClose} variant="primary" className="px-8 bg-nexus-accent hover:bg-nexus-accent/90 ml-3">
            Done
          </Button>
        </footer>
      </div>
    </div>
  );
};
