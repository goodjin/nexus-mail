import React, { useState, useEffect } from 'react';
import { X, Shield, Download, History, Users, Server, Lock, Globe, CheckCircle2, AlertCircle, Loader2, Sun, Moon, Monitor, Image } from 'lucide-react';
import { Button } from '../ui/Button';
import { useSettings } from '../../hooks/useSettings';
import { useAccountContext, AccountInfo } from '../../context/AccountContext';
import { cn } from '../../lib/utils';
import { invoke } from '../../lib/tauri';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'general' | 'accounts';
  initialAction?: 'add_account';
}

type TabType = 'general' | 'accounts';


export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, initialTab = 'general', initialAction }) => {
  const { settings, updateSetting } = useSettings();
  const { accounts, updateAccount, updatePassword, discoverAccountSettings, refreshAccounts } = useAccountContext();
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  
  // Account Form State
  const [editForm, setEditForm] = useState<AccountInfo | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState<string | null>(null);
  const [discoveryStatus, setDiscoveryStatus] = useState<'idle' | 'discovering' | 'success' | 'error'>('idle');
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [authMethod, setAuthMethod] = useState<'password' | 'oauth'>('password');
  const [refreshStatus, setRefreshStatus] = useState<'idle' | 'refreshing' | 'success' | 'error'>('idle');
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [accountErrorOverride, setAccountErrorOverride] = useState<{ email: string; status: string; last_error?: string } | null>(null);
  const [signatureText, setSignatureText] = useState('');
  const [signatureStatus, setSignatureStatus] = useState<string | null>(null);
  const signatureStorageKey = 'nexus-mail-signatures';

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);

  useEffect(() => {
    if (selectedAccount) {
      setEditForm({ ...selectedAccount });
      setNewPassword('');
      setAuthMethod('password');
    }
  }, [selectedAccountId, selectedAccount]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const setAccountError = (payload: { email: string; status: string; last_error?: string }) => {
      setAccountErrorOverride(payload);
      setEditForm((current) => current && current.email === payload.email ? ({
        ...current,
        status: payload.status,
        last_error: payload.last_error ?? null,
      }) : current);
    };
    (window as any).__nexusMailSetAccountError = setAccountError;
    return () => {
      if ((window as any).__nexusMailSetAccountError === setAccountError) {
        delete (window as any).__nexusMailSetAccountError;
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen || activeTab !== 'accounts' || selectedAccountId || accounts.length === 0) return;
    setSelectedAccountId(accounts[0].id);
  }, [accounts, activeTab, isOpen, selectedAccountId]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      if (initialAction === 'add_account') {
        setSelectedAccountId('new');
        setEditForm({
            id: 'new',
            email: '',
            display_name: 'New Account',
            imap_host: '127.0.0.1',
            imap_port: 993,
            imap_use_tls: true,
            smtp_host: '127.0.0.1',
            smtp_port: 465,
            smtp_use_tls: true,
            sync_enabled: true,
            sync_interval: 15,
            last_sync: null,
            status: 'normal',
            last_error: null,
        });
        setNewPassword('');
        setAuthMethod('password');
      } else {
        setSelectedAccountId(null);
        setEditForm(null);
        setAuthMethod('password');
      }
    }
  }, [isOpen, initialTab, initialAction]);

  if (!isOpen) return null;

  const isNewAccount = selectedAccountId === 'new';
  const isPasswordAuth = authMethod === 'password';
  const hasImapPort = Number.isFinite(editForm?.imap_port);
  const hasSmtpPort = Number.isFinite(editForm?.smtp_port);
  const requiredFieldsMissing = !editForm?.email?.trim()
    || !editForm?.imap_host?.trim()
    || !editForm?.smtp_host?.trim()
    || !hasImapPort
    || !hasSmtpPort
    || (isNewAccount && isPasswordAuth && !newPassword);
  const isSaveDisabled = saveStatus === 'saving' || requiredFieldsMissing;
  const isTestDisabled = testStatus === 'testing' || requiredFieldsMissing;
  const formatAccountError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error ?? '');
    const normalized = message.toLowerCase();
    if (!normalized.trim()) {
      return 'Something went wrong. Please try again.';
    }
    if (normalized.includes('offline')) {
      return 'You are offline. Reconnect to the internet and try again.';
    }
    if (
      normalized.includes('invalid password')
      || normalized.includes('login failed')
      || normalized.includes('authentication')
      || normalized.includes('auth')
    ) {
      return 'Authentication failed. Verify your password or app password and try again.';
    }
    if (normalized.includes('oauth')) {
      return 'OAuth authentication failed. Try signing in again or switch to password auth.';
    }
    if (normalized.includes('imap')) {
      return 'IMAP connection failed. Verify the IMAP host, port, and TLS settings.';
    }
    if (normalized.includes('smtp')) {
      return 'SMTP connection failed. Verify the SMTP host, port, and TLS settings.';
    }
    if (normalized.includes('timeout') || normalized.includes('timed out')) {
      return 'Connection timed out. Verify the server address and network connectivity.';
    }
    if (normalized.includes('certificate') || normalized.includes('ssl') || normalized.includes('tls')) {
      return 'Secure connection failed. Check SSL/TLS settings and ports.';
    }
    if (normalized.includes('not found') || normalized.includes('resolve') || normalized.includes('dns')) {
      return 'Server not found. Check the host name and try again.';
    }
    if (normalized.includes('refused')) {
      return 'Connection refused. Verify the port and firewall settings.';
    }
    if (normalized.includes('missing') || normalized.includes('required')) {
      return 'Missing required settings. Fill in the email, host, and port fields.';
    }
    if (normalized.includes('network')) {
      return 'Network error. Check your connection and try again.';
    }
    if (normalized.includes('connection') || normalized.includes('connect')) {
      return 'Unable to connect. Confirm server address, port, and firewall settings.';
    }
    return message || 'Something went wrong. Please try again.';
  };

  const loadSignature = (email?: string | null) => {
    if (!email || typeof window === 'undefined') return '';
    try {
      const stored = window.localStorage.getItem(signatureStorageKey);
      const parsed = stored ? JSON.parse(stored) : {};
      if (!parsed || typeof parsed !== 'object') return '';
      const signature = (parsed as Record<string, string>)[email];
      return typeof signature === 'string' ? signature : '';
    } catch (error) {
      console.warn('Failed to load signature', error);
      return '';
    }
  };

  const persistSignature = (email: string, value: string) => {
    if (typeof window === 'undefined') return false;
    try {
      const stored = window.localStorage.getItem(signatureStorageKey);
      const parsed = stored ? JSON.parse(stored) : {};
      const next = { ...(parsed && typeof parsed === 'object' ? parsed : {}), [email]: value };
      window.localStorage.setItem(signatureStorageKey, JSON.stringify(next));
      return true;
    } catch (error) {
      console.warn('Failed to persist signature', error);
      return false;
    }
  };

  const accountErrorSource = editForm ?? selectedAccount;
  const effectiveAccountError = accountErrorOverride && accountErrorOverride.email === accountErrorSource?.email
    ? accountErrorOverride
    : accountErrorSource;
  const accountErrorMessage = effectiveAccountError?.last_error
    ? formatAccountError(effectiveAccountError.last_error)
    : effectiveAccountError?.status && effectiveAccountError.status !== 'normal'
      ? `Current status: ${effectiveAccountError.status}`
      : null;
  const accountErrorDetail = effectiveAccountError?.last_error
    && accountErrorMessage
    && accountErrorMessage !== effectiveAccountError.last_error
    ? effectiveAccountError.last_error
    : null;

  useEffect(() => {
    if (!editForm?.email) {
      setSignatureText('');
      setSignatureStatus(null);
      return;
    }
    setSignatureText(loadSignature(editForm.email));
    setSignatureStatus(null);
  }, [editForm?.email]);

  const handleSaveAccount = async () => {
    if (!editForm || isSaveDisabled) return;
    try {
      if (isNewAccount) {
        const exists = accounts.some(
          (account) => account.email.toLowerCase() === editForm.email.toLowerCase()
        );
        if (exists) {
          setSaveStatus('error');
          setSaveError('This email account already exists.');
          return;
        }
      }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setSaveStatus('error');
      setSaveError(formatAccountError('offline'));
      return;
    }
      setSaveStatus('saving');
      setSaveError(null);
      await updateAccount(editForm);
      if (newPassword) {
        await updatePassword(editForm.email, newPassword);
      }
      setSaveStatus('success');
      setSaveError(null);
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (e) {
      console.error('Failed to save account:', e);
      setSaveStatus('error');
      setSaveError(formatAccountError(e));
    }
  };

  const handleTestConnection = async () => {
    if (!editForm || isTestDisabled) return;
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setTestStatus('error');
        setTestError(formatAccountError('offline'));
        return;
      }
      setTestStatus('testing');
      setTestError(null);
      await invoke('test_account_connection', {
        imapHost: editForm.imap_host,
        imapPort: editForm.imap_port,
        imapUseTls: editForm.imap_use_tls,
        smtpHost: editForm.smtp_host,
        smtpPort: editForm.smtp_port,
        smtpUseTls: editForm.smtp_use_tls,
        email: editForm.email,
        password: newPassword || null,
      });
      setTestStatus('success');
      setTestError(null);
      setTimeout(() => setTestStatus('idle'), 3000);
    } catch (e: any) {
      console.error('Failed to test connection:', e);
      setTestStatus('error');
      setTestError(formatAccountError(e));
    }
  };

  const handleAutoDiscover = async () => {
    if (!editForm?.email) return;
    try {
      setDiscoveryStatus('discovering');
      setDiscoveryError(null);
      const result = await discoverAccountSettings(editForm.email);
      const hasResult = Boolean(
        result
        && (result.imap_host || result.smtp_host || result.imap_port || result.smtp_port)
      );
      if (!hasResult) {
        throw new Error('未找到可用配置，请手动填写。');
      }
      setEditForm((current) => current ? ({
        ...current,
        imap_host: result?.imap_host ?? current.imap_host,
        imap_port: result?.imap_port ?? current.imap_port,
        imap_use_tls: result?.imap_use_tls ?? current.imap_use_tls,
        smtp_host: result?.smtp_host ?? current.smtp_host,
        smtp_port: result?.smtp_port ?? current.smtp_port,
        smtp_use_tls: result?.smtp_use_tls ?? current.smtp_use_tls,
      }) : current);
      setDiscoveryStatus('success');
      setTimeout(() => setDiscoveryStatus('idle'), 3000);
    } catch (error) {
      setDiscoveryStatus('error');
      setDiscoveryError(formatAccountError(error));
    }
  };

  const handleRefreshAccount = async () => {
    if (!editForm?.email || isNewAccount) return;
    try {
      setRefreshStatus('refreshing');
      setRefreshError(null);
      await invoke('sync_account', { email: editForm.email });
      await refreshAccounts();
      setEditForm((current) => current ? ({
        ...current,
        last_sync: Date.now(),
      }) : current);
      setRefreshStatus('success');
      setTimeout(() => setRefreshStatus('idle'), 3000);
    } catch (error) {
      setRefreshStatus('error');
      setRefreshError(formatAccountError(error));
    }
  };

  const handleSignatureChange = (value: string) => {
    setSignatureText(value);
    if (!editForm?.email) return;
    const saved = persistSignature(editForm.email, value);
    setSignatureStatus(saved ? 'Signature saved.' : 'Signature save failed.');
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
  const themeOptions = [
    {
      value: 'light' as const,
      label: 'Light',
      description: 'Always use light mode.',
      icon: Sun,
    },
    {
      value: 'dark' as const,
      label: 'Dark',
      description: 'Always use dark mode.',
      icon: Moon,
    },
    {
      value: 'system' as const,
      label: 'System',
      description: 'Match your device appearance.',
      icon: Monitor,
    },
  ];
  const shortcutItems = [
    { label: 'New message', keys: ['⌘/Ctrl', 'N'] },
    { label: 'Search', keys: ['⌘/Ctrl', 'K'] },
    { label: 'Open settings', keys: ['⌘/Ctrl', ','] },
    { label: 'Sync mailbox', keys: ['⌘/Ctrl', 'Shift', 'S'] },
    { label: 'Delete selected message', keys: ['Delete'] },
    { label: 'Archive selected message', keys: ['E'] },
    { label: 'Toggle read status', keys: ['U'] },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" data-testid="settings-modal">
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
                <h3 className="text-sm font-semibold text-nexus-muted uppercase tracking-wider mb-4 px-1">Appearance</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  {themeOptions.map((option) => {
                    const Icon = option.icon;
                    const isActive = settings.theme === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        data-testid={`theme-option-${option.value}`}
                        onClick={() => updateSetting('theme', option.value)}
                        className={cn(
                          "text-left border rounded-xl p-4 transition-all hover:border-nexus-accent",
                          isActive ? "border-nexus-accent bg-nexus-accent/10" : "border-nexus-muted/20"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Icon className={cn("w-4 h-4", isActive ? "text-nexus-accent" : "text-nexus-muted")} />
                          <span className="text-sm font-semibold text-nexus-foreground">{option.label}</span>
                        </div>
                        <p className="text-xs text-nexus-muted mt-2">{option.description}</p>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-nexus-muted uppercase tracking-wider mb-4 px-1">Keyboard Shortcuts</h3>
                <div className="space-y-2">
                  {shortcutItems.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between rounded-lg border border-nexus-muted/20 bg-nexus-muted/5 px-4 py-3"
                    >
                      <span className="text-sm text-nexus-foreground">{item.label}</span>
                      <div className="flex items-center gap-1">
                        {item.keys.map((key) => (
                          <kbd
                            key={`${item.label}-${key}`}
                            className="rounded-md border border-nexus-muted/30 bg-nexus-background px-2 py-1 text-[11px] font-semibold text-nexus-muted"
                          >
                            {key}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

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
                  <div className="flex items-center justify-between rounded-lg border border-nexus-muted/20 bg-nexus-muted/5 px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-nexus-foreground">Search History Limit</div>
                      <div className="text-sm text-nexus-muted">Control how many recent search entries are kept locally.</div>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={settings.search_history_limit}
                      onChange={(e) => updateSetting('search_history_limit', Math.max(1, Math.min(50, Number.parseInt(e.target.value || '10', 10) || 10)))}
                      className="w-20 rounded-lg border border-nexus-muted/20 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 ring-nexus-accent"
                    />
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-nexus-muted uppercase tracking-wider mb-4 px-1">Privacy & Security</h3>
                <div className="space-y-2">
                  <SettingItem
                    icon={AlertCircle}
                    title="Confirm Before Delete"
                    description="Ask for confirmation before moving messages to trash."
                    value={settings.confirm_before_delete}
                    onToggle={(v) => updateSetting('confirm_before_delete', v)}
                  />
                  <div className="rounded-lg border border-nexus-muted/20 bg-nexus-muted/5 px-4 py-3">
                    <div className="flex items-start gap-4">
                      <div className="mt-1 p-2 bg-nexus-accent/10 rounded-lg">
                        <Image className="w-5 h-5 text-nexus-accent" />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-nexus-foreground">Remote Images</div>
                        <div className="text-sm text-nexus-muted">Choose whether tracking images load automatically when reading HTML mail.</div>
                      </div>
                      <select
                        value={settings.remote_image_policy}
                        onChange={(e) => updateSetting('remote_image_policy', e.target.value as 'always' | 'ask' | 'never')}
                        className="rounded-lg border border-nexus-muted/20 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 ring-nexus-accent"
                      >
                        <option value="ask">Ask</option>
                        <option value="always">Always</option>
                        <option value="never">Never</option>
                      </select>
                    </div>
                  </div>
                  <div className="rounded-lg border border-nexus-muted/20 bg-nexus-muted/5 px-4 py-3">
                    <div className="flex items-start gap-4">
                      <div className="mt-1 p-2 bg-nexus-accent/10 rounded-lg">
                        <Download className="w-5 h-5 text-nexus-accent" />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-nexus-foreground">Default Download Directory</div>
                        <div className="text-sm text-nexus-muted">Store the preferred local folder used by attachment downloads.</div>
                      </div>
                      <input
                        value={settings.download_directory}
                        onChange={(e) => updateSetting('download_directory', e.target.value)}
                        placeholder="/Users/you/Downloads"
                        className="w-56 rounded-lg border border-nexus-muted/20 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 ring-nexus-accent"
                      />
                    </div>
                  </div>
                  <div className="p-6 bg-nexus-muted/10 rounded-xl border border-nexus-muted/20">
                    <div className="flex items-center gap-3 mb-2">
                      <Shield className="w-5 h-5 text-green-500" />
                      <span className="font-medium">Data Protection</span>
                    </div>
                    <p className="text-sm text-nexus-muted">
                      Your credentials and local database are encrypted using AES-256-GCM. We never store plain passwords.
                    </p>
                  </div>
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
                      data-testid={`account-item-${acc.email}`}
                      onClick={() => setSelectedAccountId(acc.id)}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-lg text-sm transition-all",
                        selectedAccountId === acc.id ? "bg-nexus-accent text-white shadow-md" : "text-nexus-muted hover:bg-nexus-muted/10"
                      )}
                    >
                      <div className="font-medium truncate">{acc.display_name || acc.email}</div>
                      <div className="flex items-center gap-2">
                        <div className={cn("text-xs truncate", selectedAccountId === acc.id ? "text-white/80" : "text-nexus-muted/60")}>
                          {acc.email}
                        </div>
                        {acc.status !== 'normal' && (
                          <span className={cn(
                            "inline-flex h-2 w-2 rounded-full",
                            selectedAccountId === acc.id ? "bg-white" : "bg-red-500"
                          )} />
                        )}
                      </div>
                    </button>
                  ))}
                  
                  <button
                    onClick={() => {
                      setSelectedAccountId('new');
                        setEditForm({
                            id: 'new',
                            email: '',
                            display_name: 'New Account',
                            imap_host: '127.0.0.1',
                            imap_port: 993,
                            imap_use_tls: true,
                            smtp_host: '127.0.0.1',
                            smtp_port: 465,
                            smtp_use_tls: true,
                            sync_enabled: true,
                            sync_interval: 15,
                            last_sync: null,
                            status: 'normal',
                            last_error: null,
                        });
                        setNewPassword('');
                    }}
                    className={cn(
                        "w-full mt-4 flex items-center justify-center gap-2 px-3 py-3 rounded-lg text-sm font-medium transition-all border border-dashed border-nexus-muted/40",
                        selectedAccountId === 'new' 
                            ? "bg-nexus-accent text-white border-nexus-accent shadow-md" 
                            : "text-nexus-muted hover:bg-nexus-muted/10 hover:text-nexus-foreground"
                    )}
                    data-testid="account-add-new"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Add New Account
                  </button>
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
                      {!isNewAccount && accountErrorMessage && (
                        <div
                          className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                          data-testid="account-error-banner"
                        >
                          <div className="font-semibold">Account requires attention</div>
                          <div className="mt-1">{accountErrorMessage}</div>
                          {accountErrorDetail && (
                            <div className="mt-1 text-xs text-red-600/80">Details: {accountErrorDetail}</div>
                          )}
                        </div>
                      )}
                      
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-nexus-muted uppercase tracking-wider">
                              {selectedAccountId === 'new' ? 'Email Address' : 'Email (Readonly)'}
                            </label>
                            <input 
                              type="email"
                              disabled={selectedAccountId !== 'new'} 
                              value={editForm.email} 
                              onChange={e => setEditForm({...editForm, email: e.target.value})}
                              data-testid="account-email"
                              className={cn(
                                "w-full border p-2 rounded-lg text-sm outline-none",
                                selectedAccountId !== 'new' 
                                  ? "bg-nexus-muted/10 text-nexus-muted opacity-60 cursor-not-allowed"
                                  : "bg-transparent focus:ring-2 ring-nexus-accent"
                              )} 
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-nexus-muted uppercase tracking-wider">Display Name</label>
                            <input 
                              value={editForm.display_name || ''} 
                              onChange={e => setEditForm({...editForm, display_name: e.target.value})}
                              data-testid="account-display-name"
                              className="w-full bg-transparent border p-2 rounded-lg text-sm focus:ring-2 ring-nexus-accent outline-none" 
                            />
                          </div>
                          <div className="space-y-1 col-span-2">
                            <label className="text-xs font-semibold text-nexus-muted uppercase tracking-wider">Auth Method</label>
                            <select
                              value={authMethod}
                              onChange={e => setAuthMethod(e.target.value as 'password' | 'oauth')}
                              data-testid="account-auth-method"
                              className="w-full bg-transparent border p-2 rounded-lg text-sm focus:ring-2 ring-nexus-accent outline-none"
                            >
                              <option value="password">Password</option>
                              <option value="oauth">OAuth2 (Coming Soon)</option>
                            </select>
                            <p className="text-[11px] text-nexus-muted">
                              {authMethod === 'oauth'
                                ? 'OAuth2 flow will be available once discovery is enabled.'
                                : 'Use a dedicated app password if required by your provider.'}
                            </p>
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
                              disabled={!isPasswordAuth}
                              data-testid="account-password"
                              className={cn(
                                "w-full bg-transparent border p-2 pl-10 rounded-lg text-sm focus:ring-2 ring-nexus-accent outline-none",
                                !isPasswordAuth && "opacity-60 cursor-not-allowed"
                              )}
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-nexus-muted uppercase tracking-wider">Signature</label>
                          <textarea
                            rows={3}
                            value={signatureText}
                            onChange={(e) => handleSignatureChange(e.target.value)}
                            data-testid="account-signature"
                            disabled={!editForm.email}
                            placeholder="Add a signature for this account"
                            className={cn(
                              "w-full bg-transparent border p-2 rounded-lg text-sm focus:ring-2 ring-nexus-accent outline-none",
                              !editForm.email && "opacity-60 cursor-not-allowed"
                            )}
                          />
                          <p className="text-[11px] text-nexus-muted">Appended to new messages sent from this account.</p>
                          {signatureStatus && (
                            <p className="text-[11px] text-nexus-muted">{signatureStatus}</p>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <label className="flex items-center gap-2 rounded-lg border border-nexus-muted/20 px-3 py-2 text-sm text-nexus-foreground">
                            <input
                              type="checkbox"
                              checked={editForm.sync_enabled}
                              onChange={e => setEditForm({ ...editForm, sync_enabled: e.target.checked })}
                              className="rounded border-nexus-muted text-nexus-accent focus:ring-0"
                            />
                            Enable background sync
                          </label>
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-nexus-muted uppercase tracking-wider">Sync Interval (min)</label>
                          <input
                            type="number"
                            min={1}
                            max={1440}
                            value={editForm.sync_interval}
                            onChange={e => setEditForm({ ...editForm, sync_interval: Math.max(1, Math.min(1440, Number.parseInt(e.target.value || '15', 10) || 15)) })}
                            data-testid="account-sync-interval"
                            className="w-full bg-transparent border p-2 rounded-lg text-sm focus:ring-2 ring-nexus-accent outline-none"
                          />
                          </div>
                        </div>
                        {!isNewAccount && (
                          <div className="rounded-lg border border-nexus-muted/20 bg-nexus-muted/5 px-4 py-3 text-sm">
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <div className="font-medium text-nexus-foreground">Sync Status</div>
                                <div className="text-nexus-muted">
                                  {editForm.last_sync
                                    ? `Last sync: ${new Date(editForm.last_sync).toLocaleString()}`
                                    : 'No successful sync recorded yet.'}
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleRefreshAccount}
                                disabled={refreshStatus === 'refreshing'}
                                className="border border-nexus-muted/20"
                              >
                                {refreshStatus === 'refreshing' ? 'Refreshing...' : 'Refresh now'}
                              </Button>
                            </div>
                            {refreshStatus === 'error' && refreshError && (
                              <div className="mt-2 text-xs text-red-600">{refreshError}</div>
                            )}
                            {refreshStatus === 'success' && (
                              <div className="mt-2 text-xs text-green-600">Refresh completed. Sync status updated.</div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="text-sm font-bold flex items-center gap-2">
                          <Server className="w-4 h-4 text-nexus-accent" />
                          Server Configuration
                        </h4>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleAutoDiscover}
                          disabled={!editForm?.email || discoveryStatus === 'discovering'}
                          className="px-3 text-xs border border-nexus-muted/20"
                        >
                          {discoveryStatus === 'discovering' ? (
                            <span className="flex items-center gap-2">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Detecting...
                            </span>
                          ) : 'Auto-Discover'}
                        </Button>
                      </div>
                      {discoveryStatus === 'success' && (
                        <div className="text-xs text-green-600 flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Auto-discovery applied. Review and save the settings.
                        </div>
                      )}
                      {discoveryStatus === 'error' && discoveryError && (
                        <div className="text-xs text-red-600 flex items-center gap-2">
                          <AlertCircle className="w-3.5 h-3.5" />
                          {discoveryError}
                        </div>
                      )}
                      
                      <div className="grid grid-cols-3 gap-4 p-4 bg-nexus-muted/10 rounded-xl border">
                        <div className="col-span-2 space-y-1">
                          <label className="text-[10px] font-bold text-nexus-muted uppercase">IMAP Host</label>
                          <input 
                            value={editForm.imap_host}
                            onChange={e => setEditForm({...editForm, imap_host: e.target.value})}
                            data-testid="account-imap-host"
                            className="w-full bg-transparent border p-1 rounded text-sm outline-none" 
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-nexus-muted uppercase">Port</label>
                          <input 
                            type="number"
                            value={editForm.imap_port}
                            onChange={e => setEditForm({...editForm, imap_port: parseInt(e.target.value)})}
                            data-testid="account-imap-port"
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
                            data-testid="account-smtp-host"
                            className="w-full bg-transparent border p-1 rounded text-sm outline-none" 
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-nexus-muted uppercase">Port</label>
                          <input 
                             type="number"
                             value={editForm.smtp_port}
                             onChange={e => setEditForm({...editForm, smtp_port: parseInt(e.target.value)})}
                             data-testid="account-smtp-port"
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

                      <div className="pt-4 flex items-center gap-3 flex-wrap">
                        <Button 
                          variant="primary" 
                          onClick={handleSaveAccount}
                          disabled={isSaveDisabled}
                          className={cn(
                            "px-8",
                            saveStatus === 'success' && "bg-green-600 hover:bg-green-700",
                            saveStatus === 'error' && "bg-red-600 hover:bg-red-700"
                          )}
                          data-testid="account-repair-save"
                        >
                          {saveStatus === 'saving' 
                            ? 'Saving...' 
                            : saveStatus === 'success' 
                              ? 'Saved!' 
                              : saveStatus === 'error'
                                ? 'Retry Save'
                                : selectedAccountId === 'new' ? 'Create Account' : 'Save Changes'}
                        </Button>

                        <Button
                          variant="ghost"
                          onClick={handleTestConnection}
                          disabled={isTestDisabled}
                          className={cn(
                            "px-4 border border-nexus-muted/20 hover:bg-nexus-muted/5 flex items-center gap-2",
                            testStatus === 'success' && "text-green-600 border-green-200 bg-green-50",
                            testStatus === 'error' && "text-red-600 border-red-200 bg-red-50"
                          )}
                          data-testid="account-repair-test"
                        >
                          {testStatus === 'testing' ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : testStatus === 'success' ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : testStatus === 'error' ? (
                            <AlertCircle className="w-4 h-4" />
                          ) : (
                            <Server className="w-4 h-4" />
                          )}
                          {testStatus === 'testing'
                            ? 'Testing...'
                            : testStatus === 'success'
                              ? 'Connection OK'
                              : testStatus === 'error'
                                ? 'Retry Test'
                                : 'Test Connection'}
                        </Button>

                        {saveStatus === 'error' && saveError && (
                          <div className="w-full mt-2 p-3 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600 animate-in fade-in slide-in-from-top-1">
                            <strong>Save Failed:</strong> {saveError}
                            <div className="mt-1 text-[11px] text-red-500">
                              Review the settings and try saving again.
                            </div>
                          </div>
                        )}
                        {saveStatus === 'success' && (
                          <span className="text-xs text-green-600 font-medium">Saved successfully. Refresh to sync the account.</span>
                        )}
                        {requiredFieldsMissing && (
                          <span className="text-xs text-nexus-muted font-medium">
                            Fill in required email and server settings to continue.
                          </span>
                        )}
                        {testStatus === 'success' && (
                          <span className="text-xs text-green-600 font-medium">Connection successful. Save to apply these settings.</span>
                        )}
                        {testStatus === 'error' && testError && (
                          <div className="w-full mt-2 p-3 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600 animate-in fade-in slide-in-from-top-1">
                            <strong>Test Failed:</strong> {testError}
                            <div className="mt-1 text-[11px] text-red-500">
                              Check the host, port, and credentials, then run the test again.
                            </div>
                          </div>
                        )}
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
            Close
          </Button>
        </footer>
      </div>
    </div>
  );
};
