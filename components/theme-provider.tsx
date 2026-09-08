"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";
const ThemeContext = createContext<{ theme: Theme; setTheme: (theme: Theme) => void }>({ theme: "system", setTheme: () => undefined });

// Light is the primary default again (docs/decisions/0062's unified warm-theme reskin --
// the inverse of 0057's prior dark-primary direction): "system" resolves to light unless
// the OS explicitly reports a dark preference. Must stay in lockstep with
// app/layout.tsx's own THEME_INIT_SCRIPT, which makes the identical decision
// synchronously before this component ever mounts.
export function ThemeProvider({ children }: { children: React.ReactNode }) { const [theme, setTheme] = useState<Theme>("system"); useEffect(() => { const saved = window.localStorage.getItem("sentinel-theme") as Theme | null; if (saved === "light" || saved === "dark" || saved === "system") setTheme(saved); }, []); useEffect(() => { const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches); document.documentElement.classList.toggle("dark", dark); document.documentElement.classList.toggle("light", !dark); document.documentElement.style.colorScheme = dark ? "dark" : "light"; window.localStorage.setItem("sentinel-theme", theme); }, [theme]); return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>; }
export const useTheme = () => useContext(ThemeContext);
