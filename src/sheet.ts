import { element, placedWires, type Point } from "./geometry";
import type { Model, Wire } from "./model";
import { taperedElements } from "./taper";

/** A straight element of a model, as a build sheet lists it. */
export interface ElementRow {
  /** From 1, in the order of the first wire of every element. */
  number: number;
  /** Its wires by index, from one end to the other. */
  wires: number[];
  /** Metres. */
  length: number;
  centre: Point;
  /** From one end to the other, of length 1. */
  direction: Point;
  /** The diameter in metres of an element of one tube; `null` for tubes of several. */
  diameter: number | null;
  /**
   * The tubes of a symmetric element of several, from the centre outwards:
   * the centre tube once with its whole length, then every other tube with
   * the length of one of its two pieces. `null` for an element of one tube.
   */
  tubes: { length: number; diameter: number; pieces: 1 | 2 }[] | null;
}

const ends = (wire: Wire): [Point, Point] => [
  [wire.x1, wire.y1, wire.z1],
  [wire.x2, wire.y2, wire.z2],
];
const distance = (p: Point, q: Point): number => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

/** The straight elements of a model: wires in one line joined end to end, each wire in one element. */
export function elements(model: Model): ElementRow[] {
  const wires = placedWires(model);
  const tapered = taperedElements(wires);
  const seen = new Set<number>();
  const rows: ElementRow[] = [];
  wires.forEach((_, index) => {
    if (seen.has(index)) return;
    const chain = element(wires, index);
    chain.forEach((link) => seen.add(link.wire));
    const [first, last] = [chain[0], chain.at(-1)!];
    const a = ends(wires[first.wire])[first.reversed ? 1 : 0];
    const b = ends(wires[last.wire])[last.reversed ? 0 : 1];
    const length = distance(a, b);
    const direction: Point = length > 0 ? [(b[0] - a[0]) / length, (b[1] - a[1]) / length, (b[2] - a[2]) / length] : [0, 0, 0];
    const radii = new Set(chain.map((link) => wires[link.wire].radius));
    const taper = tapered.find((found) => found.wires.includes(index));
    rows.push({
      number: rows.length + 1,
      wires: chain.map((link) => link.wire),
      length,
      centre: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
      direction,
      diameter: radii.size === 1 ? 2 * wires[index].radius : null,
      tubes: taper
        ? taper.half.map((section, k) => ({ length: k === 0 ? 2 * section.length : section.length, diameter: 2 * section.radius, pieces: k === 0 ? 1 : 2 }))
        : null,
    });
  });
  return rows;
}

export type Axis = 0 | 1 | 2;
export const AXIS_NAMES = ["X", "Y", "Z"] as const;

/** Where the elements sit along a boom: positions from the first and the spacing from the one before, in metres. */
export interface Boom {
  axis: Axis;
  rows: { number: number; position: number; spacing: number | null }[];
}

/**
 * The layout of parallel elements along a boom, as of a Yagi: the axis along
 * which their centres spread most, across the elements. `null` unless there
 * are two elements or more and all of them are parallel.
 */
export function boom(rows: ElementRow[]): Boom | null {
  if (rows.length < 2) return null;
  const [d] = rows.map((row) => row.direction);
  const parallel = rows.every((row) => Math.abs(row.direction[0] * d[0] + row.direction[1] * d[1] + row.direction[2] * d[2]) > 0.999);
  if (!parallel) return null;
  // The axes across the elements, and of them the one along which the centres spread most.
  const across = ([0, 1, 2] as Axis[]).filter((axis) => Math.abs(d[axis]) < 0.1);
  if (across.length === 0) return null;
  const spread = (axis: Axis): number => Math.max(...rows.map((row) => row.centre[axis])) - Math.min(...rows.map((row) => row.centre[axis]));
  const axis = across.reduce((best, candidate) => (spread(candidate) > spread(best) ? candidate : best));
  if (!(spread(axis) > 0)) return null;
  const sorted = [...rows].sort((a, b) => a.centre[axis] - b.centre[axis]);
  const origin = sorted[0].centre[axis];
  return {
    axis,
    rows: sorted.map((row, k) => ({
      number: row.number,
      position: row.centre[axis] - origin,
      spacing: k === 0 ? null : row.centre[axis] - sorted[k - 1].centre[axis],
    })),
  };
}

/** The two axes of the drawing: those along which the wires reach farthest, in the order of the axes. */
export function planAxes(model: Model): [Axis, Axis] {
  const wires = placedWires(model);
  const extent = (axis: Axis): number => {
    const values = wires.flatMap((wire) => ends(wire).map((end) => end[axis]));
    return values.length > 0 ? Math.max(...values) - Math.min(...values) : 0;
  };
  const order = ([0, 1, 2] as Axis[]).sort((a, b) => extent(b) - extent(a) || a - b);
  const pair = [order[0], order[1]].sort((a, b) => a - b) as [Axis, Axis];
  return pair;
}

/** Millimetres for a builder: whole ones from a metre up, tenths below. */
export function millimetres(metres: number): string {
  const value = metres * 1000;
  return (Math.abs(value) >= 1000 ? Math.round(value).toString() : Number(value.toFixed(1)).toString()).replace("-", "−");
}

/** The direction of an element in words: along an axis, or its vector. */
export function directionText(direction: Point): string {
  const axis = direction.findIndex((value) => Math.abs(Math.abs(value) - 1) < 1e-6);
  if (axis >= 0) return `уздовж ${AXIS_NAMES[axis]}`;
  return `(${direction.map((value) => value.toFixed(3).replace("-", "−")).join("; ")})`;
}
