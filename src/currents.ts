import type { Complex, Segment } from "nec2-wasm";
import type { Equivalent } from "./deck";
import { element, type Point } from "./geometry";
import type { Wire } from "./model";

/** The power fed into the antenna that the currents are given for, in watts. */
export const CURRENT_POWER = 100;

/** The current along an element: a wire, or wires that go on from each other in one line. */
export interface CurrentLine {
  /** Its wires in the model, by index from 0, from `from` to `to`. */
  wires: number[];
  /** Its ends. Distances run from the first, and a current is positive from the first towards the second. */
  from: Point;
  to: Point;
  length: number;
  /**
   * The current from end to end: the distance from `from` in metres, and the
   * current in amperes, the root mean square value at CURRENT_POWER watts.
   * The first and the last are the ends: nothing at a free end.
   */
  samples: { distance: number; current: Complex }[];
  /** Whether the engine computed it on Leeson's cylinder, whose current is stretched over the tubes here. */
  equivalent: boolean;
}

const distance = (p: Point, q: Point): number => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const middle = (p: Point, q: Point): Point => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
const unit = (p: Point, q: Point): Point => {
  const size = distance(p, q);
  return [(q[0] - p[0]) / size, (q[1] - p[1]) / size, (q[2] - p[2]) / size];
};
const dot = (u: Point, v: Point): number => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const ends = (wire: Wire): [Point, Point] => [
  [wire.x1, wire.y1, wire.z1],
  [wire.x2, wire.y2, wire.z2],
];

/** A height within this of zero is the ground itself, as in the deck. */
const ON_GROUND = 1e-9;

/**
 * The currents along the elements of a model as the engine computed them,
 * given for CURRENT_POWER watts fed into the antenna. `wires` are the wires
 * of the model as the deck placed and joined them, `segments` and `currents`
 * those of the engine, and `inputPower` the power that the sources of the
 * model gave there.
 */
export function currentLines(
  wires: Wire[],
  equivalents: Equivalent[],
  segments: Segment[],
  currents: Complex[],
  inputPower: number,
  overGround: boolean,
): CurrentLine[] {
  // The engine gives peak values for the voltages of the sources; an ammeter shows root mean square ones.
  const scale = (inputPower > 0 ? Math.sqrt(CURRENT_POWER / inputPower) : 1) / Math.SQRT2;
  const byTag = new Map<number, { centre: Point; direction: Point; current: Complex }[]>();
  segments.forEach((segment, index) => {
    const entry = { centre: middle(segment.end1, segment.end2), direction: unit(segment.end1, segment.end2), current: currents[index] };
    const ofTag = byTag.get(segment.tag);
    if (ofTag) ofTag.push(entry);
    else byTag.set(segment.tag, [entry]);
  });
  const replacedBy = new Map<number, Equivalent>();
  equivalents.forEach((one) => one.wires.forEach((wire) => replacedBy.set(wire, one)));

  const seen = new Set<number>();
  const lines: CurrentLine[] = [];
  wires.forEach((_, index) => {
    if (seen.has(index)) return;
    const chain = element(wires, index);
    chain.forEach(({ wire }) => seen.add(wire));
    const members = chain.map(({ wire }) => wire);
    const [first, last] = [chain[0], chain.at(-1)!];
    const from = ends(wires[first.wire])[first.reversed ? 1 : 0];
    const to = ends(wires[last.wire])[last.reversed ? 0 : 1];
    const length = distance(from, to);
    const axis = unit(from, to);

    const samples: CurrentLine["samples"] = [];
    const take = (direction: Point, current: Complex, at: Point) => {
      const sign = dot(direction, axis) < 0 ? -scale : scale;
      samples.push({ distance: dot([at[0] - from[0], at[1] - from[1], at[2] - from[2]], axis), current: [sign * current[0], sign * current[1]] });
    };
    const equivalent = replacedBy.get(members[0]);
    if (equivalent) {
      // Leeson's cylinder is a little shorter than the element: its current is stretched over the tubes.
      const [a, b] = equivalent.ends;
      const centre = middle(a, b);
      const along = unit(a, b);
      const stretch = distance(a, b) / equivalent.length;
      for (const { centre: at, direction, current } of byTag.get(equivalent.tag) ?? []) {
        const offset = dot([at[0] - centre[0], at[1] - centre[1], at[2] - centre[2]], along) * stretch;
        take(direction, current, [centre[0] + along[0] * offset, centre[1] + along[1] * offset, centre[2] + along[2] * offset]);
      }
    } else {
      for (const wire of members) for (const { centre, direction, current } of byTag.get(wire + 1) ?? []) take(direction, current, centre);
    }
    if (samples.length === 0) return;
    samples.sort((p, q) => p.distance - q.distance);

    // At a free end the current falls to nothing; at a joint or on the ground it goes on.
    const near = 1e-9 * Math.max(1, length);
    const free = (point: Point): boolean =>
      !(overGround && Math.abs(point[2]) < ON_GROUND) &&
      !wires.some((wire, other) => !members.includes(other) && ends(wire).some((end) => distance(end, point) <= near));
    const head: Complex = free(from) ? [0, 0] : samples[0].current;
    const tail: Complex = free(to) ? [0, 0] : samples.at(-1)!.current;
    lines.push({
      wires: members,
      from,
      to,
      length,
      samples: [{ distance: 0, current: head }, ...samples, { distance: length, current: tail }],
      equivalent: Boolean(equivalent),
    });
  });
  return lines;
}

/** The magnitude of a current. */
export const magnitude = ([re, im]: Complex): number => Math.hypot(re, im);

/** The phase of a current in degrees. */
export const phase = ([re, im]: Complex): number => (Math.atan2(im, re) * 180) / Math.PI;

/** Phases in degrees made continuous: no jump of 360 degrees between two neighbours. */
export function unwrap(phases: number[]): number[] {
  const result: number[] = [];
  for (const value of phases) {
    const before = result.at(-1);
    result.push(before === undefined ? value : value + 360 * Math.round((before - value) / 360));
  }
  return result;
}
