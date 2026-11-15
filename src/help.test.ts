import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TOPICS, type Topic } from "./help";
import { TOPICS_EN } from "./help.en";

const topics = Object.entries(TOPICS) as [string, Topic][];

/** Every text of a topic, to check them all alike. */
const texts = (topic: Topic): string[] => [
  topic.title,
  topic.what,
  ...(topic.table ? [topic.table.title, ...topic.table.rows.flat()] : []),
  ...(topic.how ?? []),
  ...(topic.howTitle ? [topic.howTitle] : []),
  ...(topic.affects ? [topic.affects] : []),
  ...(topic.defaults ? [topic.defaults] : []),
];

describe("help", () => {
  it("gives every topic a title and says what it is", () => {
    for (const [key, topic] of topics) {
      expect(topic.title.trim(), key).not.toBe("");
      expect(topic.what.trim(), key).not.toBe("");
    }
  });

  it("has no empty text, and closes every notation it opens", () => {
    for (const [key, topic] of topics) {
      for (const text of texts(topic)) {
        expect(text.trim(), key).not.toBe("");
        expect(text.split("`").length % 2, `${key}: ${text}`).toBe(1);
      }
      if (topic.table) expect(topic.table.rows.length, key).toBeGreaterThan(0);
    }
  });

  it("uses every topic somewhere on the page", () => {
    const sources = ["src/App.tsx", ...readdirSync("src/components").map((name) => `src/components/${name}`)]
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    for (const [key] of topics) expect(sources.includes(`"${key}"`), key).toBe(true);
  });

  it("has every topic in English too, of the same shape and with the same notations", () => {
    const notations = (topic: Topic): string[] => texts(topic).flatMap((text) => text.split("`").filter((_, k) => k % 2 === 1));
    for (const [key, topic] of topics) {
      const english = TOPICS_EN[key as keyof typeof TOPICS_EN];
      expect(english, key).toBeDefined();
      expect(english.table?.rows.length, key).toBe(topic.table?.rows.length);
      expect(english.how?.length, key).toBe(topic.how?.length);
      for (const field of ["howTitle", "affects", "defaults"] as const) expect(english[field] === undefined, `${key}.${field}`).toBe(topic[field] === undefined);
      expect(notations(english), key).toEqual(notations(topic));
      expect(texts(english).some((text) => /[А-Яа-яЇїІіЄєҐґ]/.test(text)), key).toBe(false);
    }
  });
});
