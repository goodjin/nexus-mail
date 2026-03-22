import { useState, useEffect } from "react";
import { invoke } from "../lib/tauri";

export function useAccounts() {
  const [accounts, setAccounts] = useState<string[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchAccounts = async (forceSeed = false) => {
    setLoading(true);
    try {
      let accts: string[] = await invoke("list_accounts");
      if (accts.length === 0) {
        await invoke("dev_seed_data");
        accts = await invoke("list_accounts");
      }
      setAccounts(accts);
      if (accts.length > 0 && !selectedAccount) {
        setSelectedAccount(accts[0]);
      }
    } catch (e) {
      console.error("Failed to fetch accounts", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  return {
    accounts,
    selectedAccount,
    setSelectedAccount,
    loading,
    refresh: fetchAccounts,
  };
}
