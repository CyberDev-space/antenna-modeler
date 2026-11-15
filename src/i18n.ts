import { EN } from "./i18n.en";

/*
 * The language of the page. Texts are written in Ukrainian, which is their
 * key; `t` gives them in the language of the page, English from `EN`.
 */

export type Language = "uk" | "en";

const STORAGE_KEY = "antenna-modeler.language";

let current: Language = "uk";

/** The language of the page. */
export const language = (): Language => current;

/** Sets the language of the page and remembers it in the browser. */
export function setLanguage(next: Language): void {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Without storage the choice lasts until the page is closed.
  }
  if (typeof document !== "undefined") document.documentElement.lang = next;
}

/** The language that the page starts in: the one chosen before, else Ukrainian for a Ukrainian browser and English for others. */
export function startingLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "uk" || stored === "en") return stored;
  } catch {
    // No storage: the browser decides.
  }
  const wanted = typeof navigator === "undefined" ? [] : [...(navigator.languages ?? []), navigator.language];
  return wanted.some((one) => one?.toLowerCase().startsWith("uk")) ? "uk" : "en";
}

/** Marks a Ukrainian text that `t` translates where it is shown, for a constant that is made before the language is known. */
export const N = (text: string): string => text;

/**
 * A text in the language of the page. The Ukrainian text is the key, and
 * `{name}` in it stands for a value of `values`.
 */
export function t(text: string, values?: Record<string, string | number>): string {
  const template = current === "en" ? (EN[text] ?? text) : text;
  return values ? template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in values ? String(values[name]) : whole)) : template;
}

/** A number written with the decimal sign of the language: a comma in Ukrainian prose, a point in English. */
export const decimal = (text: string): string => (current === "uk" ? text.replace(".", ",") : text);
