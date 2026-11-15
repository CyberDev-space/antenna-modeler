import { readdirSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { t } from "./i18n";
import { EN } from "./i18n.en";
import { setLanguage } from "./i18n";

const CYRILLIC = /[А-Яа-яЇїІіЄєҐґ]/;

/** A text that `t` or `N` is given as a string. */
const CALL = /\b[tN]\(\s*"((?:[^"\\]|\\.)*)"/g;

/** The Ukrainian topics of the help are the source of their English ones; the dictionary holds the keys. */
const EXEMPT = new Set(["src/help.ts", "src/help.en.ts", "src/i18n.en.ts"]);

const sources = [
  ...readdirSync("src").map((name) => `src/${name}`),
  ...readdirSync("src/components").map((name) => `src/components/${name}`),
].filter((path) => /\.tsx?$/.test(path) && !path.endsWith(".test.ts") && !EXEMPT.has(path));

const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe("the English interface", () => {
  afterEach(() => setLanguage("uk"));

  it("has an English text for every text of the page, and no Ukrainian text outside t and N", () => {
    const missing: string[] = [];
    const left: string[] = [];
    for (const path of sources) {
      const text = readFileSync(path, "utf8");
      for (const match of text.matchAll(CALL)) {
        const key = JSON.parse(`"${match[1]}"`) as string;
        if (EN[key] === undefined) missing.push(`${path}: ${key}`);
      }
      const rest = text
        .replace(CALL, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      rest.split("\n").forEach((line, index) => {
        if (CYRILLIC.test(line)) left.push(`${path}:${index + 1}: ${line.trim()}`);
      });
    }
    expect(missing).toEqual([]);
    expect(left).toEqual([]);
  });

  it("keeps the same values in a text and in its English", () => {
    for (const [key, value] of Object.entries(EN)) expect(placeholders(value), key).toEqual(placeholders(key));
  });

  it("uses every English text it has", () => {
    const used = new Set(sources.flatMap((path) => [...readFileSync(path, "utf8").matchAll(CALL)].map((match) => JSON.parse(`"${match[1]}"`) as string)));
    expect(Object.keys(EN).filter((key) => !used.has(key))).toEqual([]);
  });

  it("gives a text in the language of the page, with its values", () => {
    expect(t("Дріт {wire} заходить під землю.", { wire: 3 })).toBe("Дріт 3 заходить під землю.");
    setLanguage("en");
    expect(t("Дріт {wire} заходить під землю.", { wire: 3 })).toBe("Wire 3 goes under the ground.");
    // A text without English stays as it is.
    expect(t("такого тексту немає")).toBe("такого тексту немає");
  });
});
