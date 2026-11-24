"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Theme = "dark" | "light" | "plum" | "lumen";

export const THEMES: { id: Theme; label: string; hint: string }[] = [
  { id: "dark", label: "Noir", hint: "Near-black violet canvas" },
  { id: "light", label: "Paper", hint: "The same purple on white" },
  { id: "plum", label: "Amethyst", hint: "Warm fuchsia-violet" },
  { id: "lumen", label: "Lumen", hint: "The design pass: serif reading, ink on paper" },
];

export const THEME_STORAGE_KEY = "anu.theme";
const DEFAULT_THEME: Theme = "dark";

export function isTheme(value: unknown): value is Theme {
  return value === "dark" || value === "light" || value === "plum" || value === "lumen";
}

/**
 * Runs before first paint so the page never flashes the wrong palette.
 * Inlined into <head> by app/layout.tsx.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t!=="dark"&&t!=="light"&&t!=="plum"&&t!=="lumen")t="${DEFAULT_THEME}";var r=document.documentElement;r.dataset.theme=t;r.style.colorScheme=t==="light"?"light":"dark";}catch(e){}})();`;

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** Cycles Noir → Paper → Amethyst → Noir. */
  cycleTheme: () => void;
  themes: typeof THEMES;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // The inline script already put the right value on <html>; read it so the
  // first render matches what is painted.
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    if (isTheme(current) && current !== theme) setThemeState(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    const root = document.documentElement;
    root.dataset.theme = next;
    root.style.colorScheme = next === "light" ? "light" : "dark";
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* private mode / storage disabled — the theme still applies this session */
    }
  }, []);

  const cycleTheme = useCallback(() => {
    const index = THEMES.findIndex((t) => t.id === theme);
    setTheme(THEMES[(index + 1) % THEMES.length].id);
  }, [theme, setTheme]);

  const value = useMemo(
    () => ({ theme, setTheme, cycleTheme, themes: THEMES }),
    [theme, setTheme, cycleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
