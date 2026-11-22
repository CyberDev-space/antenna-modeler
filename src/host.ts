import type { Language } from "./i18n";

/*
 * How the program is shown: on a page of its own, or as a component of
 * another site, which gives it its language and its theme. A site built
 * with React renders `AntennaModeler` from `embed.tsx`; any other can hold
 * the page in an iframe with `?embed=1&lang=en&theme=dark` and post
 * `{ type: "antenna-modeler:theme", theme: "light" }` to it when its theme
 * changes.
 */

export type Theme = "light" | "dark";

/** How the program is shown and what the site around it gives it. */
export interface PageOptions {
  /** The language that the site gives: the program shows no list of languages then. */
  language?: Language;
  /** The theme that the site gives: the program shows no switch of the theme then. */
  theme?: Theme;
  /** The language and the theme to start in when no site gives them: those of the address of a page of its own. */
  startLanguage?: Language;
  startTheme?: Theme;
  /**
   * The program is a part of another page: it leaves the title, the language
   * and the theme of the document alone, takes keys only from inside itself
   * and remembers no language or theme of its own.
   */
  embedded?: boolean;
  /** Prints the sheet. Without it the page prints itself, which shows the sheet alone. */
  print?: (sheet: HTMLElement) => void;
  /** The page is in an iframe: the site around it posts its theme and language. */
  listen?: boolean;
}

/** The options of the page on its own, from its address. */
export function pageOptions(): PageOptions {
  const params = new URLSearchParams(location.search);
  const language = params.get("lang");
  const theme = params.get("theme");
  const givenLanguage: Language | undefined = language === "uk" || language === "en" ? language : undefined;
  const givenTheme: Theme | undefined = theme === "light" || theme === "dark" ? theme : undefined;
  // In an iframe the site that holds the page has switches of its own for what it gives.
  const framed = window.self !== window.top || params.has("embed");
  return {
    language: framed ? givenLanguage : undefined,
    theme: framed ? givenTheme : undefined,
    startLanguage: givenLanguage,
    startTheme: givenTheme,
    listen: framed,
  };
}

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

/** The theme that a page of its own starts in: the one chosen before, else that of the system. */
export const startingTheme = (): Theme => storedTheme() ?? systemTheme();

/** Shows the whole document in a theme: on a page of its own, the window behind the program and its scroll bars. */
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
