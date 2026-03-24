import { useState, useEffect, useCallback } from 'react';
import { invoke } from '../lib/tauri';

export interface AccountInfo {
  id: string;
  email: string;
  display_name: string | null;
  imap_host: string;
  imap_port: number;
  imap_use_tls: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_use_tls: boolean;
}

export function useAccounts() {
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAccounts = useCallback(async () => {
    try {
      setLoading(true);
      const data = await invoke('get_accounts_detailed') as AccountInfo[];
      setAccounts(data);
      if (data.length > 0 && !selectedAccount) {
        setSelectedAccount(data[0].email);
      }
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedAccount]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const updateAccount = async (details: AccountInfo) => {
    try {
      await invoke('update_account_details', {
        email: details.email,
        displayName: details.display_name,
        imapHost: details.imap_host,
        imapPort: details.imap_port,
        imapUseTls: details.imap_use_tls,
        smtpHost: details.smtp_host,
        smtpPort: details.smtp_port,
        smtpUseTls: details.smtp_use_tls,
      });
      await fetchAccounts();
    } catch (error) {
      console.error('Failed to update account:', error);
      throw error;
    }
  };

  const updatePassword = async (email: string, password: string) => {
    try {
      await invoke('update_account_password', { email, password });
    } catch (error) {
      console.error('Failed to update password:', error);
      throw error;
    }
  };

  return { 
    accounts, 
    selectedAccount, 
    setSelectedAccount, 
    loading, 
    updateAccount, 
    updatePassword, 
    refresh: fetchAccounts 
  };
}
