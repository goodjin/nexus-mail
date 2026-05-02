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

let cachedSettings: AppSettings = DEFAULT_SETTINGS;
let settingsLoaded = false;
const settingsListeners = new Set<(settings: AppSettings) => void>();

const notifySettings = (next: AppSettings) => {
  cachedSettings = next;
  settingsListeners.forEach(listener => listener(next));
};

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(cachedSettings);
  const [loading, setLoading] = useState(!settingsLoaded);

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
      
      notifySettings(parsedSettings);
      settingsLoaded = true;
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    settingsListeners.add(setSettings);
    return () => {
      settingsListeners.delete(setSettings);
    };
  }, []);

  useEffect(() => {
    if (!settingsLoaded) {
      fetchSettings();
    }
  }, [fetchSettings]);

  const updateSetting = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    try {
      // Optimistic update
      const nextSettings = { ...cachedSettings, [key]: value } as AppSettings;
      notifySettings(nextSettings);
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

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const prefersDark = media?.matches ?? false;
      const shouldUseDark = settings.theme === 'dark' || (settings.theme === 'system' && prefersDark);
      document.documentElement.classList.toggle('dark', shouldUseDark);
    };
    applyTheme();
    if (settings.theme === 'system' && media) {
      media.addEventListener('change', applyTheme);
      return () => media.removeEventListener('change', applyTheme);
    }
    return undefined;
  }, [settings.theme]);

  return { settings, loading, updateSetting, refresh: fetchSettings };
}
