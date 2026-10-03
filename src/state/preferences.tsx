/* eslint-disable react-refresh/only-export-components -- provider y hook forman una única API de contexto */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/** Preferencias de interfaz del navegador actual. No forman parte de los proyectos ni se exportan. */
export interface Preferences {
  theme: 'system' | 'light' | 'dark';
  treeWidth: number;
  treeCollapsed: boolean;
  inspectorWidth: number;
  typeListWidth: number;
}

const PREFERENCES_KEY = 'nodaria_ui_v1';
export const PANEL_LIMITS = { min: 220, max: 560 } as const;

const DEFAULTS: Preferences = {
  theme: 'system',
  treeWidth: 300,
  treeCollapsed: false,
  inspectorWidth: 360,
  typeListWidth: 270,
};

function loadPreferences(): Preferences {
  try {
    const stored = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? '{}');
    return { ...DEFAULTS, ...stored };
  } catch {
    return DEFAULTS;
  }
}

interface PreferencesContextValue {
  preferences: Preferences;
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
}

const Context = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(loadPreferences);

  useEffect(() => {
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    } catch {
      // Sin almacenamiento disponible: las preferencias duran lo que la sesión.
    }
  }, [preferences]);

  useEffect(() => {
    const root = document.documentElement;
    if (preferences.theme === 'system') root.removeAttribute('data-theme');
    else root.dataset.theme = preferences.theme;
  }, [preferences.theme]);

  const setPreference = useCallback(
    <K extends keyof Preferences>(key: K, value: Preferences[K]) => setPreferences(p => ({ ...p, [key]: value })),
    [],
  );
  const value = useMemo(() => ({ preferences, setPreference }), [preferences, setPreference]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePreferences() {
  const value = useContext(Context);
  if (!value) throw new Error('usePreferences debe usarse dentro de PreferencesProvider');
  return value;
}

export const clampPanel = (width: number) => Math.round(Math.min(PANEL_LIMITS.max, Math.max(PANEL_LIMITS.min, width)));
