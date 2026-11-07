import {
  ALUMINIUM,
  COPPER,
  formatPulse,
  parsePulse,
  type GroundKind,
  type Load,
  type Model,
  type Pulse,
  type Wire,
} from "./model";

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
  ["без втрат", 0],
  ["мідь", COPPER],
  ["мідь", COPPER],
  ["алюміній", ALUMINIUM],
  ["алюміній", ALUMINIUM],
  ["залізо", IRON],
  ["залізо", IRON],
];

/** The fields of a line of the file: they are separated by commas and tabs. */
const fields = (line: string | undefined): string[] => (line ?? "").split(/[,\t]+/).map((field) => field.trim());

/** `count` numbers of a line of the file, from its field `from`. */
function numbers(line: string | undefined, count: number, what: string, from = 0): number[] {
  const values = fields(line)
    .slice(from, from + count)
    .map((field) => (field === "" ? NaN : Number(field)));
  if (values.length < count || values.some((value) => !Number.isFinite(value))) {
    throw new Error(`Не вдалося прочитати ${what}: «${(line ?? "").trim()}».`);
  }
  return values;
}

/** What a file that is not an antenna file of MMANA is told. */
const NOT_MAA = "Це не файл антени MMANA: він має починатися з назви, рядка «*» і частоти, а далі мати розділ дротів.";

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
  if (mark < 0) throw new Error(NOT_MAA);
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
  if (!heading()) throw new Error(NOT_MAA);
  const [frequency] = numbers(frequencyLine, 1, "частоту");
  if (!(frequency > 0)) throw new Error("Частота у файлі має бути більшою за нуль.");

  const [wireCount] = numbers(next(), 1, "кількість дротів");
  const wires: Wire[] = [];
  // The wires of the file that are kept, by their number in the file.
  const kept = new Map<number, number>();
  for (let i = 0; i < wireCount; i++) {
    const [x1, y1, z1, x2, y2, z2, radius, segments] = numbers(next(), 8, `дріт ${i + 1}`);
    if (radius === 0) {
      notes.push(`Дріт ${i + 1} має радіус 0 (ізолятор у MMANA): його пропущено.`);
      continue;
    }
    if (radius < 0) {
      notes.push(
        `Дріт ${i + 1} складено з труб різного радіуса. Такі дроти ще не підтримуються: взято радіус ${DEFAULT_RADIUS * 1000} мм, тож результат буде іншим, ніж у MMANA.`,
      );
    }
    kept.set(i, wires.length);
    wires.push({
      x1,
      y1,
      z1,
      x2,
      y2,
      z2,
      radius: radius > 0 ? radius : DEFAULT_RADIUS,
      // MMANA has several kinds of automatic segmentation; here there is one.
      segments: segments > 0 ? Math.round(segments) : -1,
    });
  }
  if (wires.length === 0) throw new Error("У файлі немає жодного дроту.");

  /** A pulse of the file on the wires that are kept, or `null` if it is not one or its wire is gone. */
  const pulse = (text: string): Pulse | null => {
    const parsed = parsePulse(text);
    const wire = parsed ? kept.get(parsed.wire) : undefined;
    return parsed && wire !== undefined ? { ...parsed, wire } : null;
  };

  // The sources: their number and a flag, then for each its pulse, phase and voltage.
  let source: Pulse = { wire: 0, place: "c" };
  const [sourceCount] = heading() ? numbers(next(), 1, "кількість джерел") : [0];
  const sourceLines = Array.from({ length: sourceCount }, next);
  if (sourceCount === 0) {
    notes.push("У файлі немає джерела: його поставлено в центр дроту 1.");
  } else {
    const [place] = fields(sourceLines[0]);
    const found = pulse(place);
    if (!found) throw new Error(`Не вдалося прочитати джерело: «${place}».`);
    source = found;
    if (sourceCount > 1) notes.push(`У файлі ${sourceCount} джерел: узято перше, ${place}.`);
  }

  // The loads: their number and whether they are in use, then for each its pulse, its type and the values of that type.
  const loads: Load[] = [];
  const [loadCount, loadsOn] = heading() ? numbers(next(), 2, "кількість навантажень") : [0, 1];
  for (let i = 0; i < loadCount; i++) {
    const line = next();
    const [place, type] = fields(line);
    const found = pulse(place ?? "");
    if (!found) throw new Error(`Не вдалося прочитати навантаження ${i + 1}: «${(line ?? "").trim()}».`);
    // The types: 0 for a coil and a capacitor, 1 for R + jX, 2 for a polynomial.
    const code = type ? Number(type) : NaN;
    if (code === 0) {
      const [inductance, capacitance, q] = numbers(line, 3, `навантаження ${i + 1}`, 2);
      loads.push({ kind: "lc", at: found, inductance, capacitance, q });
    } else if (code === 1) {
      const [resistance, reactance] = numbers(line, 2, `навантаження ${i + 1}`, 2);
      loads.push({ kind: "rx", at: found, resistance, reactance });
    } else {
      notes.push(`Навантаження ${i + 1} (${place}) задане многочленом: такі ще не підтримуються, його пропущено.`);
    }
  }
  if (loads.length > 0 && loadsOn === 0) notes.push("У файлі навантаження позначені вимкненими. Тут вони працюють: вилучіть зайві.");

  // The parameters of the segmentation of MMANA: this program has its own.
  if (heading()) next();

  // Ground, height to add, material, impedance of the line, and three values of the plots.
  const [groundCode, height, materialCode, reference] = heading() ? numbers(next(), 4, "рядок землі") : [0, 0, 0, base.reference];
  const kind = GROUNDS[groundCode];
  if (!kind) throw new Error(`Невідомий тип землі у файлі: ${groundCode}.`);
  if (kind === "real") notes.push("Параметри реальної землі у файлі не зберігаються: взято середню землю (ε = 13, σ = 0,005 См/м).");
  const material = MATERIALS[materialCode];
  if (!material) {
    notes.push(`Невідомий матеріал дротів у файлі (код ${materialCode}): узято дроти без втрат.`);
  } else if (material[1] === IRON) {
    notes.push("Матеріал дротів у файлі: залізо. Взято провідність 10 МСм/м без магнітних властивостей: справжні втрати більші.");
  } else if (material[1] > 0) {
    notes.push(`Матеріал дротів у файлі має код ${materialCode}: узято ${material[0]}.`);
  }

  // The sweep moves to the new frequency and keeps its width in proportion.
  const scale = frequency / base.frequency;
  const round = (value: number): number => Number(value.toPrecision(4));
  const sweep = { ...base.sweep, from: round(base.sweep.from * scale), to: round(base.sweep.to * scale) };
  const ground = { ...AVERAGE_GROUND, ...(kind === "real" ? {} : base.ground), kind };
  return {
    model: {
      name,
      wires,
      source,
      loads,
      frequency,
      ground,
      height,
      wireConductivity: material?.[1] ?? 0,
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
    notes.push(`Файл MMANA знає лише готові матеріали: замість вашої провідності записано найближчий, ${MATERIALS[material][0]}.`);
  }
  if (model.ground.kind === "real") notes.push("Параметри реальної землі у файлі MMANA не зберігаються.");
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
    row(1, 1),
    // The phase in degrees and the voltage.
    row(formatPulse(model.source), "0.0", "1.0"),
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
