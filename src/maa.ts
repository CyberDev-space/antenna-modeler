import {
  ALUMINIUM,
  COPPER,
  formatPulse,
  parsePulse,
  type GroundKind,
  type LcLoad,
  type Load,
  type Model,
  type Pulse,
  type RxLoad,
  type Source,
  type Wire,
} from "./model";
import { N, t } from "./i18n";

export interface Imported {
  model: Model;
  /** What of the file could not be taken over, in the language of the user. */
  notes: string[];
}

/** The ground that a file gets when it asks for a real one: the file does not hold its parameters. */
const AVERAGE_GROUND = { permittivity: 13, conductivity: 0.005 };

/** The radius, in metres, of a wire whose radius the file gives through a table that is not read. */
const DEFAULT_RADIUS = 0.001;

const GROUNDS: GroundKind[] = ["free", "perfect", "real"];

/** Iron as a conductor, in S/m. Its magnetism, which adds to the loss, is not modelled. */
const IRON = 1e7;

/** The materials of a file by their code: no loss, then wire and pipe of copper, of aluminium and of iron. */
const MATERIALS: [name: string, conductivity: number][] = [
  [N("без втрат"), 0],
  [N("мідь"), COPPER],
  [N("мідь"), COPPER],
  [N("алюміній"), ALUMINIUM],
  [N("алюміній"), ALUMINIUM],
  [N("залізо"), IRON],
  [N("залізо"), IRON],
];

/**
 * A length to the nearest nanometre. MMANA writes the results of its own
 * arithmetic, such as -1.893e-15 for a zero; no antenna needs a finer
 * length than that.
 */
const clean = (metres: number): number => Math.round(metres * 1e9) / 1e9 + 0;

/** The fields of a line of the file: they are separated by commas and tabs. */
const fields = (line: string | undefined): string[] => (line ?? "").split(/[,\t]+/).map((field) => field.trim());

/** `count` numbers of a line of the file, from its field `from`. */
function numbers(line: string | undefined, count: number, what: string, from = 0): number[] {
  const values = fields(line)
    .slice(from, from + count)
    .map((field) => (field === "" ? NaN : Number(field)));
  if (values.length < count || values.some((value) => !Number.isFinite(value))) {
    throw new Error(t("Не вдалося прочитати {what}: «{line}».", { what, line: (line ?? "").trim() }));
  }
  return values;
}

/** A tube of a wire made of tubes: its length and its radius in metres. */
interface Tube {
  length: number;
  radius: number;
}

/**
 * A row of the taper wire set of MMANA. Symmetric tubes start at the centre
 * of a wire, with the centre tube counted once for its whole length and every
 * other tube on both sides; the others start at its beginning. The rest of
 * the wire has the radius `rest`.
 */
interface Taper {
  symmetric: boolean;
  /** The types with an asterisk, `<>*` and `->*`, which the help of MMANA does not explain. */
  starred: boolean;
  tubes: Tube[];
  rest: number;
}

/** The length that MMANA writes for the last tube: the rest of the wire. */
const REST = 99999;

/**
 * Reads a row of the taper wire set: the pointer that a negative radius of a
 * wire names, the type, and pairs of length and radius in metres. The types
 * are 0 for `<>`, 1 for `->`, 2 for `<>*` and 3 for `->*`.
 */
function taperRow(line: string, row: number): [number, Taper] {
  const values = fields(line)
    .filter((field) => field !== "")
    .map(Number);
  if (values.length < 4 || values.some((value) => !Number.isFinite(value))) {
    throw new Error(t("Не вдалося прочитати рядок {row} таблиці труб: «{line}».", { row, line: line.trim() }));
  }
  const [pointer, type] = values;
  if (![0, 1, 2, 3].includes(type)) throw new Error(t("Невідомий тип труб у файлі: {type}.", { type }));
  const tubes: Tube[] = [];
  let rest: number | null = null;
  for (let k = 2; k + 1 < values.length && rest === null; k += 2) {
    const [length, radius] = [values[k], values[k + 1]];
    if (length >= REST) rest = radius;
    // A length of zero makes the tube before it the rest, as MMANA does.
    else if (length <= 0) rest = tubes.pop()?.radius ?? radius;
    else tubes.push({ length, radius });
  }
  rest ??= tubes.pop()!.radius;
  if (!(rest > 0) || tubes.some((tube) => !(tube.radius > 0))) {
    throw new Error(t("Радіуси труб у рядку {row} таблиці труб мають бути більшими за нуль.", { row }));
  }
  return [pointer, { symmetric: type === 0 || type === 2, starred: type >= 2, tubes, rest }];
}

/** The stretches of a wire that its tubes cover: from and to in metres from its beginning, and the radius. */
function tubesAlong(length: number, taper: Taper): { from: number; to: number; radius: number }[] {
  const stretches: { from: number; to: number; radius: number }[] = [];
  // Neighbouring stretches of one radius are one.
  const add = (from: number, to: number, radius: number): void => {
    if (to - from <= 1e-9 * length) return;
    const last = stretches.at(-1);
    if (last && last.radius === radius) last.to = to;
    else stretches.push({ from, to, radius });
  };
  if (!taper.symmetric) {
    let reach = 0;
    for (const tube of taper.tubes) {
      const end = Math.min(length, reach + tube.length);
      add(reach, end, tube.radius);
      reach = end;
    }
    add(reach, length, taper.rest);
    return stretches;
  }
  // One side from the centre outwards; the centre tube gives half its length to each side.
  const half = length / 2;
  const side: { from: number; to: number; radius: number }[] = [];
  let reach = 0;
  taper.tubes.forEach((tube, index) => {
    const end = Math.min(half, reach + (index === 0 ? tube.length / 2 : tube.length));
    if (end > reach) side.push({ from: reach, to: end, radius: tube.radius });
    reach = end;
  });
  if (reach < half) side.push({ from: reach, to: half, radius: taper.rest });
  for (const piece of [...side].reverse()) add(half - piece.to, half - piece.from, piece.radius);
  for (const piece of side) add(half + piece.from, half + piece.to, piece.radius);
  return stretches;
}

/** What a file that is not an antenna file of MMANA is told. */
const notMaa = (): string => t("Це не файл антени MMANA: він має починатися з назви, рядка «*» і частоти, а далі мати розділ дротів.");

/**
 * Reads an antenna file of MMANA (`.maa`). The sweep and whatever else the
 * file does not hold come from `base`. Throws an error, with a message for
 * the user, when the text is not such a file.
 *
 * A file begins with the name, a line with one asterisk and the frequency.
 * Five sections follow in a fixed order: wires, sources, loads, segmentation
 * and the line of the ground. Each begins with a heading that starts with an
 * asterisk. The headings cannot be relied on: MMANA writes them in the
 * language of its interface (`***Wires***`, `* Провода *`), so the sections
 * are told apart by their order.
 */
export function importMaa(text: string, base: Model): Imported {
  const lines = text.split(/\r?\n/);
  const notes: string[] = [];
  const mark = lines.findIndex((line) => line.trim() === "*");
  if (mark < 0) throw new Error(notMaa());
  const name = lines.slice(0, mark).find((line) => line.trim() !== "")?.trim() ?? "";

  // The lines after the mark, one by one; empty lines do not count.
  let at = mark + 1;
  const next = (): string | undefined => {
    while (at < lines.length && lines[at].trim() === "") at++;
    return lines[at++];
  };
  /** Moves past the heading of the next section; `false`, and no move, when the sections have ended. */
  const heading = (): boolean => {
    const from = at;
    if (next()?.trim().startsWith("*")) return true;
    at = from;
    return false;
  };

  const frequencyLine = next();
  if (!heading()) throw new Error(notMaa());
  const [frequency] = numbers(frequencyLine, 1, t("частоту"));
  if (!(frequency > 0)) throw new Error(t("Частота у файлі має бути більшою за нуль."));

  // The wires, the sources and the loads as the file has them, on its own wires.
  const [wireCount] = numbers(next(), 1, t("кількість дротів"));
  const raw = Array.from({ length: wireCount }, (_, i) => numbers(next(), 8, t("дріт {n}", { n: i + 1 })));

  // The sources: their number and a flag, then for each its pulse, its phase in degrees and its voltage.
  const fileSources: { place: string; phase: number; voltage: number }[] = [];
  const [sourceCount] = heading() ? numbers(next(), 1, t("кількість джерел")) : [0];
  for (let i = 0; i < sourceCount; i++) {
    const line = next();
    const [place] = fields(line);
    const [phase, voltage] = numbers(line, 2, t("джерело {n}", { n: i + 1 }), 1);
    fileSources.push({ place: place ?? "", phase, voltage });
  }

  // The loads: their number and whether they are in use, then for each its pulse, its type and the values of that type.
  const fileLoads: { place: string; line: string; index: number; values: Omit<LcLoad, "at"> | Omit<RxLoad, "at"> }[] = [];
  const loadNotes: string[] = [];
  const [loadCount, loadsOn] = heading() ? numbers(next(), 2, t("кількість навантажень")) : [0, 1];
  for (let i = 0; i < loadCount; i++) {
    const line = next() ?? "";
    const [place, type] = fields(line);
    // The types: 0 for a coil and a capacitor, 1 for R + jX, 2 for a polynomial.
    const code = type ? Number(type) : NaN;
    if (code === 0) {
      const [inductance, capacitance, q] = numbers(line, 3, t("навантаження {n}", { n: i + 1 }), 2);
      fileLoads.push({ place, line, index: i, values: { kind: "lc", inductance, capacitance, q } });
    } else if (code === 1) {
      const [resistance, reactance] = numbers(line, 2, t("навантаження {n}", { n: i + 1 }), 2);
      fileLoads.push({ place, line, index: i, values: { kind: "rx", resistance, reactance } });
    } else {
      loadNotes.push(t("Навантаження {n} ({place}) задане многочленом: такі ще не підтримуються, його пропущено.", { n: i + 1, place }));
    }
  }
  if (fileLoads.length > 0 && loadsOn === 0) loadNotes.push(t("У файлі навантаження позначені вимкненими. Тут вони працюють: вилучіть зайві."));

  // The parameters of the segmentation of MMANA: this program has its own.
  if (heading()) next();

  // Ground, height to add, material, impedance of the line, and three values of the plots.
  const groundNotes: string[] = [];
  const [groundCode, height, materialCode, reference] = heading() ? numbers(next(), 4, t("рядок землі")) : [0, 0, 0, base.reference];
  const kind = GROUNDS[groundCode];
  if (!kind) throw new Error(t("Невідомий тип землі у файлі: {code}.", { code: groundCode }));
  if (kind === "real") groundNotes.push(t("Параметри реальної землі у файлі не зберігаються: взято середню землю (ε = 13, σ = 0,005 См/м)."));
  const material = MATERIALS[materialCode];
  if (!material) {
    groundNotes.push(t("Невідомий матеріал дротів у файлі (код {code}): узято дроти без втрат.", { code: materialCode }));
  } else if (material[1] === IRON) {
    groundNotes.push(t("Матеріал дротів у файлі: залізо. Взято провідність 10 МСм/м без магнітних властивостей: справжні втрати більші."));
  } else if (material[1] > 0) {
    groundNotes.push(t("Матеріал дротів у файлі має код {code}: узято {material}.", { code: materialCode, material: t(material[0]) }));
  }

  // The taper wire set: the tubes of the wires whose radius is negative. Its heading starts with $$$.
  const tapers = new Map<number, Taper>();
  for (let i = at; i < lines.length && !lines[i].trim().startsWith("###"); i++) {
    if (!lines[i].trim().startsWith("$$$")) continue;
    at = i + 1;
    const [rowCount] = numbers(next(), 1, t("кількість рядків таблиці труб"));
    for (let row = 1; row <= rowCount; row++) {
      const [pointer, taper] = taperRow(next() ?? "", row);
      // Of two rows with one pointer MMANA takes the first.
      if (!tapers.has(pointer)) tapers.set(pointer, taper);
    }
    break;
  }

  // The wire numbers of the file that a pulse at the centre names: a wire of tubes may need a joint there.
  const centred = new Set(
    [...fileSources, ...fileLoads].flatMap(({ place }) => {
      const parsed = parsePulse(place);
      return parsed && parsed.place === "c" ? [parsed.wire] : [];
    }),
  );

  // The wires of the model: a wire of tubes becomes a wire for every tube, and an insulator is left out.
  const wireNotes: string[] = [];
  const wires: Wire[] = [];
  // For every wire of the file that is kept: its first wire in the model, where its pieces end along it, and its length.
  const kept = new Map<number, { first: number; ends: number[]; length: number; tubes: boolean }>();
  let starred = false;
  raw.forEach(([x1, y1, z1, x2, y2, z2, radius, segments], i) => {
    if (radius === 0) {
      wireNotes.push(t("Дріт {n} має радіус 0 (ізолятор у MMANA): його пропущено.", { n: i + 1 }));
      return;
    }
    const length = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
    const taper = radius < 0 ? tapers.get(radius) : undefined;
    if (radius < 0 && !taper) {
      wireNotes.push(t("Дріт {n} має від'ємний радіус, але рядка для нього в таблиці труб немає: взято радіус {radius} мм.", { n: i + 1, radius: DEFAULT_RADIUS * 1000 }));
    }
    let stretches = taper ? tubesAlong(length, taper) : [{ from: 0, to: length, radius: radius > 0 ? radius : DEFAULT_RADIUS }];
    if (taper && stretches.length > 1) starred ||= taper.starred;
    // A pulse at the centre of a wire whose middle falls inside a tube off its centre sits on a joint made there.
    const middle = length / 2;
    const near = 1e-9 * length;
    const inside = stretches.findIndex((piece) => piece.from < middle - near && piece.to > middle + near);
    if (centred.has(i) && inside >= 0 && Math.abs(stretches[inside].from + stretches[inside].to - length) > near) {
      const piece = stretches[inside];
      stretches = [...stretches.slice(0, inside), { ...piece, to: middle }, { ...piece, from: middle }, ...stretches.slice(inside + 1)];
    }
    const point = (distance: number): number[] =>
      [x1 + ((x2 - x1) * distance) / length, y1 + ((y2 - y1) * distance) / length, z1 + ((z2 - z1) * distance) / length].map(clean);
    const first = wires.length;
    kept.set(i, { first, ends: stretches.map((piece) => piece.to), length, tubes: stretches.length > 1 });
    for (const piece of stretches) {
      const [a, b] = [point(piece.from), point(piece.to)];
      wires.push({
        x1: a[0],
        y1: a[1],
        z1: a[2],
        x2: b[0],
        y2: b[1],
        z2: b[2],
        radius: clean(piece.radius),
        // MMANA has several kinds of automatic segmentation; here there is one. Segments of its own are shared out by length.
        segments: segments > 0 ? Math.max(1, Math.round((segments * (piece.to - piece.from)) / length)) : -1,
      });
    }
    if (stretches.length > 1) {
      wireNotes.push(t("Дріт {n} складено з труб різного радіуса: тут це дроти {first}–{last}, кожна труба окремо.", { n: i + 1, first: first + 1, last: first + stretches.length }));
    }
  });
  if (wires.length === 0) throw new Error(t("У файлі немає жодного дроту."));
  if (starred) wireNotes.push(t("Тип труб зі зірочкою (<>* або ->*) прочитано так само, як без неї: що змінює зірочка, довідка MMANA не пояснює."));

  /**
   * A pulse of the file on the wires of the model, or `null` if it is not one
   * or its wire is gone. On a wire of tubes the beginning and the end are those
   * of its first and last tube, and the centre is that of the tube around the
   * middle, or the joint at the middle.
   */
  const pulseNotes: string[] = [];
  const pulse = (text: string): Pulse | null => {
    const parsed = parsePulse(text);
    const entry = parsed ? kept.get(parsed.wire) : undefined;
    if (!parsed || !entry) return null;
    if (parsed.place === "b") return { ...parsed, wire: entry.first };
    if (parsed.place === "e") return { ...parsed, wire: entry.first + entry.ends.length - 1 };
    const middle = entry.length / 2;
    const joint = entry.ends.findIndex((end) => Math.abs(end - middle) <= 1e-9 * entry.length);
    if (joint < 0) return { ...parsed, wire: entry.first + entry.ends.findIndex((end) => end > middle) };
    if (parsed.offset) pulseNotes.push(t("Зсув у {place} від центру дроту з труб не перенесено: це місце стоїть на стику в центрі.", { place: text.trim() }));
    return { wire: entry.first + joint, place: "e" };
  };

  const sources: Source[] = fileSources.map(({ place, phase, voltage }) => {
    const found = pulse(place);
    if (!found) throw new Error(t("Не вдалося прочитати джерело: «{place}».", { place }));
    return { at: found, phase, voltage };
  });
  const sourceNotes: string[] = [];
  if (sources.length === 0) {
    sourceNotes.push(t("У файлі немає джерела: його поставлено в центр дроту 1."));
    sources.push({ at: { wire: 0, place: "c" }, phase: 0, voltage: 1 });
  }
  const loads: Load[] = fileLoads.map(({ place, line, index, values }) => {
    const found = pulse(place);
    if (!found) throw new Error(t("Не вдалося прочитати навантаження {n}: «{line}».", { n: index + 1, line: line.trim() }));
    return { ...values, at: found };
  });
  notes.push(...wireNotes, ...pulseNotes, ...sourceNotes, ...loadNotes, ...groundNotes);

  // The sweep moves to the new frequency and keeps its width in proportion.
  const scale = frequency / base.frequency;
  const round = (value: number): number => Number(value.toPrecision(4));
  const sweep = { ...base.sweep, from: round(base.sweep.from * scale), to: round(base.sweep.to * scale) };
  const ground = { ...AVERAGE_GROUND, ...(kind === "real" ? {} : base.ground), kind };
  return {
    model: {
      name,
      wires,
      sources,
      loads,
      frequency,
      ground,
      height,
      wireConductivity: material?.[1] ?? 0,
      // MMANA knows no such correction: the choice of the user stays.
      taperCorrection: base.taperCorrection,
      reference: reference > 0 ? reference : base.reference,
      sweep,
    },
    notes,
  };
}

/** A number as MMANA writes it: always with a decimal point. */
const decimal = (value: number): string => (Number.isInteger(value) ? value.toFixed(1) : String(value));

/** The code of the material of a file that is nearest to a conductivity. */
function materialCode(conductivity: number): number {
  if (!(conductivity > 0)) return 0;
  // Wire of copper, of aluminium and of iron.
  const codes = [1, 3, 5];
  const distance = (code: number): number => Math.abs(Math.log(conductivity / MATERIALS[code][1]));
  return codes.reduce((best, code) => (distance(code) < distance(best) ? code : best));
}

/**
 * Writes a model as an antenna file of MMANA (`.maa`). The notes say, in the
 * language of the user, what such a file cannot hold.
 */
export function exportMaa(model: Model): { text: string; notes: string[] } {
  const notes: string[] = [];
  const row = (...values: (string | number)[]): string => values.join(",\t");
  const material = materialCode(model.wireConductivity);
  if (model.wireConductivity > 0 && MATERIALS[material][1] !== model.wireConductivity) {
    notes.push(t("Файл MMANA знає лише готові матеріали: замість вашої провідності записано найближчий, {material}.", { material: t(MATERIALS[material][0]) }));
  }
  if (model.ground.kind === "real") notes.push(t("Параметри реальної землі у файлі MMANA не зберігаються."));
  const lines = [
    model.name.replace(/\s+/g, " ").trim(),
    "*",
    decimal(model.frequency),
    "***Wires***",
    String(model.wires.length),
    ...model.wires.map((wire) =>
      row(...[wire.x1, wire.y1, wire.z1, wire.x2, wire.y2, wire.z2, wire.radius].map(decimal), wire.segments > 0 ? wire.segments : -1),
    ),
    "*** Source ***",
    row(model.sources.length, 1),
    // The phase in degrees and the voltage.
    ...model.sources.map((source) => row(formatPulse(source.at), decimal(source.phase), decimal(source.voltage))),
    "*** Load ***",
    row(model.loads.length, 1),
    ...model.loads.map((load) =>
      load.kind === "lc"
        ? row(formatPulse(load.at), 0, ...[load.inductance, load.capacitance, load.q].map(decimal))
        : row(formatPulse(load.at), 1, ...[load.resistance, load.reactance].map(decimal)),
    ),
    // The parameters of the segmentation of MMANA, as it sets them itself.
    "*** Segmentation ***",
    row(400, 40, "2.0", 1),
    "*** G/H/M/R/AzEl/X ***",
    row(GROUNDS.indexOf(model.ground.kind), decimal(model.height), material, decimal(model.reference), 120, 60, "0.0"),
    "",
  ];
  return { text: lines.join("\r\n"), notes };
}
