
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
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

interface AccountContextType {
  accounts: AccountInfo[];
  selectedAccount: string | null;
  setSelectedAccount: (email: string | null) => void;
  loading: boolean;
  refreshAccounts: () => Promise<void>;
  updateAccount: (details: AccountInfo) => Promise<void>;
  updatePassword: (email: string, pass: string) => Promise<void>;
}

const AccountContext = createContext<AccountContextType | undefined>(undefined);

export const AccountProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
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
  };

  const updatePassword = async (email: string, password: string) => {
    await invoke('update_account_password', { email, password });
  };

  return (
    <AccountContext.Provider value={{ 
      accounts, 
      selectedAccount, 
      setSelectedAccount, 
      loading, 
      refreshAccounts: fetchAccounts,
      updateAccount,
      updatePassword
    }}>
      {children}
    </AccountContext.Provider>
  );
};

export const useAccountContext = () => {
  const context = useContext(AccountContext);
  if (context === undefined) {
    throw new Error('useAccountContext must be used within an AccountProvider');
  }
  return context;
};
