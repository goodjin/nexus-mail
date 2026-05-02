import { useState, useEffect, useCallback } from 'react';
import { invoke } from '../lib/tauri';

export interface AppSettings {
  auto_download_attachments: boolean;
  background_sync_history: boolean;
  theme: 'light' | 'dark' | 'system';
  confirm_before_delete: boolean;
  download_directory: string;
  remote_image_policy: 'always' | 'ask' | 'never';
  search_history_limit: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  auto_download_attachments: false,
  background_sync_history: true,
  theme: 'system',
  confirm_before_delete: true,
  download_directory: '',
  remote_image_policy: 'ask',
  search_history_limit: 10,
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
      const rawSettings = await invoke('get_app_settings') as Partial<AppSettings>;
      const normalizedTheme = rawSettings.theme === 'light' || rawSettings.theme === 'dark' || rawSettings.theme === 'system'
        ? rawSettings.theme
        : DEFAULT_SETTINGS.theme;
      const normalizedRemoteImagePolicy =
        rawSettings.remote_image_policy === 'always'
        || rawSettings.remote_image_policy === 'never'
        || rawSettings.remote_image_policy === 'ask'
          ? rawSettings.remote_image_policy
          : DEFAULT_SETTINGS.remote_image_policy;
      const parsedSettings: AppSettings = {
        auto_download_attachments: rawSettings.auto_download_attachments ?? DEFAULT_SETTINGS.auto_download_attachments,
        background_sync_history: rawSettings.background_sync_history ?? DEFAULT_SETTINGS.background_sync_history,
        theme: normalizedTheme,
        confirm_before_delete: rawSettings.confirm_before_delete ?? DEFAULT_SETTINGS.confirm_before_delete,
        download_directory: rawSettings.download_directory ?? DEFAULT_SETTINGS.download_directory,
        remote_image_policy: normalizedRemoteImagePolicy,
        search_history_limit: rawSettings.search_history_limit ?? DEFAULT_SETTINGS.search_history_limit,
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
      await invoke('update_app_settings', { settings: nextSettings });
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
