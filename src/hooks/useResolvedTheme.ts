/** The effective light/dark theme, following the OS when set to `system`. */

import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { resolveTheme } from '@/services/settingsService';
import type { ResolvedTheme } from '@/types/settings';

export function useResolvedTheme(): ResolvedTheme {
  const preference = useSettingsStore((state) => state.settings.theme);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(preference));

  useEffect(() => {
    setResolved(resolveTheme(preference));
    if (preference !== 'system') return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => setResolved(resolveTheme('system'));

    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);

  return resolved;
}
