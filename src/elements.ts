import { element, type Point } from "./geometry";
import type { Model, Pulse, Wire } from "./model";
import { apply } from "./optimizer";
import { elements, type ElementRow } from "./sheet";
import { wavelength } from "./segmentation";

/*
 * Editing a model by its elements, as the Yagi editor of the page does:
 * the length of an element, where it stands, a copy of it and its removal.
 */

const ends = (wire: Wire): [Point, Point] => [
  [wire.x1, wire.y1, wire.z1],
  [wire.x2, wire.y2, wire.z2],
];
const distance = (p: Point, q: Point): number => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const dot = (u: Point, v: Point): number => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const unit = (v: Point): Point => {
  const size = Math.hypot(...v);
  return [v[0] / size, v[1] / size, v[2] / size];
};

/** The elements of a model in its own coordinates: those of the table of wires, without the added height. */
export const elementRows = (model: Model): ElementRow[] => elements({ ...model, height: 0 });

/**
 * The model without some of its wires. Sources and loads on them go too,
 * and those on later wires keep standing on the same wires.
 */
export function removeWires(model: Model, indices: number[]): Model {
  const gone = new Set(indices);
  const after = (wire: number): number => wire - indices.filter((index) => index < wire).length;
  const keep = <T extends { at: Pulse }>(items: T[]): T[] =>
    items.filter((item) => !gone.has(item.at.wire)).map((item) => ({ ...item, at: { ...item.at, wire: after(item.at.wire) } }));
  return { ...model, wires: model.wires.filter((_, index) => !gone.has(index)), sources: keep(model.sources), loads: keep(model.loads) };
}

/**
 * The shortest length that an element may take: its outer ends must stay
 * beyond the joints inside it, or its tubes would turn over.
 */
export function shortestLength(model: Model, wire: number): number {
  const chain = element(model.wires, wire);
  const first = chain[0];
  const last = chain.at(-1)!;
  const a = ends(model.wires[first.wire])[first.reversed ? 1 : 0];
  const b = ends(model.wires[last.wire])[last.reversed ? 0 : 1];
  const centre: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  // The joints are the ends of the wires that are not the outer ends.
  const joints = chain.flatMap(({ wire: index }) => ends(model.wires[index])).filter((point) => distance(point, a) > 0 && distance(point, b) > 0);
  return 2 * Math.max(0, ...joints.map((point) => distance(point, centre)));
}

/** The model with an element of a new length, symmetric about its centre; `null` if the length is too short for its tubes. */
export function setLength(model: Model, wire: number, length: number): Model | null {
  if (!(length > shortestLength(model, wire) * (1 + 1e-9))) return null;
  return apply(model, { kind: "length", wire }, length);
}

/** The model with an element moved so that its centre has a coordinate. */
export function setCentre(model: Model, wire: number, axis: "x" | "y" | "z", value: number): Model {
  return apply(model, { kind: "position", wire, axis }, value);
}

/** The model with every wire of an element of one radius. */
export function setRadius(model: Model, wires: number[], radius: number): Model {
  return { ...model, wires: model.wires.map((wire, index) => (wires.includes(index) ? { ...wire, radius } : wire)) };
}

/**
 * Where a copy of an element goes, as a shift from where it is: one spacing
 * beyond the last of the elements parallel to it, along the line through
 * their centres, as a new director; with no other such element, a tenth of a
 * wavelength and a half aside, across the element and level.
 */
export function copyShift(model: Model, rows: ElementRow[], row: ElementRow): Point {
  const parallel = rows.filter((other) => other.length > 0 && Math.abs(dot(other.direction, row.direction)) > 0.999);
  if (parallel.length >= 2) {
    // The line of the boom: through the two centres farthest apart.
    let [p, q] = [parallel[0], parallel[1]];
    for (const one of parallel) for (const other of parallel) if (distance(one.centre, other.centre) > distance(p.centre, q.centre)) [p, q] = [one, other];
    const along = unit([q.centre[0] - p.centre[0], q.centre[1] - p.centre[1], q.centre[2] - p.centre[2]]);
    const sorted = [...parallel].sort((one, other) => dot(one.centre, along) - dot(other.centre, along));
    const [before, last] = [sorted.at(-2)!, sorted.at(-1)!];
    const spacing = dot([last.centre[0] - before.centre[0], last.centre[1] - before.centre[1], last.centre[2] - before.centre[2]], along);
    return [0, 1, 2].map((k) => last.centre[k] + along[k] * spacing - row.centre[k]) as Point;
  }
  const level: Point = [row.direction[1], -row.direction[0], 0];
  const across = Math.hypot(...level) > 0.1 ? unit(level) : ([1, 0, 0] as Point);
  const step = 0.15 * wavelength(model.frequency);
  return [across[0] * step, across[1] * step, across[2] * step];
}

/** The model with a copy of an element shifted, its wires after all the others; the copy has no sources or loads. */
export function copyElement(model: Model, wires: number[], shift: Point): Model {
  const copies = wires.map((index) => {
    const wire = model.wires[index];
    const move = (value: number, k: number): number => Math.round((value + shift[k]) * 1e9) / 1e9 + 0;
    return { ...wire, x1: move(wire.x1, 0), y1: move(wire.y1, 1), z1: move(wire.z1, 2), x2: move(wire.x2, 0), y2: move(wire.y2, 1), z2: move(wire.z2, 2) };
  });
  return { ...model, wires: [...model.wires, ...copies] };
}
