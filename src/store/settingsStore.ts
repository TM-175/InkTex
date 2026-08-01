/**
 * Preferences store.
 *
 * Writes are applied to memory synchronously and flushed to disk on a short
 * debounce, so dragging a font-size slider does not produce one file write per
 * pixel.
 */

import { create } from 'zustand';
import type { Settings, SettingsPatch } from '@/types/settings';
import { settingsApi } from '@/tauri';
import {
  DEFAULT_SETTINGS,
  applyTheme,
  normalizeSettings,
  resolveTheme,
} from '@/services/settingsService';
import { debounce } from '@/utils/debounce';

interface SettingsState {
  settings: Settings;
  /** False until the stored preferences have been read from disk. */
  loaded: boolean;

  load: () => Promise<void>;
  update: (patch: SettingsPatch) => void;
  reset: () => void;
  /** Re-evaluate a `system` theme after the OS colour scheme changes. */
  syncSystemTheme: () => void;
}

/** Persist at most once per 400 ms of quiet. */
const persist = debounce((settings: Settings) => {
  void settingsApi.saveStoredSettings(settings).catch(() => {
    // A failed preference write is not worth interrupting the user for; the
    // in-memory value still applies for this session.
  });
}, 400);

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,

  load: async () => {
    try {
      const stored = await settingsApi.getStoredSettings();
      const settings = normalizeSettings(stored);
      set({ settings, loaded: true });
      applyTheme(resolveTheme(settings.theme));
    } catch {
      // Fall back to defaults rather than blocking startup.
      set({ settings: DEFAULT_SETTINGS, loaded: true });
      applyTheme(resolveTheme(DEFAULT_SETTINGS.theme));
    }
  },

  update: (patch) => {
    const settings = { ...get().settings, ...patch };
    set({ settings });

    if (patch.theme !== undefined) {
      applyTheme(resolveTheme(settings.theme));
    }
    persist(settings);
  },

  reset: () => {
    set({ settings: DEFAULT_SETTINGS });
    applyTheme(resolveTheme(DEFAULT_SETTINGS.theme));
    persist(DEFAULT_SETTINGS);
  },

  syncSystemTheme: () => {
    const { theme } = get().settings;
    if (theme === 'system') applyTheme(resolveTheme(theme));
  },
}));

/** Read settings outside React (services, event handlers). */
export function currentSettings(): Settings {
  return useSettingsStore.getState().settings;
}
