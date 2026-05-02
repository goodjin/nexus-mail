import { useState, useEffect, useCallback } from 'react';
import { invoke } from '../lib/tauri';

export interface AppSettings {
  auto_download_attachments: boolean;
  background_sync_history: boolean;
  theme: 'light' | 'dark' | 'system';
}

const DEFAULT_SETTINGS: AppSettings = {
  auto_download_attachments: false,
  background_sync_history: true,
  theme: 'system',
};

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const rawSettings = await invoke('get_settings') as Record<string, string>;
      
      const rawTheme = rawSettings.theme;
      const normalizedTheme = rawTheme === 'light' || rawTheme === 'dark' || rawTheme === 'system'
        ? rawTheme
        : DEFAULT_SETTINGS.theme;
      const parsedSettings: AppSettings = {
        auto_download_attachments: rawSettings.auto_download_attachments === 'true',
        background_sync_history: rawSettings.background_sync_history !== 'false', // Default true
        theme: normalizedTheme,
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

  const updateSetting = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    try {
      // Optimistic update
      setSettings(prev => ({ ...prev, [key]: value }));
      const serializedValue = typeof value === 'boolean' ? value.toString() : value;
      
      await invoke('update_setting', { 
        key, 
        value: serializedValue 
      });
    } catch (error) {
      console.error(`Failed to update setting ${key}:`, error);
      // Rollback on error
      fetchSettings();
    }
  };

  return { settings, loading, updateSetting, refresh: fetchSettings };
}
