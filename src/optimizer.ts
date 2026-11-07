import type { Summary } from "./analysis";
import type { LcLoad, Model, RxLoad, Wire } from "./model";

export type Axis = "x" | "y" | "z";

/** A part of a load that the optimizer can vary. */
export type LoadPart = "inductance" | "capacitance" | "resistance" | "reactance";

/** What the optimizer varies. Lengths are in metres, a phase in degrees, a load in its own units. */
export type Variable =
  /** The length of the straight element that a wire belongs to, kept about its centre. */
  | { kind: "length"; wire: number }
  /** The coordinate of the centre of that element along an axis. */
  | { kind: "position"; wire: number; axis: Axis }
  | { kind: "load"; load: number; part: LoadPart }
  | { kind: "phase"; source: number };

/** A variable with its limits and the step that the search begins with. */
export type Setting = Variable & { min: number; max: number; step: number };

/** How much every goal weighs; 0 leaves it out. `target` is the elevation in degrees that the goal `elevation` aims at. */
export interface Goals {
  gain: number;
  frontToBack: number;
  swr: number;
  reactance: number;
  elevation: number;
  target: number;
}

export const defaultGoals: Goals = { gain: 5, frontToBack: 3, swr: 5, reactance: 0, elevation: 0, target: 15 };

type Point = [number, number, number];

const ends = (wire: Wire): [Point, Point] => [
  [wire.x1, wire.y1, wire.z1],
  [wire.x2, wire.y2, wire.z2],
];
const distance = (p: Point, q: Point): number => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const length = (wire: Wire): number => distance(...ends(wire));

/** Wire ends closer than this part of the shorter wire are one point. */
const JOINED = 1e-6;

/** A wire of an element, and whether it runs against the element. */
interface Link {
  wire: number;
  reversed: boolean;
}

/**
 * The wires that make one straight element with the wire `index`: wires in
 * one line joined end to end, in order from one end of the element to the
 * other. A wire that meets no other in its line is an element of its own.
 */
export function element(wires: Wire[], index: number): Link[] {
  const chain: Link[] = [{ wire: index, reversed: false }];
  const used = new Set([index]);
  const direction = (wire: Wire): Point => {
    const [a, b] = ends(wire);
    const size = distance(a, b);
    return [(b[0] - a[0]) / size, (b[1] - a[1]) / size, (b[2] - a[2]) / size];
  };
  const line = direction(wires[index]);
  /** The next wire in the line at a point, if exactly one goes on from there. */
  const following = (at: Point, from: number): Link | null => {
    const found: Link[] = [];
    wires.forEach((wire, other) => {
      if (used.has(other) || !(length(wire) > 0)) return;
      const [a, b] = ends(wire);
      const near = JOINED * Math.min(length(wire), length(wires[from]));
      const [atStart, atEnd] = [distance(a, at) <= near, distance(b, at) <= near];
      if (!atStart && !atEnd) return;
      const d = direction(wire);
      if (Math.abs(Math.abs(d[0] * line[0] + d[1] * line[1] + d[2] * line[2]) - 1) > 1e-6) return;
      found.push({ wire: other, reversed: atEnd });
    });
    return found.length === 1 ? found[0] : null;
  };
  const far = (link: Link): Point => ends(wires[link.wire])[link.reversed ? 0 : 1];
  const near = (link: Link): Point => ends(wires[link.wire])[link.reversed ? 1 : 0];
  // Onwards from the end of the wire, then backwards from its beginning.
  for (let next = following(far(chain[0]), index); next; next = following(far(chain.at(-1)!), chain.at(-1)!.wire)) {
    chain.push(next);
    used.add(next.wire);
  }
  for (let next = following(near(chain[0]), index); next; next = following(near(chain[0]), chain[0].wire)) {
    // Seen from the front of the chain, the wire is walked the other way.
    chain.unshift({ wire: next.wire, reversed: !next.reversed });
    used.add(next.wire);
  }
  return chain;
}

/** The two outer ends of an element. */
function outerEnds(wires: Wire[], chain: Link[]): [Point, Point] {
  const first = chain[0];
  const last = chain.at(-1)!;
  return [ends(wires[first.wire])[first.reversed ? 1 : 0], ends(wires[last.wire])[last.reversed ? 0 : 1]];
}

/** A coordinate to the nearest nanometre, without the noise of binary fractions. */
const clean = (metres: number): number => Math.round(metres * 1e9) / 1e9 + 0;

/** A value of a variable to ten significant digits, without the noise of the sums of steps. */
const tidy = (value: number): number => Number(value.toPrecision(10));

/**
 * The wires with points moved: every wire end at a point `from` goes to its
 * `to`, so that wires joined there stay joined.
 */
function moved(wires: Wire[], moves: [from: Point, to: Point][]): Wire[] {
  return wires.map((wire) => {
    const [a, b] = ends(wire);
    const near = JOINED * length(wire);
    const place = (point: Point): Point => {
      const to = moves.find(([from]) => distance(from, point) <= near)?.[1];
      return to ? (to.map(clean) as Point) : point;
    };
    const [p, q] = [place(a), place(b)];
    return { ...wire, x1: p[0], y1: p[1], z1: p[2], x2: q[0], y2: q[1], z2: q[2] };
  });
}

const AXES: Axis[] = ["x", "y", "z"];

/** The value of a variable in a model. */
export function read(model: Model, variable: Variable): number {
  switch (variable.kind) {
    case "length": {
      const [a, b] = outerEnds(model.wires, element(model.wires, variable.wire));
      return distance(a, b);
    }
    case "position": {
      const [a, b] = outerEnds(model.wires, element(model.wires, variable.wire));
      const axis = AXES.indexOf(variable.axis);
      return (a[axis] + b[axis]) / 2;
    }
    case "load":
      return (model.loads[variable.load] as Partial<LcLoad & RxLoad>)[variable.part] ?? NaN;
    case "phase":
      return model.sources[variable.source].phase;
  }
}

/** The model with a variable set to a value. */
export function apply(model: Model, variable: Variable, value: number): Model {
  switch (variable.kind) {
    case "length": {
      // The outer ends move along the element; the joints inside it stay.
      const [a, b] = outerEnds(model.wires, element(model.wires, variable.wire));
      const size = distance(a, b);
      const centre: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      const along: Point = [(b[0] - a[0]) / size, (b[1] - a[1]) / size, (b[2] - a[2]) / size];
      const at = (sign: number): Point => [0, 1, 2].map((k) => centre[k] + (sign * along[k] * value) / 2) as Point;
      return { ...model, wires: moved(model.wires, [[a, at(-1)], [b, at(1)]]) };
    }
    case "position": {
      // Every point of the element moves, and so do the ends of other wires joined to it.
      const chain = element(model.wires, variable.wire);
      const axis = AXES.indexOf(variable.axis);
      const shift = value - read(model, variable);
      const points = chain.flatMap(({ wire }) => ends(model.wires[wire]));
      const unique = points.filter((point, index) => points.findIndex((other) => distance(other, point) === 0) === index);
      const moves = unique.map((point): [Point, Point] => [point, point.map((value, k) => (k === axis ? value + shift : value)) as Point]);
      return { ...model, wires: moved(model.wires, moves) };
    }
    case "load":
      return { ...model, loads: model.loads.map((load, index) => (index === variable.load ? { ...load, [variable.part]: value } : load)) };
    case "phase":
      return { ...model, sources: model.sources.map((source, index) => (index === variable.source ? { ...source, phase: value } : source)) };
  }
}

/** A variable in words, for the user. */
export function describe(variable: Variable): string {
  switch (variable.kind) {
    case "length":
      return `Довжина елемента з дротом ${variable.wire + 1}, м`;
    case "position":
      return `Положення елемента з дротом ${variable.wire + 1} по ${variable.axis.toUpperCase()}, м`;
    case "load": {
      const unit = { inductance: "L, мкГн", capacitance: "C, пФ", resistance: "R, Ом", reactance: "X, Ом" }[variable.part];
      return `Навантаження ${variable.load + 1}: ${unit}`;
    }
    case "phase":
      return `Фаза джерела ${variable.source + 1}, °`;
  }
}

/** Why the settings cannot be used with a model, in the language of the user; empty if they can. */
export function check(model: Model, settings: Setting[]): string[] {
  const problems: string[] = [];
  settings.forEach((setting, index) => {
    const name = `Змінна ${index + 1}`;
    if ((setting.kind === "length" || setting.kind === "position") && !model.wires[setting.wire]) {
      problems.push(`${name}: дроту ${setting.wire + 1} немає.`);
    } else if (setting.kind === "load") {
      const load = model.loads[setting.load];
      const fits = load && (load.kind === "lc" ? ["inductance", "capacitance"] : ["resistance", "reactance"]).includes(setting.part);
      if (!load) problems.push(`${name}: навантаження ${setting.load + 1} немає.`);
      else if (!fits) problems.push(`${name}: навантаження ${setting.load + 1} не має такої величини.`);
    } else if (setting.kind === "phase" && !model.sources[setting.source]) {
      problems.push(`${name}: джерела ${setting.source + 1} немає.`);
    }
    if (!(setting.min < setting.max)) problems.push(`${name}: «від» має бути меншим за «до».`);
    if (!(setting.step > 0)) problems.push(`${name}: крок має бути більшим за нуль.`);
    if (setting.kind === "length" && !(setting.min > 0)) problems.push(`${name}: довжина має бути більшою за нуль.`);
  });
  return problems;
}

/** F/B beyond this, in dB, gains nothing: a deep null at one angle is no use. */
const MOST_FRONT_TO_BACK = 30;

/**
 * The score of a result, to be made as large as possible: every goal gives
 * points, which its weight multiplies. A decibel of gain is a point, and so
 * are 3 dB of F/B, a halving of SWR - 1 near a match, 20 ohms of reactance
 * and 3 degrees of elevation off the target.
 */
export function score(summary: Summary, goals: Goals): number {
  const terms: [number, () => number][] = [
    [goals.gain, () => summary.gain],
    [goals.frontToBack, () => Math.min(summary.frontToBack ?? 0, MOST_FRONT_TO_BACK) / 3],
    [goals.swr, () => (Number.isFinite(summary.swr) ? -4 * Math.log2(summary.swr) : -Infinity)],
    [goals.reactance, () => -Math.abs(summary.impedance[1]) / 20],
    [goals.elevation, () => -Math.abs(summary.elevation - goals.target) / 3],
  ];
  return terms.reduce((total, [weight, points]) => (weight > 0 ? total + weight * points() : total), 0);
}

export interface Outcome<E> {
  model: Model;
  evaluation: E;
  score: number;
  evaluations: number;
  /** Why the search ended: no step improves any more, the limit of evaluations, or the user. */
  reason: "converged" | "limit" | "stopped";
}

/** The search ends when every step has shrunk this many times. */
const SHRINK = 32;

/**
 * Searches for the values of the variables that give the best score, as the
 * optimizer of MMANA does: every variable in turn takes a step either way,
 * and a step that improves the score is kept; when no step does, the steps
 * are halved. `evaluate` computes a model, or gives `null` for a model that
 * cannot be computed. `better` hears of every improvement.
 */
export async function optimize<E extends { summary: Summary }>(
  start: Model,
  settings: Setting[],
  goals: Goals,
  evaluate: (model: Model) => Promise<E | null>,
  better: (model: Model, evaluation: E, score: number, evaluations: number) => void,
  stopped: () => boolean,
  limit = 400,
): Promise<Outcome<E>> {
  const clamp = (value: number, { min, max }: Setting): number => Math.min(max, Math.max(min, value));
  // A start outside the limits is brought within them first.
  let current = settings.reduce((model, setting) => {
    const value = read(model, setting);
    return clamp(value, setting) === value ? model : apply(model, setting, clamp(value, setting));
  }, start);
  let evaluation = await evaluate(current);
  if (!evaluation) throw new Error("the model to optimize cannot be computed");
  let best = score(evaluation.summary, goals);
  let evaluations = 1;
  const steps = settings.map((setting) => setting.step);
  const directions = settings.map(() => 1);
  const outcome = (reason: Outcome<E>["reason"]): Outcome<E> => ({ model: current, evaluation: evaluation!, score: best, evaluations, reason });

  while (evaluations < limit) {
    let improved = false;
    for (let i = 0; i < settings.length; i++) {
      for (const sign of [directions[i], -directions[i]]) {
        if (stopped()) return outcome("stopped");
        if (evaluations >= limit) return outcome("limit");
        const now = read(current, settings[i]);
        const value = tidy(clamp(now + sign * steps[i], settings[i]));
        if (value === now) continue;
        const candidate = apply(current, settings[i], value);
        const result = await evaluate(candidate);
        evaluations++;
        const points = result ? score(result.summary, goals) : -Infinity;
        if (result && points > best + 1e-9) {
          [current, evaluation, best] = [candidate, result, points];
          directions[i] = sign;
          // A step that works grows a little, up to four times the first one.
          steps[i] = Math.min(steps[i] * 1.5, settings[i].step * 4);
          improved = true;
          better(current, result, best, evaluations);
          break;
        }
      }
    }
    if (!improved) {
      steps.forEach((_, i) => (steps[i] /= 2));
      if (steps.every((step, i) => step < settings[i].step / SHRINK)) return outcome("converged");
    }
  }
  return outcome("limit");
}
