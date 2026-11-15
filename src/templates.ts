import type { Output } from "nec2-wasm";
import { ports } from "./analysis";
import { buildImpedanceDeck } from "./deck";
import type { Point } from "./geometry";
import type { Model, Source, Wire, WirePlace } from "./model";
import { wavelength } from "./segmentation";
import { N, t } from "./i18n";

/*
 * Templates: antennas made from a few numbers, cut to resonance by the engine
 * at the height they are given. The dimensions of the Yagis and the quads of
 * several elements were found with this program: its engine and a search
 * over gain, F/B and SWR (see the comments of the tables).
 */

export type TemplateKind = "dipole" | "invertedV" | "vertical" | "delta" | "quad" | "yagi";

/** What the user gives for a template. */
export interface TemplateInputs {
  kind: TemplateKind;
  /** MHz. */
  frequency: number;
  /** Metres: the height of the point that the antenna hangs from, which the kind names. */
  height: number;
  /** Millimetres: of the wire, or of the tubes of a Yagi. */
  diameter: number;
  /** Elements of a quad or a Yagi. */
  elements: number;
}

export interface Kind {
  kind: TemplateKind;
  name: string;
  /** The field of the height: what it is the height of. */
  heightLabel: string;
  /** The least and the most elements: one for an antenna of a single element. */
  elements: [number, number];
  /** What the antenna is, for a beginner. */
  description: string;
}

export const KINDS: Kind[] = [
  {
    kind: "dipole",
    name: N("Диполь"),
    heightLabel: N("Висота дроту, м"),
    elements: [1, 1],
    description: N("Горизонтальний дріт у півхвилі, живлення посередині. Випромінює в обидва боки поперек дроту."),
  },
  {
    kind: "invertedV",
    name: N("Інвертоване V"),
    heightLabel: N("Висота вершини, м"),
    elements: [1, 1],
    description: N("Диполь, кінці якого опущено на 30° від горизонту: досить однієї щогли. Опір 50–65 Ом, тож кабель 50 Ом підходить без узгодження."),
  },
  {
    kind: "vertical",
    name: N("Вертикал з радіалами"),
    heightLabel: N("Висота основи, м"),
    elements: [1, 1],
    description: N("Штир у чверть хвилі й чотири радіали, опущені на 45°. Випромінює однаково в усі боки під низьким кутом; опір близький до 50 Ом."),
  },
  {
    kind: "delta",
    name: N("Дельта"),
    heightLabel: N("Висота вершини, м"),
    elements: [1, 1],
    description: N("Рамка-трикутник у довжину хвилі, вершиною вгору, живлення посередині нижньої сторони. Опір понад 100 Ом: потрібен трансформатор, наприклад чвертьхвильовий з кабелю 75 Ом."),
  },
  {
    kind: "quad",
    name: N("Квадрат"),
    heightLabel: N("Висота центру рамок, м"),
    elements: [1, 3],
    description: N("Квадратні рамки в довжину хвилі на траверсі, живлення посередині нижньої сторони. Одна рамка випромінює в обидва боки, рефлектор і директор роблять антену спрямованою. Опір 90–130 Ом: потрібен трансформатор."),
  },
  {
    kind: "yagi",
    name: N("Yagi"),
    heightLabel: N("Висота траверси, м"),
    elements: [2, 6],
    description: N("Рефлектор, активний вібратор і директори на траверсі: спрямована антена. Розміри підібрано під кабель 50 Ом без узгодження."),
  },
];

export const kindOf = (kind: TemplateKind): Kind => KINDS.find((one) => one.kind === kind)!;

/** An antenna around the point of its height, the origin. */
interface Antenna {
  wires: Wire[];
  sources: Source[];
}

/** A wire between two points, its segments chosen by the program. */
const straight = ([x1, y1, z1]: Point, [x2, y2, z2]: Point, radius: number): Wire => ({ x1, y1, z1, x2, y2, z2, radius, segments: -1 });

const fedAt = (wire: number, place: WirePlace): Source[] => [{ at: { wire, place }, phase: 0, voltage: 1 }];

/** A dipole along Y, fed at its centre. */
export function dipole(length: number, radius: number): Antenna {
  return { wires: [straight([0, -length / 2, 0], [0, length / 2, 0], radius)], sources: fedAt(0, "c") };
}

/** The legs of an inverted V go down this far from the horizontal: 120 degrees between them. */
const LEG_DROOP = Math.PI / 6;

/** An inverted V along Y, legs of `leg` metres from its apex, fed at the apex. */
export function invertedV(leg: number, radius: number): Antenna {
  const end = (side: number): Point => [0, side * leg * Math.cos(LEG_DROOP), -leg * Math.sin(LEG_DROOP)];
  // Both wires run the same way, from one end through the apex to the other.
  return { wires: [straight(end(-1), [0, 0, 0], radius), straight([0, 0, 0], end(1), radius)], sources: fedAt(1, "b") };
}

/** The radials of a vertical go down this far from the horizontal. */
const RADIAL_DROOP = Math.PI / 4;

/** A vertical of `length` metres up from its base, fed there, with four radials as long, along X and Y. */
export function vertical(length: number, radius: number): Antenna {
  const out = length * Math.cos(RADIAL_DROOP);
  const down = -length * Math.sin(RADIAL_DROOP);
  const radials = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ].map(([x, y]) => straight([0, 0, 0], [x * out, y * out, down], radius));
  return { wires: [straight([0, 0, 0], [0, 0, length], radius), ...radials], sources: fedAt(0, "b") };
}

/** A delta loop: an equilateral triangle of the perimeter across X, its apex up at the origin, fed at the middle of its bottom side. */
export function delta(perimeter: number, radius: number): Antenna {
  const side = perimeter / 3;
  const bottom = (-side * Math.sqrt(3)) / 2;
  const left: Point = [0, -side / 2, bottom];
  const right: Point = [0, side / 2, bottom];
  const apex: Point = [0, 0, 0];
  return { wires: [straight(left, right, radius), straight(right, apex, radius), straight(apex, left, radius)], sources: fedAt(0, "c") };
}

/**
 * Square loops of the perimeters across X at the positions, centred on the X
 * axis; the loop `fed` is fed at the middle of its bottom side.
 */
export function quad(perimeters: number[], positions: number[], fed: number, radius: number): Antenna {
  const wires = perimeters.flatMap((perimeter, index) => {
    const half = perimeter / 8;
    const x = positions[index];
    const corners: Point[] = [
      [x, -half, -half],
      [x, half, -half],
      [x, half, half],
      [x, -half, half],
    ];
    return corners.map((corner, k) => straight(corner, corners[(k + 1) % 4], radius));
  });
  return { wires, sources: fedAt(4 * fed, "c") };
}

/** Yagi elements of the lengths along Y at the positions on X; the element `fed` is fed at its centre. */
export function yagi(lengths: number[], positions: number[], fed: number, radius: number): Antenna {
  const wires = lengths.map((length, index) => straight([positions[index], -length / 2, 0], [positions[index], length / 2, 0], radius));
  return { wires, sources: fedAt(fed, "c") };
}

/**
 * An array of elements: their sizes as parts of the size at which an element
 * alone is resonant in free space, and the distances from one to the next in
 * wavelengths. The first element is the reflector and the second, which is
 * fed, the driven element; its size is only where tuning starts.
 */
export interface Design {
  sizes: number[];
  gaps: number[];
}

/** The element that is fed: the second, after the reflector. */
export const FED = 1;

/** The positions of the elements on the boom in metres, the driven element at the origin. */
export function positions(gaps: number[], lambda: number): number[] {
  const along = [0];
  for (const gap of gaps) along.push(along.at(-1)! + gap * lambda);
  return along.map((x) => x - along[FED]);
}

/*
 * The tables were found with the engine of this program, in free space, for
 * elements a thousandth of a wavelength thick: the search of Nelder and Mead
 * from several starts, the driven element cut to resonance at every step.
 * It made the least gain over ±1.5 % around the frequency as large as it
 * could while the least F/B there stayed at its target and the SWR within
 * 1.5, on a 50-ohm line for a Yagi; a quad, whose impedance is about 100
 * ohms, on a line of its own resistance. The boom of a Yagi of 2 to 6
 * elements could be up to 0.2, 0.4, 0.6, 0.8 and 1 wavelength long.
 */

/** Yagis by their number of elements: F/B of at least 10 dB for two elements, 20 dB for three and four, 22 dB for more. */
export const YAGIS: Record<number, Design> = {
  2: { sizes: [1.0506, 0.9692], gaps: [0.1695] },
  3: { sizes: [1.0597, 1, 0.9198], gaps: [0.1791, 0.1613] },
  4: { sizes: [1.0509, 1.0204, 0.9696, 0.9036], gaps: [0.1372, 0.0756, 0.204] },
  5: { sizes: [1.0517, 1.001, 0.9593, 0.9618, 0.9246], gaps: [0.1579, 0.1493, 0.2503, 0.2424] },
  6: { sizes: [1.0533, 1.0186, 0.9867, 0.9625, 0.9504, 0.9223], gaps: [0.14, 0.067, 0.1799, 0.3154, 0.2621] },
};

/** Quads of several loops by their number: F/B of at least 15 dB for two loops and 20 dB for three. */
export const QUADS: Record<number, Design> = {
  2: { sizes: [1.011, 0.9376], gaps: [0.1503] },
  3: { sizes: [1.0188, 0.9786, 0.8865], gaps: [0.2533, 0.1344] },
};

/**
 * Where tuning starts, in wavelengths: the size at which the antenna, or an
 * element alone, is resonant in free space when its wire is a thousandth of
 * a wavelength thick. A dipole is the whole of it, an inverted V a leg, a
 * vertical its radiator and a loop its perimeter.
 */
const START = { dipole: 0.478, invertedV: 0.242, vertical: 0.235, delta: 1.09, quad: 1.08, yagi: 0.478 } as const;

/** The input impedance of a model; it throws, with the reason for the user, when the model cannot be computed. */
export type Impedance = (model: Model) => Promise<[number, number]>;

/** The input impedance by the engine that `run` gives: the worker of the page, or the engine itself in a test. */
export function impedanceBy(run: (deck: string) => Output | Promise<Output>): Impedance {
  return async (model) => {
    const deck = buildImpedanceDeck(model);
    if (deck.errors.length > 0) throw new Error(deck.errors.join(" "));
    const output = await run(deck.text);
    if (output.error) throw new Error(output.error);
    const port = ports(output.jobs[0].solutions[0], model.reference, deck.feeds).find((one) => one.impedance !== null);
    if (!port?.impedance) throw new Error(t("Ядро не дало вхідного опору."));
    return port.impedance;
  };
}

/** Reactance within this many ohms of zero is resonance. */
const RESONANT = 0.5;

/**
 * The size near `start` at which the model that `build` makes of it is
 * resonant, its input reactance zero: by the secant method, as the reactance
 * of an element grows with its size.
 */
async function resonate(build: (size: number) => Model, impedance: Impedance, start: number): Promise<number> {
  const reactance = async (size: number): Promise<number> => (await impedance(build(size)))[1];
  let [a, b] = [start, start * 0.98];
  let [xa, xb] = [await reactance(a), await reactance(b)];
  let best = Math.abs(xa) < Math.abs(xb) ? { size: a, x: xa } : { size: b, x: xb };
  for (let step = 0; step < 8 && Math.abs(best.x) > RESONANT && xa !== xb; step++) {
    const size = Math.min(1.2 * start, Math.max(0.8 * start, b - (xb * (b - a)) / (xb - xa)));
    const x = await reactance(size);
    [a, xa, b, xb] = [b, xb, size, x];
    if (Math.abs(x) < Math.abs(best.x)) best = { size, x };
  }
  return best.size;
}

/** The antenna of a kind at the sizes where tuning starts, for an element alone of `lone` metres. */
function nominal({ kind, elements }: TemplateInputs, lambda: number, lone: number, radius: number): Antenna {
  switch (kind) {
    case "dipole":
      return dipole(START.dipole * lambda, radius);
    case "invertedV":
      return invertedV(START.invertedV * lambda, radius);
    case "vertical":
      return vertical(START.vertical * lambda, radius);
    case "delta":
      return delta(START.delta * lambda, radius);
    case "quad":
      return elements === 1 ? quad([lone], [0], 0, radius) : array("quad", QUADS[elements], lambda, lone, radius);
    case "yagi":
      return array("yagi", YAGIS[elements], lambda, lone, radius);
  }
}

/**
 * How fast the reactance of an element grows with its size, as its
 * characteristic impedance over 120 ohms: ln(2L/d) - 1 for a straight element
 * and ln(P/d) for a loop. A thin wire is steep, a thick tube flat.
 */
const steepness = (kind: "yagi" | "quad", size: number, diameter: number): number =>
  kind === "quad" ? Math.log(size / diameter) : Math.log((2 * size) / diameter) - 1;

/**
 * The elements of a design for an element alone of `lone` metres; `driven`
 * sizes the driven element otherwise. A parasitic element works by its
 * reactance: on a wire thinner or thicker than that of the tables, it is
 * detuned less or more from `lone`, so that its reactance stays. The engine
 * finds that this keeps the F/B and the impedance of the designs from a
 * tenth to ten times the thickness of the tables.
 */
function array(kind: "yagi" | "quad", design: Design, lambda: number, lone: number, radius: number, driven?: number): Antenna {
  const detuning = radius > 0 ? steepness(kind, START[kind], 0.001) / steepness(kind, lone / lambda, (2 * radius) / lambda) : 1;
  const sizes = design.sizes.map((size, index) => (index === FED && driven !== undefined ? driven : (1 + (size - 1) * detuning) * lone));
  return (kind === "quad" ? quad : yagi)(sizes, positions(design.gaps, lambda), FED, radius);
}

/** The lowest point of the antenna under the point of its height may be no nearer to the ground than this part of a wavelength. */
const CLEARANCE = 0.02;

/** The least height of a kind at a frequency over a ground, in metres to a decimetre. */
export function leastHeight(inputs: TemplateInputs): number {
  const lambda = wavelength(inputs.frequency);
  // Tuning makes an antenna a few percent larger or smaller than where it starts.
  const antenna = nominal(inputs, lambda * 1.05, START[inputs.kind] * lambda * 1.05, 0);
  const lowest = Math.min(0, ...antenna.wires.flatMap((wire) => [wire.z1, wire.z2]));
  return Math.ceil((CLEARANCE * lambda - lowest) * 10) / 10;
}

/** Why a template cannot be made, in the language of the user; empty if it can. */
export function templateProblems(inputs: TemplateInputs, overGround: boolean): string[] {
  const { kind, frequency, height, diameter, elements } = inputs;
  const problems: string[] = [];
  if (!(frequency > 0)) problems.push(t("Частота має бути більшою за нуль."));
  if (!(diameter > 0)) problems.push(t("Діаметр має бути більшим за нуль."));
  // A kind of a single element has nothing to choose.
  const [least, most] = kindOf(kind).elements;
  if (most > least && (!Number.isInteger(elements) || elements < least || elements > most)) {
    problems.push(t("Елементів може бути від {least} до {most}.", { least, most }));
  }
  if (problems.length === 0 && overGround && !(height >= leastHeight(inputs))) {
    problems.push(t("На цій частоті антена не вміщається над землею: підніміть її щонайменше до {height} м.", { height: leastHeight(inputs) }));
  }
  return problems;
}

/** A number to significant digits. */
const digits = (value: number, count: number): number => Number(value.toPrecision(count));

/** The sweep of a template: four percent either way. */
const SPREAD = 0.04;

/**
 * The model of a template, its driven element cut to resonance at its height
 * by the engine. The ground, the metal and the feed line are those of `base`.
 */
export async function makeTemplate(inputs: TemplateInputs, base: Model, impedance: Impedance): Promise<Model> {
  const problems = templateProblems(inputs, base.ground.kind !== "free");
  if (problems.length > 0) throw new Error(problems.join(" "));
  const { kind, frequency, height, diameter } = inputs;
  const [least, most] = kindOf(kind).elements;
  const elements = most > least ? inputs.elements : least;
  const lambda = wavelength(frequency);
  const radius = diameter / 2000;
  // Coordinates to about a twenty-thousandth of a wavelength: a millimetre at short waves.
  const grain = 10 ** Math.floor(Math.log10(lambda / 20000));
  const round = (metres: number): number => Math.round(Math.round(metres / grain) * grain * 1e9) / 1e9 + 0;
  const kindName = t(kindOf(kind).name);
  const name =
    elements > 1
      ? t("{name}, {count} ел., {frequency} МГц", { name: kindName, count: elements, frequency })
      : t("{name}, {frequency} МГц", { name: kindName, frequency });
  const placed = ({ wires, sources }: Antenna): Model => ({
    ...base,
    name,
    frequency,
    height,
    loads: [],
    sources,
    wires: wires.map((wire) => ({
      ...wire,
      x1: round(wire.x1),
      y1: round(wire.y1),
      z1: round(wire.z1),
      x2: round(wire.x2),
      y2: round(wire.y2),
      z2: round(wire.z2),
    })),
    sweep: { from: digits(frequency * (1 - SPREAD), 3), to: digits(frequency * (1 + SPREAD), 3), points: 21 },
  });
  const tuned = async (build: (size: number) => Antenna, start: number): Promise<Model> =>
    placed(build(await resonate((size) => placed(build(size)), impedance, start)));
  // The size at which an element alone is resonant in free space, which the other elements of an array follow.
  const alone = (build: (size: number) => Antenna, start: number): Promise<number> =>
    resonate((size) => ({ ...placed(build(size)), ground: { ...base.ground, kind: "free" } }), impedance, start);

  switch (kind) {
    case "dipole":
      return tuned((size) => dipole(size, radius), START.dipole * lambda);
    case "invertedV":
      return tuned((size) => invertedV(size, radius), START.invertedV * lambda);
    case "vertical":
      return tuned((size) => vertical(size, radius), START.vertical * lambda);
    case "delta":
      return tuned((size) => delta(size, radius), START.delta * lambda);
    case "quad": {
      const loop = (size: number) => quad([size], [0], 0, radius);
      if (elements === 1) return tuned(loop, START.quad * lambda);
      const lone = await alone(loop, START.quad * lambda);
      const design = QUADS[elements];
      return tuned((size) => array("quad", design, lambda, lone, radius, size), design.sizes[FED] * lone);
    }
    case "yagi": {
      const lone = await alone((size) => yagi([size], [0], 0, radius), START.yagi * lambda);
      const design = YAGIS[elements];
      return tuned((size) => array("yagi", design, lambda, lone, radius, size), design.sizes[FED] * lone);
    }
  }
}
