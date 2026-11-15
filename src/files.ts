import { importMaa } from "./maa";
import { defaultModel, type Ground, type Load, type Model, type Pulse, type Source, type Sweep, type Wire } from "./model";
import { t } from "./i18n";

/** What marks a file of this program. */
const FORMAT = "antenna-modeler";

type Fields = Record<string, unknown>;

const isFields = (value: unknown): value is Fields => typeof value === "object" && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** The numbers of an object under the given names, or `null` if one is missing. */
function numbers<Name extends string>(value: unknown, names: readonly Name[]): Record<Name, number> | null {
  if (!isFields(value)) return null;
  const found = {} as Record<Name, number>;
  for (const name of names) {
    const one = value[name];
    if (!isNumber(one)) return null;
    found[name] = one;
  }
  return found;
}

function pulse(value: unknown): Pulse | null {
  if (!isFields(value)) return null;
  const { wire, place, offset } = value;
  if (!Number.isInteger(wire) || (wire as number) < 0) return null;
  if (place !== "b" && place !== "c" && place !== "e") return null;
  if (offset !== undefined && !Number.isInteger(offset)) return null;
  return offset ? { wire: wire as number, place, offset: offset as number } : { wire: wire as number, place };
}

function source(value: unknown): Source | null {
  if (!isFields(value)) return null;
  const at = pulse(value.at);
  const parts = numbers(value, ["phase", "voltage"] as const);
  return at && parts && { at, ...parts };
}

function load(value: unknown): Load | null {
  if (!isFields(value)) return null;
  const at = pulse(value.at);
  if (!at) return null;
  if (value.kind === "lc") {
    const parts = numbers(value, ["inductance", "capacitance", "q"] as const);
    return parts && { kind: "lc", at, ...parts };
  }
  if (value.kind === "rx") {
    const parts = numbers(value, ["resistance", "reactance"] as const);
    return parts && { kind: "rx", at, ...parts };
  }
  return null;
}

/** A list whose every item is read, or `null` if it is no list or an item is not what it should be. */
function list<Item>(value: unknown, item: (one: unknown) => Item | null): Item[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.map(item);
  return items.every((one) => one !== null) ? (items as Item[]) : null;
}

/**
 * A model from what this program stored or saved. What an older version did
 * not write comes from the example. Returns `null` for anything that is not
 * a model: the page must not break on a damaged store or a foreign file.
 */
export function restoreModel(value: unknown): Model | null {
  if (!isFields(value)) return null;
  const wires = list(value.wires, (one): Wire | null => numbers(one, ["x1", "y1", "z1", "x2", "y2", "z2", "radius", "segments"] as const));
  // Before the second version of the format a model had one source, without a phase or a voltage.
  const legacy = value.sources === undefined ? pulse(value.source) : null;
  const sources = legacy ? [{ at: legacy, phase: 0, voltage: 1 }] : list(value.sources, source);
  const loads = value.loads === undefined ? [] : list(value.loads, load);
  const scalars = numbers({ height: 0, wireConductivity: 0, ...value }, ["frequency", "height", "wireConductivity", "reference"] as const);
  const sweep: Sweep | null = value.sweep === undefined ? defaultModel.sweep : numbers(value.sweep, ["from", "to", "points"] as const);
  const groundValues = numbers(value.ground, ["permittivity", "conductivity"] as const);
  const kind = isFields(value.ground) ? value.ground.kind : undefined;
  if (!wires || !sources || sources.length === 0 || !loads || !scalars || !sweep || !groundValues) return null;
  if (kind !== "free" && kind !== "perfect" && kind !== "real") return null;
  const ground: Ground = { kind, ...groundValues };
  const taperCorrection = typeof value.taperCorrection === "boolean" ? value.taperCorrection : defaultModel.taperCorrection;
  return { name: typeof value.name === "string" ? value.name : "", wires, sources, loads, ...scalars, taperCorrection, ground, sweep };
}

/** The text of a file of this program for a model. */
export function saveModel(model: Model): string {
  return JSON.stringify({ format: FORMAT, version: 2, model }, null, 2) + "\n";
}

export interface Opened {
  model: Model;
  /** What of the file could not be taken over, in the language of the user. */
  notes: string[];
}

/**
 * Reads the text of a file of this program or of MMANA. Throws an error,
 * with a message for the user, when it is neither.
 */
export function openModel(text: string, base: Model): Opened {
  if (/^\s*\{/.test(text)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(t("Файл пошкоджено: це не JSON."));
    }
    const model = isFields(parsed) && parsed.format === FORMAT ? restoreModel(parsed.model) : null;
    if (!model) throw new Error(t("Це не файл моделі цієї програми."));
    return { model, notes: [] };
  }
  return importMaa(text, base);
}

/** The text of a file. Files of MMANA from Windows are not in UTF-8. */
export async function readText(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1251").decode(bytes);
  }
}

/**
 * The bytes of a text in the code page of Windows that MMANA reads Cyrillic
 * names in. A character that the code page lacks becomes a question mark.
 */
export function encodeAnsi(text: string): Uint8Array<ArrayBuffer> {
  const decoder = new TextDecoder("windows-1251");
  const codes = new Map<string, number>();
  for (let byte = 0x80; byte < 0x100; byte++) codes.set(decoder.decode(Uint8Array.of(byte)), byte);
  return Uint8Array.from([...text], (character) => {
    const code = character.codePointAt(0)!;
    return code < 0x80 ? code : (codes.get(character) ?? 0x3f);
  });
}

/** A name for the file of a model: its own name without what a file system refuses. */
export function fileName(model: Model, extension: string): string {
  const name = model.name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${name || "antenna"}.${extension}`;
}

/** Hands a file to the user through the browser. */
export function download(name: string, content: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  // Some browsers begin to read the file a moment after the click.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
