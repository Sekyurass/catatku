import { useSyncExternalStore } from 'react';

export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** Kunci dan logika yang sama dipakai skrip awal di index.html agar tidak ada kedipan tema. */
const STORAGE_KEY = 'catatku_theme';
const THEME_COLOR = { light: '#0F766E', dark: '#0F172A' } as const;

const listeners = new Set<() => void>();

function systemPrefersDark() {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;
}

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

function apply(preference: ThemePreference) {
  const theme = preference === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : preference;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
}

let current: ThemePreference = 'system';

export function initTheme() {
  current = readPreference();
  apply(current);
  if (typeof window.matchMedia === 'function') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (current === 'system') apply(current);
    });
  }
}

export function setThemePreference(preference: ThemePreference) {
  current = preference;
  try {
    if (preference === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Mode privat bisa menolak localStorage; tema tetap berlaku sampai halaman dimuat ulang.
  }
  apply(preference);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, () => current);
}
