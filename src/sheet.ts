import { element, placedWires, type Point } from "./geometry";
import type { Model, Wire } from "./model";
import { taperedElements } from "./taper";
import { t } from "./i18n";

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
  if (axis >= 0) return t("уздовж {axis}", { axis: AXIS_NAMES[axis] });
  return `(${direction.map((value) => value.toFixed(3).replace("-", "−")).join("; ")})`;
}

type Flat = [number, number];

/** A dimension on the drawing: its line with arrows at both ends, the lines out to what it measures, and its label. */
export interface Dimension {
  line: [Flat, Flat];
  extensions: [Flat, Flat][];
  label: { text: string; at: Flat; angle: number };
}

/** The dimensions and the numbers of the elements on a drawing. */
export interface Annotations {
  dimensions: Dimension[];
  numbers: { text: string; at: Flat }[];
}

/** Elements drawn shorter than this many units get no dimension: the label would not fit. */
const SHORTEST = 24;

/**
 * The dimensions of a drawing, in its own units: the length of every element
 * beside it, and, for elements along a boom that lies in the drawing, the
 * spacings between them in a chain beyond their ends and the whole length in
 * a second chain. `project` maps a point of the model to the drawing, whose
 * second coordinate grows downwards.
 */
export function planDimensions(rows: ElementRow[], layout: Boom | null, axes: [Axis, Axis], project: (point: Point) => Flat): Annotations {
  const dimensions: Dimension[] = [];
  const numbers: { text: string; at: Flat }[] = [];
  const along = (row: ElementRow, part: number): Point => row.centre.map((value, k) => value + (row.direction[k] * row.length * part) / 2) as Point;
  const add = (p: Flat, q: Flat, scale: number): Flat => [p[0] + q[0] * scale, p[1] + q[1] * scale];

  for (const row of rows) {
    const [p, q] = [project(along(row, -1)), project(along(row, 1))];
    const size = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (!(size > 0)) continue;
    // The direction on the drawing, turned to point right, or up when the element stands upright.
    let d: Flat = [(q[0] - p[0]) / size, (q[1] - p[1]) / size];
    if (d[0] < -1e-9 || (Math.abs(d[0]) <= 1e-9 && d[1] > 0)) d = [-d[0], -d[1]];
    const [start, end] = d[0] * (q[0] - p[0]) + d[1] * (q[1] - p[1]) >= 0 ? [p, q] : [q, p];
    numbers.push({ text: String(row.number), at: add(end, d, 12) });
    if (size < SHORTEST) continue;
    // Beside the element: to its right when it stands upright, below it when it lies.
    const n: Flat = [-d[1], d[0]];
    const offset = 14;
    const mid = add(start, d, size / 2);
    dimensions.push({
      line: [add(start, n, offset), add(end, n, offset)],
      extensions: [
        [add(start, n, 3), add(start, n, offset + 4)],
        [add(end, n, 3), add(end, n, offset + 4)],
      ],
      label: { text: millimetres(row.length), at: add(mid, n, offset + 8), angle: (Math.atan2(d[1], d[0]) * 180) / Math.PI },
    });
  }

  if (layout && axes.includes(layout.axis)) {
    const horizontal = layout.axis === axes[0];
    const byNumber = new Map(rows.map((row) => [row.number, row]));
    const ends = layout.rows.map(({ number }) => {
      const row = byNumber.get(number)!;
      return [project(along(row, -1)), project(along(row, 1))];
    });
    // The chains run below the drawing for a boom across it, to its left for a boom up it.
    const beyond = horizontal ? Math.max(...ends.flat().map((point) => point[1])) : Math.min(...ends.flat().map((point) => point[0]));
    const sign = horizontal ? 1 : -1;
    const centres = layout.rows.map(({ number }) => project(byNumber.get(number)!.centre));
    const placeOf = (point: Flat): number => (horizontal ? point[0] : point[1]);
    const at = (place: number, depth: number): Flat => (horizontal ? [place, beyond + sign * depth] : [beyond + sign * depth, place]);
    const near = ends.map((pair) => (horizontal ? Math.max(pair[0][1], pair[1][1]) : Math.min(pair[0][0], pair[1][0])));
    const chain = (depth: number, from: number, to: number, text: string): Dimension => {
      const [a, b] = [placeOf(centres[from]), placeOf(centres[to])];
      const label = at((a + b) / 2, depth - 7);
      return {
        line: [at(a, depth), at(b, depth)],
        extensions: [from, to].map((k): [Flat, Flat] => {
          const place = placeOf(centres[k]);
          const start: Flat = horizontal ? [place, near[k] + 3] : [near[k] - 3, place];
          return [start, at(place, depth + 4)];
        }),
        label: { text, at: label, angle: horizontal ? 0 : -90 },
      };
    };
    layout.rows.forEach((row, k) => {
      if (k > 0 && row.spacing !== null) dimensions.push(chain(26, k - 1, k, millimetres(row.spacing)));
    });
    if (layout.rows.length > 2) dimensions.push(chain(50, 0, layout.rows.length - 1, millimetres(layout.rows.at(-1)!.position)));
  }
  return { dimensions, numbers };
}
