"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";
const ThemeContext = createContext<{ theme: Theme; setTheme: (theme: Theme) => void }>({ theme: "system", setTheme: () => undefined });

// Dark is the primary default (supersedes docs/decisions/0062's light-primary reskin):
// "system" now resolves to dark unconditionally, ignoring the OS's prefers-color-scheme
// -- a first-time visitor always lands on dark regardless of browser/OS setting. The
// explicit toggle is unaffected: a user who picks "light" still gets light, persisted in
// `sentinel-theme` exactly as before. Must stay in lockstep with app/layout.tsx's own
// THEME_INIT_SCRIPT, which makes the identical decision synchronously before this
// component ever mounts.
export function ThemeProvider({ children }: { children: React.ReactNode }) { const [theme, setTheme] = useState<Theme>("system"); useEffect(() => { const saved = window.localStorage.getItem("sentinel-theme") as Theme | null; if (saved === "light" || saved === "dark" || saved === "system") setTheme(saved); }, []); useEffect(() => { const dark = theme !== "light"; document.documentElement.classList.toggle("dark", dark); document.documentElement.classList.toggle("light", !dark); document.documentElement.style.colorScheme = dark ? "dark" : "light"; window.localStorage.setItem("sentinel-theme", theme); }, [theme]); return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>; }
export const useTheme = () => useContext(ThemeContext);
