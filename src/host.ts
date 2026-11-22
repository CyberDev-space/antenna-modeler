import type { Language } from "./i18n";

/*
 * How the page is shown: on its own, or inside another site, which gives it
 * its language and its theme. Such a site holds the page in an iframe with
 * `?embed=1&lang=en&theme=dark`, and when its own theme changes it posts
 * `{ type: "antenna-modeler:theme", theme: "light" }` to the iframe.
 */

export type Theme = "light" | "dark";

const params = new URLSearchParams(typeof location === "undefined" ? "" : location.search);

/** Whether another page holds this one: it is in an iframe, or its address says so. */
export const framed = typeof window !== "undefined" && (window.self !== window.top || params.has("embed"));

const language = params.get("lang");
const theme = params.get("theme");

/** The language and the theme that the address gives, if any. */
export const givenLanguage: Language | null = language === "uk" || language === "en" ? language : null;
export const givenTheme: Theme | null = theme === "light" || theme === "dark" ? theme : null;

/** The site that holds the page chooses its language, or its theme: the page shows no switch of its own for it. */
export const hostLanguage = framed && givenLanguage !== null;
export const hostTheme = framed && givenTheme !== null;

/** A message of the site that holds the page: a new theme or language for it, or `null` for anything else. */
export function hostMessage(data: unknown): { theme: Theme } | { language: Language } | null {
  if (typeof data !== "object" || data === null) return null;
  const { type, theme, language } = data as { type?: unknown; theme?: unknown; language?: unknown };
  if (type === "antenna-modeler:theme" && (theme === "light" || theme === "dark")) return { theme };
  if (type === "antenna-modeler:language" && (language === "uk" || language === "en")) return { language };
  return null;
}

const THEME_KEY = "antenna-modeler.theme";

/** The theme that the user chose before, if any. */
export function storedTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    return null;
  }
}

/** The theme of the system. */
export const systemTheme = (): Theme => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

/** The theme that the page starts in: the one of its address, the one chosen before, else that of the system. */
export const startingTheme = (): Theme => givenTheme ?? storedTheme() ?? systemTheme();

/** Shows the page in a theme. The colours follow at once, before React draws anything anew. */
export function applyTheme(next: Theme): void {
  document.documentElement.dataset.theme = next;
}

/** Remembers the theme that the user chose. */
export function storeTheme(next: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // Without storage the choice lasts until the page is closed.
  }
}
