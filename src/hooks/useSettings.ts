import { useState, useEffect, useCallback } from 'react';
import { invoke } from '../lib/tauri';

export interface AppSettings {
  auto_download_attachments: boolean;
  background_sync_history: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  auto_download_attachments: false,
  background_sync_history: true,
};

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const rawSettings = await invoke('get_settings') as Record<string, string>;
      
      const parsedSettings: AppSettings = {
        auto_download_attachments: rawSettings.auto_download_attachments === 'true',
        background_sync_history: rawSettings.background_sync_history !== 'false', // Default true
      };
      
      setSettings(parsedSettings);
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSetting = async (key: keyof AppSettings, value: boolean) => {
    try {
      // Optimistic update
      setSettings(prev => ({ ...prev, [key]: value }));
      
      await invoke('update_setting', { 
        key, 
        value: value.toString() 
      });
    } catch (error) {
      console.error(`Failed to update setting ${key}:`, error);
      // Rollback on error
      fetchSettings();
    }
  };

  return { settings, loading, updateSetting, refresh: fetchSettings };
}
